# Data Model: Inventory Ownership & Duplication (Slice 16)

Migration `038_inventory_ownership` — additive (one new table, two new
FK columns), plus a one-time Go conversion for the legacy template file
(research.md R5). No changes to the 11 existing tables that already
reference `inventory_items(id)` — their FKs keep working unmodified since
item ids stay globally unique regardless of which inventory owns them.

## `inventories` (new)

| Column            | Type     | Notes                                                          |
|-------------------|----------|-------------------------------------------------------------------|
| `id`              | INTEGER  | PRIMARY KEY AUTOINCREMENT                                          |
| `owner_user_id`   | INTEGER  | REFERENCES users(id), nullable — the one legacy bootstrap row starts NULL, claimed on first login (research.md R4) |
| `name`            | TEXT     | NOT NULL — e.g. "My Inventory", user-editable                     |
| `source_xlsx`     | BLOB     | nullable — the uploaded price-list file this catalog was imported from (research.md R1) |
| `source_filename` | TEXT     | nullable — original filename, for display ("last imported: LL-2026.xlsx") |
| `created_at`      | DATETIME | DEFAULT CURRENT_TIMESTAMP                                          |

## `inventory_categories` / `inventory_items` (extended)

Both gain `inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE`.
Every existing column is unchanged. The bootstrap migration backfills
every pre-existing row to the one legacy `inventories` row (research.md
R5) — deterministic, pure SQL, no per-user judgment needed.

`UpsertInventory` (re-import) and every read query in `internal/db/inventory.go`
gain an `inventory_id = ?` filter — today's global `UPDATE inventory_items
SET discontinued = 1` and unscoped `SELECT` calls would otherwise touch
every user's catalog at once, which was harmless when there was only one
catalog and becomes a real cross-tenant bug the moment there's more than
one.

## `events` (extended)

Gains `inventory_id INTEGER REFERENCES inventories(id)` — nullable at the
schema level (matching `owner_user_id`'s Slice 15 precedent), but every
event created after this slice always has one (required at creation,
validated to be an inventory the creator owns). Pre-existing events are
backfilled to the one legacy inventory in the same deterministic SQL pass
as above (research.md R5) — no login-dependent bootstrap needed here
either, since there's only one inventory any pre-existing event could
possibly have been using.

## Non-persisted concept: cross-inventory validation

Spec.md's FR-009 ("an event can't select equipment from an inventory it
isn't bound to") is enforced at write time, not stored as a constraint —
`db.ItemBelongsToInventory(itemID, inventoryID)` (research.md R6), called
by every existing handler that accepts a picked catalog item id, resolving
the event's bound `inventory_id` first. No schema change on any of the 11
existing FK-carrying tables.

## `fixture_modes` (unchanged schema, new duplication behavior)

Already scoped to `inventory_item_id` (Slice 4) with `ON DELETE CASCADE`.
Duplicating an inventory (`POST /inventories/{id}/duplicate`) must
explicitly re-insert each source item's modes against the *new* item id
in the copy — cascade delete doesn't help here since this is a copy, not
a delete; there is no existing "copy modes" helper, this is new logic in
the duplication service function.
