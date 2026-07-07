# Data Model: Excel Rental Order Export

Phase 1 output. **No schema changes** — the export is a pure derivation over
Slice 1's data. Only new derived (in-memory/API) shapes are introduced.

## Derived: Rental export report

Produced by the writer alongside (or instead of) the file bytes.

| Field | Type | Notes |
|-------|------|-------|
| `filename` | string | `Hyrorder - {event}[ - {date}].xlsx`, sanitized |
| `placed_lines` | int | Number of order lines written into the sheet |
| `unplaced_lines` | []UnplacedLine | Lines that could not be written; empty when everything placed |

## Derived: Unplaced line

| Field | Type | Notes |
|-------|------|-------|
| `inventory_item_id` | int64 | Catalog item |
| `inventory_item_name` | string | For display and manual follow-up |
| `quantity_audio` | int | Unplaced audio share |
| `quantity_lighting` | int | Unplaced lighting share |
| `reason` | string | `discontinued` \| `row_mismatch` \| `no_row` |

Reasons:
- `discontinued` — item vanished from the latest imported price list; its row
  position refers to the old sheet.
- `row_mismatch` — the sheet row recorded for the item now holds a different
  equipment name (file drifted since last import).
- `no_row` — item has no recorded sheet position (defensive; shouldn't occur
  for imported items).

## Inputs (all existing, read-only)

- **Rental summary** (`GetRentalSummary`): per-item `quantity_audio`,
  `quantity_lighting`, `is_discontinued` — the numbers to place.
- **Inventory item** `xlsx_row`: 1-based sheet row recorded at import, the
  placement target.
- **Event** name/date: filename material.
- **Price-list workbook** (`INVENTORY_PATH`): the template being copied;
  never written back to disk.

## Placement rules (writer invariants)

1. Quantity columns are found by header text ("Antal Ljud", "Antal Ljus"),
   normalized for case/whitespace; export fails if absent.
2. Both quantity columns are cleared on every data row before writing.
3. A line is written only when: not discontinued, `xlsx_row > 0`, and the
   name in column A at that row equals the item name (trimmed,
   case-insensitive). Otherwise → unplaced with the matching reason.
4. Only positive quantities are written; a zero side stays empty.
5. No cell outside the two quantity columns is ever modified.
