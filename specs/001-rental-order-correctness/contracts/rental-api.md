# API Contracts: Rental Order Correctness

Base URL: `http://localhost:7331/api/v1`. All bodies JSON. Errors use the
existing shape `{"error": "message"}` with 4xx/5xx status.

## Changed: `GET /events/{eventID}/rentals`

Rental order summary — now includes all sources, manual quantities, and stock
validation.

**Response 200**:

```json
{
  "items": [
    {
      "inventory_item_id": 42,
      "inventory_item_name": "Shure SM58",
      "description": "Dynamisk sångmikrofon",
      "quantity_audio": 8,
      "quantity_lighting": 0,
      "total_quantity": 8,
      "manual_quantity_audio": 2,
      "manual_quantity_lighting": 0,
      "manual_notes": "spares",
      "price_ex_vat": 150.0,
      "subtotal_ex_vat": 1200.0,
      "quantity_available": 6,
      "is_over_stock": true,
      "is_discontinued": false
    }
  ],
  "total_items": 1,
  "total_quantity": 8,
  "total_ex_vat": 1200.0,
  "has_over_stock": true
}
```

Notes:
- `quantity_audio`/`quantity_lighting` are totals **including** manual
  quantities; `manual_*` fields expose the manual share so the UI can edit it.
- `is_over_stock` = `total_quantity > quantity_available`.
- `has_over_stock` is true if any line is over stock or references a
  discontinued item.

## New: `PUT /events/{eventID}/rentals/manual/{itemID}`

Create or update the manual rental line for a catalog item (upsert; at most
one line per item per event).

**Request**:

```json
{ "quantity_audio": 2, "quantity_lighting": 0, "notes": "spares" }
```

**Responses**:
- `200` — updated summary line for the item (same line shape as above).
- `400` — negative quantities / invalid body / invalid ids.
- `404` — event or inventory item not found.

Behavior: quantities must be ≥ 0. If both quantities are 0, the manual line is
removed (idempotent with DELETE). `notes` optional.

## New: `DELETE /events/{eventID}/rentals/manual/{itemID}`

Remove the manual line for the item. `204` on success, also `204` if no such
line existed (idempotent). `400` on invalid ids.

## Changed (behavior only): `POST /inventory/import-xlsx`

Route and request unchanged. New guarantees:
- Never deletes inventory items, categories, or **any** event planning data.
- Existing items matched by case-insensitive name (list-position fallback for
  duplicate names) are updated in place, preserving their ids.
- Items missing from the new sheet get `discontinued: true`; they reappear as
  active if a later import includes them again.
- On any parse/DB error the entire import rolls back (409/500 with error body;
  DB unchanged).

**Response 200** (unchanged shape):

```json
{ "categories_imported": 26, "items_imported": 299 }
```

## Changed: `GET /inventory/items`

Each item gains `"discontinued": false`. New optional query parameter
`?include_discontinued=true`; by default discontinued items are **excluded**
(planning dropdowns must not offer them). Existing parameters
(`category_type`, `category_id`) unchanged.

## Changed: audio input payloads

`GET /events/{eventID}/audio-patch` (input objects), and request/response of
`POST /events/{eventID}/audio-inputs`, `PATCH /events/{eventID}/audio-inputs/{inputID}`:

| Field | Change |
|-------|--------|
| `mic_item_id` | **NEW**, `number \| null` — catalog reference; validated to exist when set (400 otherwise) |
| `mic_model` → `mic_label` | **RENAMED** in JSON, now read-only legacy text; server ignores it on write except: setting a non-null `mic_item_id` clears the stored label |

All other input/output/stagebox/multi/fixture endpoints are unchanged.
