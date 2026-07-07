# API Contracts: Equipment Lists — Owned Gear & Event Extras

Base URL: `/api/v1`. Errors: `{"error": "message"}`.

## Owned catalog

### `GET /owned-items`
`200` → array of:
```json
{
  "id": 1, "name": "Shure SM7B", "description": "", "category_type": "audio",
  "quantity_owned": 1, "notes": "", "planned_on_events": 2, "created_at": "…"
}
```

### `POST /owned-items`
Body: `{ "name", "description?", "category_type?", "quantity_owned?", "notes?" }`.
`201` → created item. `400` when name empty or category_type invalid.

### `PATCH /owned-items/{itemID}`
Same body; `200` → updated item; `400`/`404`.

### `DELETE /owned-items/{itemID}`
`204`; cascades away all event lines for the item (client confirms first
using `planned_on_events`). Idempotent.

## Event owned-equipment lines

### `GET /events/{eventID}/owned-equipment`
`200` → array of:
```json
{
  "owned_item_id": 1, "owned_item_name": "Shure SM7B", "category_type": "audio",
  "quantity": 2, "quantity_owned": 1, "is_over_owned": true, "notes": "podcast rig"
}
```

### `PUT /events/{eventID}/owned-equipment/{ownedItemID}`
Body: `{ "quantity": 2, "notes?": "…" }`. Upsert (one line per item);
`quantity: 0` removes the line. `200` → the line (as in GET). `400` negative
quantity / invalid body; `404` unknown event or owned item.

### `DELETE /events/{eventID}/owned-equipment/{ownedItemID}`
`204`, idempotent.

## Unchanged

Rental order summary, export, and import are untouched: owned gear never
appears in them (verified by tests). The Equipment tab's "Rented extras"
section reuses the existing manual-line endpoints.
