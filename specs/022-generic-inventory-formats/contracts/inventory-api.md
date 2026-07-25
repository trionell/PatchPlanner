# Contract: Inventory API — manual CRUD, generic import, template

**Feature**: `022-generic-inventory-formats` | **Date**: 2026-07-25

All routes are under `/api/v1`. Conventions follow the existing handlers: errors are
`{"error": "..."}` via `writeError`, IDs are parsed with `parseID`, nil slices are normalized
to `[]` before encoding, and validation is hand-rolled (no validator library).

## Authorization

Every `/inventories/{inventoryID}/*` route below sits inside the existing group guarded by
`middleware.RequireInventoryOwner`, which is **owner-only for every method** and returns
`404 {"error":"inventory not found"}` to non-owners — satisfying FR-020 with no new
authorization code. Child resources additionally pass through the existing
`requireInventoryItem` cross-tenant guard, so an item ID belonging to another inventory 404s
rather than resolving.

---

## Existing shapes, extended

```jsonc
// Inventory — new field
{
  "id": 3,
  "name": "Lasse Ljud & Ljus AB",
  "sourceFilename": "LL.xlsx",
  "sourceFormat": "ll",        // NEW: "ll" | "generic" | absent (manual/never imported)
  "createdAt": "2026-07-20T09:12:00Z"
}

// InventoryItem — new field
{
  "id": 812,
  "inventoryId": 3,
  "category_id": 41,
  "category_name": "Microphones",
  "category_type": "audio",
  "name": "Shure SM58",
  "description": "Dynamic vocal mic",
  "quantity_available": 12,
  "price_ex_vat": 120,
  "xlsx_row": 74,
  "discontinued": false,
  "is_manual": false           // NEW
}
```

`sourceFormat` also reaches the frontend through the existing
`GET /events/{eventID}/inventory`, which already returns the whole `Inventory` to every event
role — no new endpoint is needed for the rental tab to decide whether to show the LL export
button.

---

## Spreadsheet import (both formats, auto-detected)

### `POST /inventories/{inventoryID}/import-xlsx`

Multipart form, field name `file`. **One route for every supported format** — the service
detects which one the upload is and dispatches to the matching parser. Users have one
spreadsheet and one Import button; classifying the file is not their job.

Detection order:

1. A sheet named `Prislista LL` → the price-list importer. This is a sheet-name check
   because that is precisely what the price-list importer requires (it reads that sheet by
   name and fails without it), so "detected as LL" and "the LL importer can handle this" are
   the same statement rather than a guess.
2. Otherwise, if the generic parser's own column locator finds `Category` and `Name`
   headings → the generic importer.
3. Otherwise → 400 describing **both** formats, since the user cannot see which test failed.

Neither check re-implements parsing rules that live in the importers.

The LL parsing path itself is untouched by this (FR-023, SC-005): detection happens before
it, and dispatches into the existing function unchanged.

**200** — `format` reports what the detection decided, so the UI can confirm it rather than
leaving the user to infer it:

```json
{
  "categories_imported": 7,
  "items_imported": 84,
  "format": "generic",
  "warnings": [
    "Category \"Truss\" appears with both types \"rigging\" and \"lighting\"; using \"rigging\""
  ]
}
```

**400** — validation failed; **nothing was written**.

```json
{ "error": "row 14: item \"Shure SM58\" has no Category; row 22: unknown Type \"lights\" (expected audio, lighting, rigging, video, misc)" }
```

```json
{ "error": "this file matches neither supported format: an LL price list needs a \"Prislista LL\" sheet, and a generic list needs \"Category\" and \"Name\" column headings - download the template for the expected layout" }
```

Side effects on success depend on the detected format:

| Detected | `source_format` | `source_filename` | `source_xlsx` |
|---|---|---|---|
| `ll` | `"ll"` | uploaded name | the uploaded bytes, retained for export |
| `generic` | `"generic"` | uploaded name | cleared — there is no supplier file to write quantities back into |

Re-importing switches the format, because the newer import defines what the catalog now
mirrors.

### `GET /inventory-template.xlsx`

Authenticated; not inventory-scoped. Returns the generated blank template
(`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="PatchPlanner inventory template.xlsx"`).

Layout is specified in [`generic-xlsx-format.md`](./generic-xlsx-format.md).

---

## Categories

### `POST /inventories/{inventoryID}/categories`

```json
{ "name": "Moving heads", "category_type": "lighting", "picker_role": "" }
```

- `name` required, trimmed; case-insensitively unique within the inventory (409 on collision).
- `category_type` required; one of `audio`, `lighting`, `rigging`, `video`, `misc`.
- `picker_role` optional; one of `cable`, `stand`, `truss`, or empty.

**201** the created category. **400** on invalid enum or blank name. **409** on duplicate name.

### `PATCH /inventories/{inventoryID}/categories/{categoryID}`

Partial update of `name`, `category_type`, `picker_role`. Extends the existing picker_role-only
PATCH rather than adding a second endpoint. **200** the updated category, **404** if the
category is not in this inventory.

### `DELETE /inventories/{inventoryID}/categories/{categoryID}`

**204** when empty.

**409** while it still holds items (discontinued ones included) — FR-019:

```json
{ "error": "category \"Microphones\" still has 23 items; move or delete them first" }
```

---

## Items

### `POST /inventories/{inventoryID}/items`

```json
{
  "category_id": 41,
  "name": "Shure SM58",
  "description": "Dynamic vocal mic",
  "quantity_available": 12,
  "price_ex_vat": 120
}
```

- `category_id` required and must belong to this inventory (404 otherwise).
- `name` required, trimmed, non-empty.
- `quantity_available` ≥ 0, `price_ex_vat` ≥ 0; both default to 0.

**201** the created item with `is_manual: true` and `discontinued: false`. The server sets
`is_manual`; a client cannot.

### `PATCH /inventories/{inventoryID}/items/{itemID}`

Partial update of `category_id`, `name`, `description`, `quantity_available`, `price_ex_vat`.
Works on imported items too — correcting a price is legitimate — but **`is_manual` is
immutable**, so a corrected imported item stays subject to the next import's sweep.

**200** the updated item. **404** if the item is not in this inventory.

### `DELETE /inventories/{inventoryID}/items/{itemID}`

**204** when unreferenced.

**409** when referenced anywhere in any event's plan (FR-018), with the count from
`db.CountItemReferences`:

```json
{ "error": "\"Shure SM58\" is used 7 times across your events; remove those references first" }
```

Refusing rather than cascading is deliberate: cascading would destroy planning work to satisfy
a catalog edit, and marking it `discontinued` instead would corrupt that flag's meaning
("gone from the supplier's list") and the export's `discontinued` unplaced-line reason.

---

## Behavioural contracts (the parts most likely to regress)

1. **Hand-entered items survive imports.** After any sequence of imports into an inventory,
   every `is_manual: true` item is still present, still `discontinued: false`, and its field
   values are unchanged. Enforced in `UpsertInventory` by excluding manual rows from both the
   discontinue sweep *and* the name-matching pool.
2. **Failed imports change nothing.** A 400 from either import route leaves categories, items,
   `source_filename` and `source_format` exactly as they were.
3. **The LL import is untouched.** `POST /inventories/{id}/import-xlsx` keeps its existing
   parsing, upsert behaviour, blob storage and response shape; it only additionally records
   `source_format = 'll'`.
4. **Duplication carries provenance.** `POST /inventories/{id}/duplicate` copies
   `source_format` and every item's `is_manual`, so the copy offers exactly the same exports
   and behaves identically on re-import (FR-021).
