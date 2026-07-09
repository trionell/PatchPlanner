# API Contract: Audio Output Signal-Flow Graph

Base path: `/api/v1`. All bodies JSON.

## Changed: device create/update

### POST `/events/{eventID}/output-devices`
### PATCH `/events/{eventID}/output-devices/{deviceID}`

Request/response body gains port and position fields alongside the
existing `name`/`inventory_item_id`/`owned_item_id`:

```json
{
  "name": "IEM headphone amp",
  "inventory_item_id": 210,
  "owned_item_id": null,
  "input_port_count": 1,
  "input_connector_type": "xlr",
  "output_port_count": 4,
  "output_connector_type": "trs",
  "position_x": 640,
  "position_y": 360
}
```

- `input_port_count`/`output_port_count` — required, `>= 0`, at least one
  `> 0`. Decreasing either below the number of cables currently attached
  to that side → `409`, body lists the cables that would be orphaned.
- `input_connector_type`/`output_connector_type` — required exactly when
  the matching port count is `> 0`, otherwise must be absent/null.
- `position_x`/`position_y` — optional, default `0`; updated freely on
  every drag (the frontend persists position on drag-end, not every
  frame).

### GET `/events/{eventID}/audio-patch`

Response's `output_devices` array carries all of the above; response
gains `output_cables: OutputCable[]` alongside it.

## New: cables

### POST `/events/{eventID}/output-cables`
### PATCH `/events/{eventID}/output-cables/{cableID}`
### DELETE `/events/{eventID}/output-cables/{cableID}`

```json
{
  "from_kind": "device",
  "from_id": 9,
  "from_port": 0,
  "to_kind": "device",
  "to_id": 12,
  "to_port": 0,
  "cable_item_id": 401
}
```

- `from_kind` ∈ `mixer | stagebox | stage_multi | device`; `to_kind` ∈
  `stage_multi | device` (mixer/stagebox are never a `to` — no input side
  to target). `400` on any other value.
- `from_id`/`to_id` MUST belong to this event → `400` otherwise.
- `from_port` MUST be `<` the resolved node's live output port count;
  `to_port` MUST be `<` its live input port count → `400` otherwise
  (data-model.md's derived port counts per kind).
- A port already in use as a `from` (or `to`) elsewhere in this event →
  `409` — delete or re-target the existing cable first.
- `cable_item_id` — optional, `validItemRef`-checked when present; MUST
  be omitted/null when `to_kind = 'stage_multi'` → `400` otherwise
  (FR-013/R6).
- `PATCH` only ever changes `cable_item_id` (re-picking the catalog item
  for an existing run) — moving a cable to different ports is delete +
  create, since ports are 1:1 and there's nothing meaningful to "move"
  partially.

## Changed: rental summary

### GET `/events/{eventID}/rentals`

No shape change. Quantities now reflect flat per-row counting for output
devices/cables (research.md R4) — no width-based doubling anywhere in
this feature's arms. A stereo channel wired through two separate devices
naturally counts `2` (two device rows); wired through one shared device,
`1` (one device row, regardless of how many cables reference it — same
rule Slice 10 already had, just no longer needing a width check to
apply it, since the graph makes "one physical unit" and "two separate
units" different literal row counts instead of a doubling flag).

## Changed: Signal Flow / output print sheet

- Both now walk `output_cables` starting from each mixer output channel's
  port(s), following the chain of `to` → that node's other `from` ports →
  … until a dead end (a destination device, or simply nothing connected
  yet). A stereo channel's two independent paths render exactly the way
  today's side-A/side-B lines already do, generalized from "the row's own
  `_b` columns" to "the second mixer port's own independent cable chain."
- A gap is any port with nothing attached, per data-model.md's derived
  gap rule.

## Removed

- `chain` field on `AudioPatchOutput` (Slice 10) — no longer present in
  create/update payloads or responses.
- The Slice 10 hop-editor's specific validation rules (`hop_kind`,
  `device_source` mutual exclusivity, etc.) — superseded by cable/port
  validation above.

## Unchanged surfaces (asserted by existing tests)

- Input endpoints, groups/DCAs/colors, stereo width/DI cabling on inputs
  (Slice 9) — untouched.
- Stagebox/stage-multi CRUD (Slice 0/4) — untouched in shape; deleting
  one now also deletes any `output_cables` rows referencing it (extends
  the existing clear-on-delete behavior from a column-clear to a
  row-delete, since cables are a real table now).
- Owned-gear catalog/CRUD (Slice 3) — untouched.
