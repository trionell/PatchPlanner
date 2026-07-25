# Phase 0 Research: Generic Inventory Formats, Manual Entry & PDF Rental Order

**Feature**: `022-generic-inventory-formats` | **Date**: 2026-07-25

---

## R1 — How does an inventory declare which export formats it offers?

**Decision**: Add `inventories.source_format TEXT` with the values `'ll'`, `'generic'`, or
`NULL` (populated by hand / never imported). The supplier price-list export is gated on
`source_format = 'll'`.

**Rationale**: The gate cannot be derived from what is already stored. Today
`BuildRentalExport` gates on `source_xlsx IS NOT NULL`
(`backend/internal/service/rental_export.go:55`), which works only because the LL importer is
the only thing that ever writes that blob. The moment a second importer exists, "has bytes"
and "has an LL price list" stop being the same statement, and an explicit discriminator is
the only honest way to express the difference. Storing it on the inventory rather than
inferring it per-export also means the frontend can hide the button, which the project
requires: restricted actions must be hidden client-side, not merely rejected by the backend.

Backfill is unambiguous — every existing inventory holding a blob got it from the LL
importer, so `UPDATE inventories SET source_format = 'll' WHERE source_xlsx IS NOT NULL`
is exact, with no per-user judgment needed (the same reasoning that kept migration 038 pure
SQL).

**Alternatives considered**:

- *Sniff the stored blob at export time* (open it, look for a `Prislista LL` sheet). Rejected:
  it makes every export do file I/O to answer a question the database should already know,
  and it cannot answer the question at all for the frontend, which needs to decide whether to
  render a button.
- *Keep gating on `source_xlsx IS NOT NULL` and simply never store bytes for generic imports.*
  Rejected as too clever: it encodes the rule as an absence, so the first future feature that
  wants to retain a generic upload (for re-download, say) would silently re-enable a
  meaningless LL export.
- *A separate `inventory_sources` table.* Rejected under Principle V — one nullable column
  answers the question; a table is speculative infrastructure.

---

## R2 — How do hand-entered items survive a later spreadsheet import?

**Decision**: Add `inventory_items.is_manual INTEGER NOT NULL DEFAULT 0`. `UpsertInventory`
excludes manual items from both the blanket discontinue sweep and the name-matching pool.

**Rationale**: This is the sharpest correctness risk in the slice. `UpsertInventory`
(`backend/internal/db/inventory.go:154`) marks **every** item in the inventory discontinued
and then revives whatever the file contains:

```go
// Every item in this inventory starts presumed gone; each incoming
// row revives or inserts.
tx.Exec(`UPDATE inventory_items SET discontinued = 1 WHERE inventory_id = ?`, inventoryID)
```

That design is correct for a catalog that is wholly a mirror of one file. Once items can also
originate outside any file, it silently deletes user data (discontinued items vanish from
planning dropdowns) on the next import. The sweep must therefore become
`... AND is_manual = 0`.

The second half matters just as much and is easy to miss: `loadItemIDsByName` (`:239`) builds
the pool of existing rows an incoming row may claim. If a manual item shares a name with an
imported row, the import would otherwise *adopt* the manual row — overwriting its price and
quantity and flipping it to imported. Excluding manual items from the pool keeps the two
populations disjoint. The cost is a possible duplicate-by-name pair, which is visible and
user-fixable; the alternative is invisible data loss.

**Alternatives considered**:

- *Infer "manual" from `xlsx_row IS NULL`.* Rejected: generic-format imports also have no
  meaningful sheet row, so the two populations would be indistinguishable — exactly the
  conflation this column exists to prevent.
- *Merge same-name manual and imported rows.* Rejected: it silently discards whichever
  price/quantity the user did not expect to lose, and there is no rule that reliably picks
  the right winner.

---

## R3 — Which PDF library, and does it meet the layout requirements?

**Decision**: `github.com/go-pdf/fpdf v0.9.0`.

**Rationale**: Verified by spike rather than assumed. A throwaway module rendering 120 rows
of representative data confirmed every requirement the spec places on the PDF:

| Requirement | Result |
|---|---|
| Builds without CGO (FR — the project chose `modernc.org/sqlite` to stay CGO-free) | `CGO_ENABLED=0 go build` succeeds |
| Valid output | File begins `%PDF-1.3` |
| Repeating column headers (FR-029) | `SetHeaderFunc` — headers reprinted on all 3 pages |
| Page numbering (FR-029) | `SetFooterFunc` + `AliasNbPages("{nb}")` gives "Page N of M" |
| Swedish characters (FR-030) | `UnicodeTranslatorFromDescriptor("cp1252")` — `Högtalare & rökmaskin ä ö å É` extracted back byte-correct |
| Table primitives | `CellFormat` with per-cell width/border/alignment covers the whole layout |

