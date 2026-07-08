# Data Model: Rental Completeness — Cables & Stands from Inventory

## Schema changes (migration 019)

### `inventory_categories`

| Column | Type | Notes |
|---|---|---|
| `picker_role` | TEXT NULL | `'cable'` \| `'stand'` \| NULL (not a picker source). Seeded by name match: Signalkablage, Signalkablage digital, Högtalarkablage → `cable`; Stativ & Lyftutrustning → `stand`. Never touched by xlsx import. |

### `audio_patch_inputs`

| Column | Type | Notes |
|---|---|---|
| `cable_item_id` | INTEGER NULL REFERENCES inventory_items(id) | The channel's cable, picked from `cable`-role categories. |
| `stand_item_id` | INTEGER NULL REFERENCES inventory_items(id) | The channel's stand, picked from `stand`-role categories. |
| `cable_type`, `cable_length_m` | (existing) | Demoted to legacy display pair: read-only, cleared when `cable_item_id` is set, never written for new rows. |
| `mic_stand` | (existing) | Demoted to legacy display value: same lifecycle as above, cleared when `stand_item_id` is set. |

### `audio_patch_outputs`

| Column | Type | Notes |
|---|---|---|
| `cable_item_id` | INTEGER NULL REFERENCES inventory_items(id) | The output's cable. |
| `cable_type`, `cable_length_m` | (existing) | Legacy display pair, same lifecycle as inputs. |

### Backfill (same migration, conservative — research R3)

- Convert input rows where `cable_type='xlr'` and exactly one non-discontinued
  item in a `cable`-role category is named `Mikrofonkabel` with
  `LOWER(REPLACE(description, ',', '.')) = printf('%gm', cable_length_m)`;
  set `cable_item_id`, NULL the legacy pair.
- No automatic conversion for other cable types, output cables, or stands —
  their legacy values remain displayed on the row.

## API/domain model changes

### `AudioPatchInput` (JSON)

- New: `cable_item_id?: number`, `stand_item_id?: number`.
- `cable_type`, `cable_length_m`, `mic_stand` remain in the payload but are
  **legacy, read-only**: served while the row has no corresponding pick, never
  accepted as updates that set new values (writes follow the `mic_model` CASE
  pattern — a non-null pick clears them).

### `AudioPatchOutput` (JSON)

- New: `cable_item_id?: number`. Same legacy rule for `cable_type` /
  `cable_length_m`.

### `InventoryCategory` (JSON)

- New: `picker_role?: 'cable' | 'stand'` — settable via
  `PATCH /api/v1/inventory/categories/{id}` (body `{picker_role: 'cable'|'stand'|null}`;
  422/400 on unknown values).

### `GET /api/v1/inventory/items`

- New optional query param `role=cable|stand` → filters on the item's
  category `picker_role`. Combines with existing params; discontinued items
  excluded by default as today.

## Derivation rules

| Display context | Rule |
|---|---|
| Picker option text | `name — description` (description empty → name alone); options are all non-discontinued items of the role's categories. |
| Row display (table, print sheets, signal flow) | Pick set → item `name — description`. No pick + legacy values → legacy text: cable = `<vocab label> <length> m` (via `useReferenceData().label`), stand = vocab label. Neither → em dash / "no cable". |
| Rental line quantity | +1 audio per non-null `cable_item_id` (inputs), `stand_item_id` (inputs), `cable_item_id` (outputs), merged into the existing per-item summary line (price, over-stock, discontinued, manual merge, Excel placement unchanged). |

## Validation & lifecycle

- FK enforcement (DSN pragma, slice 0) guarantees picks reference existing
  items; deleting a referenced item is prevented by the FK unless the row is
  cleared first (import never deletes items — it marks them discontinued).
- Discontinued items: excluded from pickers, still displayed and counted on
  rows that already pick them (existing rental flagging applies).
- `picker_role` accepts only `'cable'`, `'stand'`, or NULL (validated in the
  handler; column stays TEXT without CHECK per slice-4 precedent).
- Setting a pick clears the row's corresponding legacy fields atomically in
  the same UPDATE; clearing a pick (back to empty) does not resurrect them.
