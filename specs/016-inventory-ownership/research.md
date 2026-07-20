# Research: Inventory Ownership & Duplication (Slice 16)

All items below were resolved through direct reading of the current
codebase (confirmed against the live schema, not just migration history)
and the field-feedback conversation that produced this slice — no
unknowns remain in the Technical Context.

## R1 — The import mechanism must change from a fixed server path to a per-inventory upload

**Decision**: `POST /inventories/{id}/import-xlsx` accepts a multipart file
upload; the uploaded bytes are stored in a new `inventories.source_xlsx`
BLOB column (plus `source_filename` for display) and immediately parsed.
`service.InventoryService.ImportFromXLSX` changes from taking a file
`path string` to an `io.Reader` — `excelize.OpenReader(r)` is a drop-in
replacement for `excelize.OpenFile(path)`, confirmed as the library's
existing counterpart API, so this is a small, mechanical signature change,
not a rewrite.

**Rationale**: Confirmed via direct reading that `internal/api/inventory.go`'s
`importXLSX` handler and `internal/api/rental.go`'s export handlers both
call a shared `inventoryFilePath()` that reads one fixed, server-configured
path (`INVENTORY_PATH` env var, default `../LL.xlsx`) — there is no
per-request file input today at all. This was a reasonable design for a
single-user, single-catalog tool, but is fundamentally incompatible with
"each user has their own inventory": there is no way for a hosted,
multi-user app to let two different users' imports read two different
server filesystem paths without exposing filesystem access to users,
which nothing about this app does or should.

**Alternatives considered**:
- Keep a filesystem path per inventory (e.g. `./data/inventories/{id}.xlsx`)
  instead of a DB blob — rejected: adds a file-storage concern (backup,
  cleanup on delete, path collisions) for no benefit over a BLOB column,
  when "SQLite is the only database" (Principle V) already covers small
  binary storage adequately for a file this size (a price-list spreadsheet,
  not a media asset).

## R2 — Rental export must read the correct inventory's template, from memory, not a fixed disk path

**Decision**: `internal/api/rental.go`'s `exportFile`/`exportReport` handlers
resolve the event's bound `inventory_id`, fetch that inventory's
`source_xlsx` BLOB, and pass it to `excelize.OpenReader` (via
`bytes.NewReader`) instead of calling `inventoryFilePath()` +
`excelize.OpenFile`. `BuildRentalExport` itself already takes an opened
`*excelize.File` it never writes back to disk (confirmed: the returned
workbook lives in memory until streamed to the HTTP response, per its own
existing doc comment) — so this change is isolated to how the file is
*opened*, not how the export logic works.

**Rationale**: `xlsx_row` (stored per `inventory_items` row) only means
anything relative to the specific spreadsheet it was imported from. Once
different users' inventories come from different spreadsheets, the export
must use the *matching* template for whichever inventory the event is
bound to, not one global file. Storing the source bytes alongside the
catalog they produced (R1) is what makes this resolvable per-inventory.

## R3 — Access model splits into two surfaces with very different rules

**Decision**: Two distinct access patterns, not one:
1. **Direct inventory management** (`/inventories/{id}/...` — create,
   rename, delete, duplicate, category/item CRUD, re-import,
   fixture-modes): owner-only, all methods, via a new
   `RequireInventoryOwner` middleware. No viewer/contributor concept here
   at all — you either own the inventory or you don't.
2. **Reading an inventory through an event** (`GET /events/{eventID}/inventory/categories`
   and `.../items` — what every existing planning picker actually calls):
   gated by the **already-existing** `middleware.RequireEventAccess`
   (Slice 15) — any role on the event (owner/contributor/viewer) can read,
   because the handler resolves the event's bound `inventory_id` itself
   and serves that inventory's contents. **No new middleware is needed for
   this path at all** — it's a pure consequence of reusing Slice 15's
   existing event-access gate on a new pair of routes.

**Rationale**: The user's own framing — "contributors gain access to the
owner's inventory when invited [to the event]" — describes access flowing
*through* event membership, not a separate inventory-level invite system.
Recognizing that `RequireEventAccess`'s existing GET-allows-any-role rule
already expresses exactly "read access follows from having a role on the
event" (FR-006) means the picker-facing read path needs zero new
authorization code — only the owner-only management surface does.

**Alternatives considered**:
- One `RequireInventoryAccess` middleware mirroring `RequireEventAccess`'s
  owner/contributor/viewer role resolution directly on `/inventories/{id}`
  — rejected: would require deriving an inventory's effective "role" by
  looking up every event bound to it and unioning their memberships, more
  complex than routing picker reads through the event the caller already
  has a resolved role on.

## R4 — Ensuring every user has an inventory unifies two cases into one function

