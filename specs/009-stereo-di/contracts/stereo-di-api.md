# API Contract: Mono/Stereo Channels & DI Cabling

Base path: `/api/v1`. All bodies JSON. No new endpoints — every existing
audio-patch input/output route gains new optional fields.

## Changed: input create/update

### POST `/events/{eventId}/audio-patch/inputs`
### PATCH `/events/{eventId}/audio-patch/inputs/{inputId}`

Request body gains:

```json
{
  "width": "stereo",
  "mixer_behavior": "linked_channels",
  "stagebox_id_b": 1,
  "stagebox_channel_b": 10,
  "stage_multi_id_b": null,
  "stage_multi_channel_b": null,
  "source_cable_item_id": 146,
  "source_cabling": "splitter"
}
```

- `width` — optional, `mono` (default) or `stereo`. `400` on any other value.
- `mixer_behavior` — optional, `stereo_channel` (default) or `linked_channels`. `400` on any other value. Stored regardless of `width` but only affects display/numbering when `width = "stereo"`.
- `stagebox_id_b` / `stagebox_channel_b` / `stage_multi_id_b` / `stage_multi_channel_b` — optional, same shape and validation as the existing side-A fields (`stagebox_id`/`stagebox_channel`/`stage_multi_id`/`stage_multi_channel`). A `stagebox_id_b` or `stage_multi_id_b` not belonging to this event → `400`, nothing written (same `validRefs`-style check already applied to side A).
- `source_cable_item_id` — optional, references an inventory item. Same validation as `cable_item_id` (must exist → `400` otherwise). Meaningful only when `signal_type = "di"`; storable regardless (see data-model.md state transitions).
- `source_cabling` — optional, `two_cables` (default) or `splitter`. `400` on any other value.

Response (`audioPatchInputResponse`) gains the same fields, always present (empty/null when unset), e.g.:

```json
{
  "id": 5,
  "channel_number": 7,
  "width": "stereo",
  "mixer_behavior": "linked_channels",
  "stagebox_id_b": 1,
  "stagebox_channel_b": 10,
  "source_cable_item_id": 146,
  "source_cabling": "splitter",
  "...": "..."
}
```

## Changed: output create/update

### POST `/events/{eventId}/audio-patch/outputs`
### PATCH `/events/{eventId}/audio-patch/outputs/{outputId}`

Request/response body gains `width`, `stagebox_id_b`, `stagebox_channel_b`,
`stage_multi_id_b`, `stage_multi_channel_b` — same validation as inputs.
No `mixer_behavior`, no `source_cable_item_id`/`source_cabling` (outputs
have no console-strip semantics and DI is an input-only signal type).

## Changed: rental summary

### GET `/events/{eventId}/rental-summary`

No shape change — same `EventRental[]` response. Quantities now reflect:

- Stereo input/output rows: mic/source item, stand, cable (input or
  output), and speaker (output) counted **×2**.
- Stereo DI input rows: the DI item itself (`mic_item_id` slot) stays
  **×1** — a dual-channel DI feeds both sides.
- Stereo output rows: the amplifier item stays **×1** — a stereo amp
  feeds both sides.
- DI input rows with `source_cable_item_id` set: that item counted **×2**
  when `width = "stereo" AND source_cabling = "two_cables"`, otherwise
  **×1** (mono DI, or stereo DI with `source_cabling = "splitter"`).
- Mono rows and pre-existing rows (width defaults to `mono`, no source
  cable): quantities identical to before this feature (SC-005).

## Changed: Excel rental export

No format change — the export reads the same `GetRentalSummary` result,
so doubled/adjusted quantities flow through automatically.

## Unchanged surfaces (asserted by existing tests)

- Groups/DCAs/colors endpoints and payloads (slice 8) — untouched.
- Reference-data endpoint — no new vocabulary; `width`, `mixer_behavior`,
  and `source_cabling` are Go-level validated enums, not reference-data
  rows (see plan.md Constitution Check, Principle II note; research.md
  R7).
- Stagebox/stage-multi CRUD — side B just references existing rows via
  existing FK columns; no change to those endpoints.
