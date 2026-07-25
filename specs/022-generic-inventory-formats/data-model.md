# Phase 1 Data Model: Generic Inventory Formats, Manual Entry & PDF Rental Order

**Feature**: `022-generic-inventory-formats` | **Date**: 2026-07-25

This slice adds **no new tables**. It adds two columns, three projected fields, and changes
one write rule. Everything else reuses the existing schema.

---

## Schema changes

### `inventories` — new column `source_format`

Migration `040_inventory_source_format`:

```sql
ALTER TABLE inventories ADD COLUMN source_format TEXT;
```

```sql
-- Deterministic backfill: only the LL importer has ever written source_xlsx,
-- so "has a stored template" and "was populated from the LL price list" are
-- currently the same statement. Recording it explicitly is what lets a second
-- importer exist without that equivalence silently breaking (research R1).
UPDATE inventories SET source_format = 'll' WHERE source_xlsx IS NOT NULL;
```

| Value | Meaning | LL export offered? |
|---|---|---|
| `'ll'` | Populated by importing a supplier price list; `source_xlsx` holds that file | Yes |
| `'generic'` | Populated by importing a generic spreadsheet; no file retained | No |
| `NULL` | Never imported — created empty and/or populated by hand | No |

**Rules**

- The LL importer sets `'ll'`; the generic importer sets `'generic'`.
- Manual CRUD never changes it. Hand-adding an item to an LL inventory leaves it `'ll'`, and
  that inventory keeps its LL export — the hand-added item simply reports as an unplaced line,
  which the existing export already handles (`UnplacedNoRow`).
- Re-importing switches the value, because the newer import defines what the catalog now
  mirrors.
- `DuplicateInventory` copies it (FR-021), alongside the `source_xlsx` blob it already copies.
- Exposed as `sourceFormat` in JSON. The blob itself stays unserialized, as today.

### `inventory_items` — new column `is_manual`

Migration `041_inventory_items_manual`:

```sql
ALTER TABLE inventory_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;
```

Every existing row is imported, so the `DEFAULT 0` backfill is correct with no `UPDATE`.

| Value | Meaning |
|---|---|
| `0` | Created by an import; owned by the file, subject to the discontinue sweep |
| `1` | Created by hand through the API; owned by the user, invisible to imports |

**Rules**

- Set to `1` by `POST /inventories/{id}/items`, `0` by both importers.
- Immutable after creation. Editing a hand-entered item keeps it manual; an import can
  neither claim nor release a row.
- `DuplicateInventory` copies it (FR-021).

---

## Changed write behaviour: `UpsertInventory`

Two edits in `backend/internal/db/inventory.go`, both load-bearing (research R2):

```go
// BEFORE — sweeps every item in the inventory
UPDATE inventory_items SET discontinued = 1 WHERE inventory_id = ?

// AFTER — hand-entered items are not the file's to discontinue
UPDATE inventory_items SET discontinued = 1 WHERE inventory_id = ? AND is_manual = 0
```

```sql
-- loadItemIDsByName: the pool of rows an incoming file row may claim
SELECT id, name FROM inventory_items
 WHERE inventory_id = ? AND is_manual = 0     -- ← added
 ORDER BY COALESCE(xlsx_row, 0) ASC, id ASC
```

Without the second edit an imported row would *adopt* a same-named manual row, overwriting
its price and quantity. With it, the two populations are disjoint: a name collision yields
two visible rows the user can reconcile, rather than silent data loss.

**Invariant (FR-017)**: for any sequence of imports into an inventory, the set of
`is_manual = 1` rows and their field values is unchanged, and none of them is ever
`discontinued` by an import.

---

## Projection change: `EventRental`

`rentalSummaryQuery` gains three fields via a join to `inventory_categories` — **additive
only; the `ORDER BY i.name ASC, i.id ASC` is unchanged** (research R6, guarding
`specs/013-stage-plots/rental-baseline.json` and the on-screen table order).

