# Contract: Rental Export API — PDF, generic spreadsheet, and LL gating

**Feature**: `022-generic-inventory-formats` | **Date**: 2026-07-25

All routes sit under `/api/v1/events/{eventID}` behind the existing
`middleware.RequireEventAccess`. That middleware already allows **GET for every role**
including viewers, so all three exports remain available to viewers (FR-033) with no new
authorization code. Non-members get 404, not 403 — the event stays invisible to them.

---

## Route map

| Method | Path | Availability | Added |
|---|---|---|---|
| `GET` | `/rentals` | any role | existing |
| `PUT`/`DELETE` | `/rentals/manual/{itemID}` | owner/contributor | existing |
| `GET` | `/rental-export` | **only** `sourceFormat == "ll"` | existing, now gated |
| `GET` | `/rental-export/report` | **only** `sourceFormat == "ll"` | existing, now gated |
| `GET` | `/rental-export/pdf` | any inventory | **new** |
| `GET` | `/rental-export/xlsx` | any inventory | **new** |

The two new routes are siblings of `/rental-export/report`, matching the existing path shape
rather than inventing a new one.

---

## Gating the supplier price-list export

**Change**: the gate moves from "does the inventory hold a stored file?" to "was the inventory
populated from a supplier price list?".

```go
// BEFORE (rental_export.go:55) — true for any inventory holding bytes
if sourceXLSX == nil { return ErrNoInventoryTemplate }

// AFTER — provenance decides, not the presence of bytes
if inventory.SourceFormat != "ll" || sourceXLSX == nil { return ErrNoInventoryTemplate }
```

These are the same condition today, since only the LL importer ever writes the blob. They stop
being the same the moment a second importer exists, which is why the discriminator is explicit
(research R1).

**400** for a non-LL inventory:

```json
{ "error": "this inventory was not imported from an LL price list, so it cannot be exported to that format - use the PDF or spreadsheet export instead" }
```

The frontend must **hide** the button rather than rely on this 400 — restricted actions are
hidden client-side in this project, not merely rejected by the backend.

**Unchanged for qualifying inventories** (FR-023, SC-005): the same `Prislista LL` sheet, the
same `Antal Ljud` / `Antal Ljus` column location by header text, the same clearing of stale
quantities, the same per-row name verification, the same `UnplacedLine` reporting with reasons
`discontinued` / `row_mismatch` / `no_row`, and the same
`Hyrorder - {event} - {date}.xlsx` filename.

---

## `GET /events/{eventID}/rental-export/pdf`

Returns the rendered document as a file download.

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="Hyrorder - Sommarfesten 2026 - 2026-08-14.pdf";
                     filename*=UTF-8''Hyrorder%20-%20Sommarfesten%202026%20-%202026-08-14.pdf
```

RFC 5987 encoding follows the existing export handler (`rental.go:51`), which already handles
non-ASCII event names.

Layout — including the category grouping, subtotals, status markers, pagination and the
cp1252 character-set constraint — is specified in
[`generic-xlsx-format.md`](./generic-xlsx-format.md) §2.

**Guarantees**

- Available for every inventory, whatever its `sourceFormat` (FR-024).
- An event with nothing planned yields a valid PDF with zero lines and a zero total, not an
  error.
- An event with no date and/or no venue renders a clean header with those fields omitted — no
  dangling separators.
- At least 100 lines paginate correctly with repeated column headers and no truncation
  (SC-008).
- Swedish characters in equipment names render correctly (FR-030).

## `GET /events/{eventID}/rental-export/xlsx`

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="Hyrorder - Sommarfesten 2026 - 2026-08-14 (lista).xlsx"
```

Sheet `Rental order`, columns
`Category | Item | Description | Audio | Lighting | Total | Unit price | Subtotal`, grouped by
category with a totals row. The ` (lista)` suffix prevents a collision with the price-list
export in a downloads folder when an LL user takes both.

This is an order document, not a catalog format: it is intentionally **not** accepted by the
generic importer.

---

## Rental summary response — additive change

`GET /events/{eventID}/rentals` gains three fields per line so the documents can group without
a second query:

```jsonc
{
  "items": [
    {
      "inventory_item_id": 812,
      "inventory_item_name": "Shure SM58",
      "category_id": 41,             // NEW
      "category_name": "Microphones", // NEW
      "category_type": "audio",       // NEW
      "quantity_audio": 8,
      "quantity_lighting": 0,
      "total_quantity": 8,
      "price_ex_vat": 120,
      "subtotal_ex_vat": 960,
      "quantity_available": 12,
      "is_over_stock": false,
      "is_discontinued": false
      // ... existing fields unchanged ...
    }
  ]
}
```

**The order of `items` does not change.** The query keeps `ORDER BY i.name ASC, i.id ASC`;
grouping happens in the document builders. This protects the on-screen table and the captured
regression baseline `specs/013-stage-plots/rental-baseline.json` (research R6).

---

## Frontend contract

`RentalTab.tsx` renders the export group from the event's inventory `sourceFormat`, read from
the existing `GET /events/{id}/inventory` query:

| `sourceFormat` | Buttons shown |
|---|---|
| `"ll"` | `Export LL.xlsx` · `Export .xlsx` · `Export PDF` |
| `"generic"` or absent | `Export .xlsx` · `Export PDF` |

Downloads use the existing plain-URL `window.location.assign` pattern (`rentals.ts:13`), not
`fetch` — no blob handling is introduced. Mobile keeps the rental order read-only for every
role, as the mobile UI contract requires; export buttons remain available there.
