# API Contract: Audio Input Signal-Flow Graph

Base path: `/api/v1`. All bodies JSON.

## Changed: `GET /events/{eventID}/audio-patch`

Response gains/changes:

```json
{
  "stageboxes": [...],
  "stage_multis": [...],
  "groups": [...],
  "dcas": [...],
  "input_sources": [ { "id": 1, "event_id": 5, "name": "Lead Vox", "kind": "mic", "mic_item_id": 40, "stand_item_id": 12, "phantom_power": true, "connector_type": "xlr", "width": "mono", "position_x": 24, "position_y": 24 } ],
  "input_channels": [ { "id": 1, "event_id": 5, "channel_number": 1, "channel_name": "Lead Vox", "width": "mono", "mixer_behavior": "stereo_channel", "color": "#ef4444", "notes": "", "group_ids": [1], "dca_ids": [1] } ],
  "input_devices": [ { "id": 1, "event_id": 5, "name": "DI (Bass)", "inventory_item_id": 88, "input_port_count": 1, "input_connector_type": "jack_ts", "output_port_count": 1, "output_connector_type": "xlr", "position_x": 300, "position_y": 24 } ],
  "input_cables": [ { "id": 1, "event_id": 5, "from_kind": "source", "from_id": 1, "from_port": 0, "to_kind": "stagebox", "to_id": 3, "to_port": 0, "cable_item_id": 401 } ],
  "outputs": [...],
  "output_devices": [...],
  "output_cables": [...],
  "output_mixer_position_y": 0
}
```

- `inputs: AudioPatchInput[]` (Slice 0-11 shape) is removed, replaced by
  `input_sources`/`input_channels`/`input_devices`/`input_cables` above.
- `stageboxes`/`stage_multis`/`groups`/`dcas`/output-side fields are
  unchanged in shape.

## New: sources

### POST `/events/{eventID}/input-sources`
### PATCH `/events/{eventID}/input-sources/{sourceID}`
### DELETE `/events/{eventID}/input-sources/{sourceID}`

```json
{
  "name": "Lead Vox",
  "kind": "mic",
  "mic_item_id": 40,
  "stand_item_id": 12,
  "phantom_power": true,
  "connector_type": "xlr",
  "width": "mono",
  "position_x": 24,
  "position_y": 24
}
```

- `kind` ∈ `mic | line`. `400` on any other value.
- `kind = 'mic'` REQUIRES `mic_item_id` → `400` if absent.
- `kind = 'line'` FORBIDS `mic_item_id`, `stand_item_id`, and
  `phantom_power = true` → `400` if any is present/true (mirrors the
  input/output connector-type mutual-exclusivity checks already used for
  `output_devices`).
- `connector_type` — required regardless of `kind`, `validItemRef`/
  vocabulary-checked against `preamp_connectors` (gains `mini_jack_3_5mm`,
  FR-021).
- `width` ∈ `mono | stereo` (`ValidWidths`, reused).
- `DELETE` removes every `input_cables` row referencing this Source as a
  `from` (FR-020) — same clear-on-delete convention as Output-graph
  devices.

## New: devices

### POST `/events/{eventID}/input-devices`
### PATCH `/events/{eventID}/input-devices/{deviceID}`
### DELETE `/events/{eventID}/input-devices/{deviceID}`

```json
{
  "name": "DI (Bass)",
  "inventory_item_id": 88,
  "owned_item_id": null,
  "input_port_count": 1,
  "input_connector_type": "jack_ts",
  "output_port_count": 1,
  "output_connector_type": "xlr",
  "position_x": 300,
  "position_y": 24
}
```

Identical validation shape to `output_devices` (data-model.md) — port
counts `>= 0` with at least one `> 0`, connector type required exactly
when its side's count is `> 0`, exactly one of
`inventory_item_id`/`owned_item_id`, decreasing a port count below its
attached-cable count → `409` listing the cables that would be orphaned.

## New: channels (replaces the old `audio-inputs` payload shape)

### POST `/events/{eventID}/input-channels`
### PATCH `/events/{eventID}/input-channels/{channelID}`
### DELETE `/events/{eventID}/input-channels/{channelID}`