**Dependency weight — an important correction.** `go get` adds six modules to the graph
(`fpdf` plus `boombuler/barcode`, `phpdave11/gofpdi`, `pkg/errors`, `ruudk/golang-pdf417`,
`golang.org/x/image`). That looked like a significant cost, but `go list -deps` on the spike
shows only `github.com/go-pdf/fpdf` is actually compiled in — the others back optional
subpackages (barcode rendering, PDF template import) that this feature never imports. So
`go.mod`/`go.sum` grow by six lines while the shipped binary grows by one library. This
distinction is recorded because a reviewer reading `go.mod` would otherwise reasonably
object.

**Font choice**: built-in Helvetica with a cp1252 translator, so no font files are embedded
and the binary stays small. The consequence is a hard constraint on the layout: **only
cp1252-representable characters may be drawn**. `å ä ö é` are fine; `▲`, `–` (en dash) and `·`
are not. Status markers therefore use ASCII (`*`) and the header separator uses a plain
hyphen. This is a genuine design constraint, not a detail — a stray en dash in a heading
would render as garbage.

**Alternatives considered**:

- *Browser print-to-PDF*, reusing the existing `components/print/` sheets and `window.print()`.
  Rejected by explicit user decision: the document is sent to a third party, so its layout
  must not vary by browser, and browsers inject their own headers/footers unless the user
  disables them manually. This was weighed directly against the server-side option.
- *`github.com/phpdave11/gofpdf`* (v1.4.3). Viable and API-compatible, kept as the fallback,
  but `go-pdf/fpdf` is the more actively maintained fork of the same lineage.
- *`maroto/v2`*. Rejected: a higher-level layout DSL that wraps gofpdf anyway, adding
  abstraction for a layout we already know precisely.
- *Embedding a Unicode TTF* to lift the cp1252 restriction. Rejected under YAGNI — the
  domain is Swedish and English equipment names, which cp1252 covers, and embedding fonts
  would add hundreds of KB to a binary that is deployed as a single artifact.

---

## R4 — Generic spreadsheet parsing strategy

**Decision**: Locate columns by normalized header text with an alias table; resolve the sheet
as "`Inventory` if present, else the first sheet"; validate the whole file before writing
anything.

**Rationale**: Position-based parsing is what makes the LL importer brittle (it hardcodes
columns A–E). Since this format is hand-authored and hand-edited, users will reorder columns
and add their own. Header matching reuses `normalizeHeader`
(`backend/internal/service/rental_export.go:181`), which already collapses whitespace and
newlines and lowercases — the exact behaviour needed, and already proven against the real
LL file's multi-line headers.

Validating fully before writing preserves the existing all-or-nothing guarantee: FR-005 and
SC-003 require that a failed import change nothing, and `UpsertInventory` is already a single
transaction. Collecting all bad rows in one pass (rather than failing on the first) means a
user fixing a 200-row sheet gets every problem at once.

Numeric parsing reuses the existing `atoi`/`atof` (`inventory_import.go:134,149`), which
already handle `"550 kr"`, `1 750,00`, `1,750.0` and non-breaking spaces — all things a
hand-maintained sheet will contain.

**Alternatives considered**:

- *Fixed column positions.* Rejected: guarantees breakage the first time a user inserts a
  column, with no diagnostic.
- *Require an exact sheet name.* Rejected: users will paste their supplier's list into a
  workbook whose sheet is called `Sheet1` or `Blad1`. Falling back to the first sheet costs
  nothing and removes a whole class of support question.
- *Skip bad rows with a warning instead of failing.* Rejected: a silently skipped row becomes
  equipment missing from the rental order — the exact failure the ROADMAP's standing
  invariant exists to prevent.

---

## R5 — Keeping the template and the parser in sync

**Decision**: Generate the template server-side with excelize, and assert in a test that a
freshly generated template, populated with rows, imports successfully.

**Rationale**: A checked-in `.xlsx` fixture (or one served from `frontend/public/`) is a
static file nobody re-validates; the first change to an accepted header name would leave
users downloading a template the importer rejects. FR-014 states this must not be possible,
and the round-trip test is what actually enforces it. Generating it also enables the Type
drop-list (excelize `NewDataValidation` + `SetDropList`), which removes the most likely user
error — a mistyped equipment type — at the point of entry.

Worked examples live on a second sheet (`Example`) rather than as pre-filled rows in
`Inventory`, because the importer prefers the `Inventory` sheet and would otherwise import
"Shure SM58" into every new user's catalog.