```go
type EventRental struct {
    // ... all existing fields unchanged ...
    CategoryID   int64  `json:"category_id,omitempty"`
    CategoryName string `json:"category_name,omitempty"`
    CategoryType string `json:"category_type,omitempty"`
}
```

Grouping happens in the PDF and spreadsheet builders, not in SQL.

---

## Domain struct changes

`backend/internal/domain/inventory.go`:

```go
type Inventory struct {
    // ... existing ...
    SourceFormat string `json:"sourceFormat,omitempty"` // "ll" | "generic" | ""
}

type InventoryItem struct {
    // ... existing ...
    IsManual bool `json:"is_manual"`
}

type InventoryImportResult struct {
    CategoriesImported int      `json:"categories_imported"`
    ItemsImported      int      `json:"items_imported"`
    Warnings           []string `json:"warnings,omitempty"` // non-fatal, e.g. conflicting types
}
```

`SourceFormat` reaches the frontend at no cost: `GET /events/{id}/inventory` already returns
the whole `Inventory` to every role.

---

## Validation rules

### Categories (FR-015, FR-019)

| Field | Rule |
|---|---|
| `name` | Required, trimmed, non-empty. Case-insensitively unique within the inventory. |
| `category_type` | Required; one of `audio`, `lighting`, `rigging`, `video`, `misc` (the existing CHECK constraint). |
| `picker_role` | Optional; one of `cable`, `stand`, `truss`, or empty. Existing enum, existing endpoint semantics. |
| delete | Refused (409) while the category holds any item, discontinued ones included. |

### Items (FR-016, FR-018)

| Field | Rule |
|---|---|
| `category_id` | Required; must belong to the same inventory (enforced by the existing cross-tenant guard). |
| `name` | Required, trimmed, non-empty. |
| `description` | Optional. |
| `quantity_available` | Integer ≥ 0. |
| `price_ex_vat` | Number ≥ 0. |
| delete | Refused (409) when `CountItemReferences > 0`; the response carries the count. |

### Generic import (FR-001 … FR-009)

Whole-file validation before any write — a failing file changes nothing (SC-003).

| Condition | Outcome |
|---|---|
| No recognisable header row | Reject whole file |
| Missing `Category` or `Name` column | Reject whole file, naming the missing column |
| Row blank, or `Name` blank | Skip silently (users leave spacer rows) |
| `Name` present, `Category` blank | **Error**, with the 1-based sheet row number |
| `Type` blank | Default `audio` |
| `Type` unrecognised | **Error**, with the row number and the accepted values |
| Quantity/price unparseable | Coerce to 0 (existing `atoi`/`atof` tolerance) |
| One category name, conflicting types | Warning; first occurrence wins |
| Unknown extra columns | Ignored |

---

## Reference counting

New `db.CountItemReferences(db, itemID) (int, error)` — a `UNION ALL` over the same eleven
arms as `rentalSummaryQuery`, plus `event_rentals`:

`input_sources.mic_item_id`, `input_sources.stand_item_id`, `input_devices.inventory_item_id`,
`input_cables.cable_item_id`, `stageboxes.inventory_item_id`, `stage_multis.inventory_item_id`,
`output_devices.inventory_item_id`, `output_cables.cable_item_id`,
`lighting_fixtures.inventory_item_id`, `stage_plot_truss_pieces.inventory_item_id`,
`event_rentals.inventory_item_id`.

Deriving the arm list from the rental aggregation is deliberate: the ROADMAP's standing
invariant already obliges any future slice that adds an equipment-selection site to extend
that aggregation, so delete safety stays correct for free.

---

## Entity relationships (unchanged)

```text
users ──owns──> inventories ──has──> inventory_categories ──has──> inventory_items
                     ▲                                                   ▲
                     │                                                   │
                  events ──plans──> (11 reference sites) ────────────────┘
                     │
                     └──> event_rentals (manual order lines)
```

The only new information in this graph is a label on `inventories` (how it was populated) and
a label on `inventory_items` (who owns the row — the file, or the user).