**Decision**: `db.EnsureUserHasInventory(database, userID) error`, called
on every login (alongside Slice 15's `ClaimOwnerlessEvents`):
1. If the user already owns ≥1 inventory, no-op.
2. Otherwise, atomically claim one ownerless inventory if any exists
   (`UPDATE inventories SET owner_user_id = ? WHERE id = (SELECT id FROM inventories WHERE owner_user_id IS NULL LIMIT 1)`).
3. Otherwise (no ownerless inventory existed to claim), insert a fresh
   empty inventory owned by this user.

**Rationale**: This single function covers both "the very first user
after this ships claims the legacy bootstrap inventory" and "every
subsequent new user gets their own empty starter inventory" as one
idempotent operation, rather than two separate mechanisms — simpler than
Slice 15's original two-part framing and consistent with R3 there (the
`WHERE`/subquery guard is itself the correctness mechanism, no separate
"am I first" check needed).

## R5 — Legacy bootstrap: one pre-existing inventory, backfilled deterministically

**Decision**: Migration `038_inventory_ownership` creates exactly one
`inventories` row (owner_user_id NULL, name "Imported catalog") and
backfills every existing `inventory_categories`/`inventory_items` row's
new `inventory_id` column to point at it, plus every existing event's new
`inventory_id` column to the same row — all pure SQL, since there is only
ever one row to backfill onto and it requires no per-user decision. A
one-time Go conversion (the established Slices 11–13 pattern, sequenced
in `db.go`) then reads whatever file currently sits at `INVENTORY_PATH`
(if any) and stores its bytes into that bootstrap row's `source_xlsx` —
if no file is present (e.g. a fresh dev checkout), the column stays NULL
and the inventory works fine, just needs a fresh upload before its next
re-import/export.

**Rationale**: Unlike ownership claiming (R4, which depends on *who* logs
in first and so can't be pure SQL), backfilling the *existing single*
catalog's new FK columns needs no such judgment call — there is exactly
one inventory and one set of pre-existing rows, so a plain `UPDATE ... SET
inventory_id = (that id)` is fully deterministic and belongs in the SQL
migration itself, not app logic.

## R6 — Cross-inventory data integrity needs one reusable validation helper, not per-table logic

**Decision**: `db.ItemBelongsToInventory(database *sql.DB, itemID, inventoryID int64) (bool, error)`
— one small, reusable query (`SELECT 1 FROM inventory_items WHERE id = ? AND inventory_id = ?`).
Every existing handler that accepts a picked inventory item id in its
request body (stagebox/stage-multi/lighting-fixture/truss-piece
`inventory_item_id`, input-source `mic_item_id`/`stand_item_id`,
input-device `inventory_item_id`, input/output-cable `cable_item_id`,
output-device `inventory_item_id`, manual rental line
`inventory_item_id`) calls this helper once, resolving the event's bound
`inventory_id` first, and 400s on mismatch.

**Rationale**: Confirmed via direct reading that none of the 11 tables
carrying a direct FK to `inventory_items(id)` need any *schema* change —
item ids stay globally unique regardless of which inventory owns them, so
existing foreign keys keep working unmodified. The only new risk Slice 16
introduces is a picker accepting an item from the *wrong* inventory (one
the event isn't bound to) — a single reusable validation call, added at
each existing create/update entry point, closes this without restructuring
any of those 11 tables. This is a mechanical, bounded, multi-file pass
(similar in shape to the earlier viewer-hiding UI fix), not a data-model
change.

**Alternatives considered**:
- A SQL-level composite/trigger-based constraint tying each of the 11
  tables' item columns to their owning event's `inventory_id` — rejected:
  SQLite has no clean way to express "this FK's target must share a
  property with a value looked up via a different table's FK" declaratively;
  a Go-level check at the point of assignment is the established pattern
  this project already uses for comparable cross-entity invariants.

## R7 — Duplication copies the source template too

**Decision**: `POST /inventories/{id}/duplicate` deep-copies categories,
items (new ids, same names/prices/`xlsx_row`/discontinued flags), each
item's `fixture_modes`, **and** the source inventory's `source_xlsx`/
`source_filename` blob — into a new `inventories` row owned by the same
caller.

**Rationale**: A duplicate is meant to be a fully independent but
functionally equivalent starting point (per spec.md's User Story 2); if
it didn't carry the source template forward, the copy would be unable to
export correctly (R2) until someone manually re-uploaded the same file
again — a needless papercut for something duplication is supposed to make
easier, not harder.

## Constitution check

No amendment needed. Principle IV ("every piece of rented equipment MUST
reference an inventory item from the catalog... the export feature MUST
write quantities back into the LL.xlsx template") holds unchanged — it's
now per-owner-inventory instead of one global catalog, which is an
extension of the principle's intent, not a violation of its text. Storing
the uploaded template as a BLOB keeps Principle V's "SQLite is the only
database" intact — no new file-storage service.
