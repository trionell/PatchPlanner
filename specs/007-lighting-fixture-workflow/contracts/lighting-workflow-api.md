# Contract: Lighting Workflow — API and UI

## API

### Fixture resources (existing endpoints, extended)

`LightingFixture` gains optional `fixture_number` (positive integer), accepted
on create/PATCH and served on every read. `fixture_number` ≤ 0 → 400.

### `POST /events/{eventID}/lighting-rigs/{rigID}/fixtures/bulk` (new)

Body: see data-model.md. Semantics:

- All-or-nothing: one transaction; any failure creates zero fixtures.
- Placement: positions appended after the rig's max; DMX addresses appended
  after the chosen universe's highest occupied address (never repacks or
  touches existing fixtures).
- `409` with the universe-full message when the batch cannot fit inside 512
  channels; `400` for quantity outside 1–100, `dmx_channel_count` < 1,
  non-positive `fixture_number_start`, unknown `inventory_item_id`, or a
  `truss_section_id` not belonging to the rig; `404` for an unknown rig.
- Returns the full updated fixtures array (same shape as
  `POST .../auto-assign-dmx`).

## UI (Lighting tab)

### Rig table

- New **FID** column (first column, before `#`): numeric input bound to
  `fixture_number`; cells whose number appears on more than one row in the
  rig get an amber warning treatment (flag, never a block).

### Add Fixture dialog

- Selecting a catalog model with defined DMX modes shows a **Mode picker**
  (options `name (N ch)`) above the existing free-text mode/channel inputs;
  picking fills both inputs. Models without modes / custom fixtures: unchanged
  free-text behavior. Switching the model resets mode name/count to defaults.

### Bulk add dialog (new, opened from a "Bulk add" button beside Add Fixture)

- Fields: catalog model (required, catalog-only), quantity (1–100), mode
  (picker when the model has modes, else free text) + channel count, truss
  section (optional), DMX universe, power connection + connector, start
  fixture ID (pre-filled with the rig's next free number, editable, may be
  cleared → no IDs).
- Submit calls the bulk endpoint; on 409/400 the dialog stays open showing the
  server's reason; on success it closes and the table shows the appended rows.

### Print sheet (LightingRigSheet)

- New `FID` column as the first column; empty cell when unset.