**Alternatives considered**:

- *Static file in `frontend/public/`.* Rejected: no drift protection, and it would need
  hand-editing in Excel to change.
- *CSV template.* Rejected: CSV cannot carry a frozen header row or a validated drop-list,
  and the feature is explicitly about Excel.

---

## R6 — Where does the rental order get its category grouping?

**Decision**: Extend the `EventRental` projection with `category_id` / `category_name` /
`category_type`, and **leave the query's `ORDER BY` untouched**; the PDF and generic
spreadsheet builders group in Go.

**Rationale**: `rentalSummaryQuery` (`backend/internal/db/rental.go:39`) currently sorts flat
by `i.name ASC, i.id ASC` and carries no category. Adding the columns is a join away, but
reordering the result set would change the on-screen Rental Order table for every existing
user, and `specs/013-stage-plots/rental-baseline.json` is a captured regression baseline that
depends on the current output. Grouping in the document builders keeps the API response
byte-identical apart from three additive fields, which is what SC-005 demands.

**Alternatives considered**:

- *Sort by category in SQL.* Rejected for the regression risk above; the grouping is a
  presentation concern of two document formats, not of the summary.
- *Look up each line's category individually while building the document.* Rejected: N+1
  queries for data one join provides.

---

## R7 — Route shape and permissions

**Decision**: No new authorization code. Manual CRUD goes inside the existing owner-gated
`/inventories/{inventoryID}` group; the new exports become siblings of the existing
`/rental-export` under the event group.

**Rationale**: `RequireInventoryOwner` (`api/middleware/inventory_access.go`) is already
owner-only for every method including GET, which is exactly FR-020. `RequireEventAccess`
already lets every role GET, which is exactly FR-033 (viewers keep export). Reusing both
means the slice adds no new permission surface to reason about — and the existing
`requireInventoryItem` guard (`api/inventories.go:251`) already prevents reaching an item
through the wrong inventory's URL, the cross-tenant hole closed in commit `5e0cb0b`.

New routes:

| Method | Path | Gate |
|---|---|---|
| `POST` | `/inventories/{id}/categories` | inventory owner |
| `PATCH`/`DELETE` | `/inventories/{id}/categories/{categoryID}` | inventory owner |
| `POST` | `/inventories/{id}/items` | inventory owner |
| `PATCH`/`DELETE` | `/inventories/{id}/items/{itemID}` | inventory owner |
| `POST` | `/inventories/{id}/import-generic-xlsx` | inventory owner |
| `GET` | `/inventory-template.xlsx` | authenticated |
| `GET` | `/events/{id}/rental-export/pdf` | event access (any role) |
| `GET` | `/events/{id}/rental-export/xlsx` | event access (any role) |

A **separate** generic-import route (rather than a `format` field on the existing one) keeps
the LL import path completely untouched, which is what FR-023 and SC-005 require.

`source_format` is surfaced to the frontend for free: `GET /events/{id}/inventory`
(`api/inventory.go:29`) already returns the whole `domain.Inventory` to every role, so adding
the field to the struct exposes it with no new endpoint.

---

## R8 — Deleting an item that is in use

**Decision**: New `db.CountItemReferences(itemID)` built from the same UNION arms as
`rentalSummaryQuery`, plus `event_rentals`. Return HTTP 409 with the count.

**Rationale**: Inventory items are referenced from eleven places (`input_sources.mic_item_id`
and `.stand_item_id`, `input_devices`, `input_cables`, `stageboxes`, `stage_multis`,
`output_devices`, `output_cables`, `lighting_fixtures`, `stage_plot_truss_pieces`,
`event_rentals`). A raw `DELETE` would leave dangling references across half the planning
model — SQLite foreign keys would not save us, since several of these columns are nullable
references without `ON DELETE RESTRICT`. Counting first mirrors two patterns already in the
codebase: `planned_on_events` for owned gear (`db/owned.go:10`) and `InventoryInUseError`
for inventories (`db/inventories.go:77`).

Deriving the arm list from the same place as the rental summary is deliberate: the ROADMAP's
standing invariant says any slice adding a new equipment-selection site must extend the
rental aggregation, so a future slice that honours that invariant automatically keeps delete
safety correct too.

**Alternatives considered**:

- *Soft-delete (mark discontinued) instead of refusing.* Rejected: `discontinued` means "gone
  from the supplier's list", not "user deleted it"; overloading it would corrupt the meaning
  of the export's `discontinued` unplaced-line reason. Users can still delete unreferenced
  items outright.
- *Cascade the delete into plans.* Rejected: destroys planning work to satisfy a catalog
  edit, with no undo.
