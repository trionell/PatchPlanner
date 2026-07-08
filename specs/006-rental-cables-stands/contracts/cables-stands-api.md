# Contract: Cables & Stands — API and UI

## API

### `GET /api/v1/inventory/items?role=cable|stand`

Returns inventory items whose category has the given `picker_role`.
Combines with existing `category_id` / `category_type` / `include_discontinued`
params. Invalid `role` values → `400`.

### `PATCH /api/v1/inventory/categories/{id}`

Body: `{"picker_role": "cable" | "stand" | null}`. Sets or clears the
category's picker role. Unknown role string → `400`. Missing category → `404`.
Response: the updated category (now including `picker_role`).

### `GET /api/v1/inventory/categories`

Each category gains `picker_role` (omitted/empty when unset).

### Audio patch (`GET/POST/PATCH` under `/api/v1/events/{id}/audio/...`)

Inputs gain `cable_item_id`, `stand_item_id`; outputs gain `cable_item_id`
(all optional ints, FK-validated → `400`/`409` on unknown item per existing
error style). Legacy fields `cable_type`, `cable_length_m` (both directions)
and `mic_stand` (inputs) are served for display but demoted: a write that
sets the corresponding `*_item_id` clears them; new rows leave them NULL.

### `GET /api/v1/events/{id}/rental` (+ export & report)

Unchanged shape. Lines now additionally include one audio-quantity unit per
input cable pick, input stand pick, and output cable pick, merged per item
with all existing sources (manual lines, mics, stageboxes, multis, amps,
speakers). Over-stock and discontinued flagging apply unchanged; the Excel
export places these items via their existing `xlsx_row` like any line.

## UI

### Input patch table (Audio Inputs tab)

- The cable-type select and length input are replaced by one **cable picker**
  (options: `name — description` from `role=cable` items, plus an empty "—"
  choice). The stand select is replaced by a **stand picker** (`role=stand`).
- Legacy rows (no pick, old values present) show the old value as read-only
  text beside the picker until a pick is made (mic-cell pattern).

### Output patch table (Audio Outputs tab)

- Cable type/length fields replaced by the same cable picker.

### Inventory page

- The category list shows each category's picker role with a small selector
  (— / Cable / Stand) that PATCHes immediately.

### Rental Order tab

- No new UI: picked cables/stands simply appear as lines (they were already
  renderable — name, description, quantity, price, flags).

### Print sheets & signal flow

- Input sheet: Cable and Stand columns show `name — description` for picks,
  legacy text otherwise. Length column is folded into the cable text (the
  catalog item encodes it).
- Output sheet: same for its Cable column.
- Signal-flow cable hop: picked item label, else legacy text; a channel with
  no cable shows the hop as absent without flagging a gap (cable remains
  optional).