```json
{
  "channel_number": 1,
  "channel_name": "Lead Vox",
  "width": "mono",
  "mixer_behavior": "stereo_channel",
  "color": "#ef4444",
  "notes": "",
  "group_ids": [1],
  "dca_ids": [1]
}
```

Same route path/shape family as today's `audio-inputs` endpoints, minus
every field that moved to `InputSource`/`InputCable` (data-model.md).
`group_ids`/`dca_ids` behavior unchanged from today (omitting `group_ids`
on create routes to the event's LR group; an explicit array, including
`[]`, is stored verbatim).

## New: cables

### POST `/events/{eventID}/input-cables`
### PATCH `/events/{eventID}/input-cables/{cableID}`
### DELETE `/events/{eventID}/input-cables/{cableID}`

```json
{
  "from_kind": "source",
  "from_id": 1,
  "from_port": 0,
  "to_kind": "stagebox",
  "to_id": 3,
  "to_port": 0,
  "cable_item_id": 401
}
```

- `from_kind` ∈ `source | stagebox | stage_multi | device`; `to_kind` ∈
  `stagebox | stage_multi | device | channel`. `400` on any other value
  or on `from_kind = 'channel'` / `to_kind = 'source'` (neither has the
  matching port side).
- `from_id`/`to_id` MUST belong to this event → `400` otherwise.
- `from_port` MUST be `<` the resolved node's live output port count;
  `to_port` MUST be `<` its live input port count.
- `(to_kind, to_id, to_port)` already in use elsewhere in this event →
  `409` — no exception (unlike the Output graph's Mixer `to` side, which
  doesn't apply here since `source` is never a `to_kind`).
- `(from_kind, from_id, from_port)` already in use elsewhere → `409`,
  **unless** `from_kind = 'source'` (FR-006 — a Source's output port may
  originate more than one cable at once).
- `cable_item_id` — optional, `validItemRef`-checked when present; MUST
  be omitted/null when `from_kind ∈ {stagebox, stage_multi}` AND
  `to_kind = 'channel'` → `400` otherwise (research.md R5).
- `PATCH` only ever changes `cable_item_id` — moving a cable to different
  ports is delete + create (same convention as `output_cables`).

## Changed: rental summary

### GET `/events/{eventID}/rentals`

No shape change. Gains arms for `input_sources` (mic + stand items),
`input_devices` (inventory/owned item), and `input_cables.cable_item_id`
(excluding rows that are `NULL` by construction — cableless
stagebox/stage-multi→channel hops, and any deliberately-`null` half of a
splitter pair, research.md R6). No width-based doubling logic anywhere in
this feature's arms, same flat per-row counting as the Output graph
(Slice 11 research.md R4).

## Changed: Signal Flow / input print sheet

- Both now enumerate `input_channels` by `channel_number` (unchanged
  order) and, per channel, walk `input_cables` **backward** — from the
  Channel's port, to whichever edge targets it, to that edge's origin,
  recursing until a Source (research.md R8) — rather than the Output
  graph's forward walk from the Mixer.
- A Channel with no cable reaching it is a gap (spec Edge Cases); a
  Source/Device/Stagebox/Stage-Multi port with nothing attached is simply
  unused capacity, not a gap.

## Removed

- `AudioPatchInput`'s source-only fields (`signal_type`,
  `preamp_connector`, `stagebox_id[_b]`, `stage_multi_id[_b]`,
  `mic_item_id`, `mic_label`, `cable_item_id`, `stand_item_id`,
  `cable_type`, `cable_length_m`, `mic_stand`, `phantom_power`,
  `source_cable_item_id`, `source_cabling`) — no longer present in any
  request/response body. Replaced by `InputSource`/`InputCable`/
  `InputDevice` above.

## Unchanged surfaces (asserted by existing tests)

- Output-graph endpoints (`output-devices`, `output-cables`, `outputs`) —
  entirely untouched; `input_devices`/`input_cables` are separate tables
  (research.md R3).
- Stagebox/Stage-Multi CRUD — untouched in shape; deleting one now also
  deletes any `input_cables` rows referencing it, alongside the existing
  `output_cables` clear-on-delete (Slice 11).
- Groups/DCAs/colors CRUD (Slice 8) — untouched; membership continues to
  target the same `input_channels.id` (renamed table, same ids,
  research.md R4).
- Owned-gear catalog/CRUD (Slice 3) — untouched.
