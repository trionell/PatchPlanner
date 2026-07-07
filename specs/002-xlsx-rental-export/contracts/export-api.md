# API Contracts: Excel Rental Order Export

Base URL: `http://localhost:7331/api/v1`. Errors use the existing
`{"error": "message"}` shape.

## New: `GET /events/{eventID}/rental-export/report`

Dry-run of the export: what would be placed, what wouldn't. The UI calls this
before offering the download so notices can be rendered.

**Response 200**:

```json
{
  "filename": "Hyrorder - E2E Gig - 2026-08-01.xlsx",
  "placed_lines": 7,
  "unplaced_lines": [
    {
      "inventory_item_id": 57,
      "inventory_item_name": "AKG D112",
      "quantity_audio": 2,
      "quantity_lighting": 0,
      "reason": "discontinued"
    }
  ]
}
```

`unplaced_lines` is `[]` when everything places. Reasons: `discontinued`,
`row_mismatch`, `no_row`.

**Errors**:
- `404` — event not found.
- `500` with error body — price-list file missing/unreadable, or quantity
  columns not found in the sheet.

## New: `GET /events/{eventID}/rental-export`

The export itself: a copy of the current price-list file with this event's
quantities in the *Antal Ljud* / *Antal Ljus* columns.

**Response 200**:
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<encoded>`
- Body: the `.xlsx` bytes.

Guarantees (see data-model.md placement rules):
- Only the two quantity columns differ from the source file; stale values in
  those columns are cleared sheet-wide.
- A quantity is only written to a row whose column-A name matches the catalog
  item; unplaceable lines are omitted from the file (visible via the report
  endpoint).
- The source file on disk is never modified.
- An event with an empty order downloads a clean copy (quantity columns
  empty).

**Errors**: same as the report endpoint. On error the response is JSON (no
partial file is streamed).

## Unchanged

All other endpoints. The Rental Order tab consumes the two new endpoints:
Export click → `GET …/rental-export/report` → render `unplaced_lines`
notices (if any) → navigate to `GET …/rental-export` to download.
