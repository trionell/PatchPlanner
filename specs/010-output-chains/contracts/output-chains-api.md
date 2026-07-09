# API Contract: Output signal chains

Base path: `/api/v1`. All bodies JSON.

## Changed: output create/update

### POST `/events/{eventID}/audio-outputs`
### PATCH `/events/{eventID}/audio-outputs/{outputID}`

Request/response body **drops** `destination_type`, `stagebox_id`,
`stagebox_channel`, `stagebox_id_b`, `stagebox_channel_b`,
`stage_multi_id`, `stage_multi_channel`, `stage_multi_id_b`,
`stage_multi_channel_b`, `amplifier_item_id`, `speaker_item_id`,
`cable_item_id`, `cable_type`, `cable_length_m` — all fully superseded by
`chain`. `width` stays (still channel-level).

Request/response body gains `chain`, an ordered array of hops:

```json
{
  "output_number": 3,
  "output_type": "iem",
  "width": "stereo",
  "chain": [
    {
      "hop_kind": "route",
      "stagebox_id": 1,
      "stagebox_channel": 5,
      "stagebox_id_b": 1,
      "stagebox_channel_b": 6,
      "cable_item_id": 201
    },
    {
      "hop_kind": "device",
      "device_source": "shared",
      "output_device_id": 9,
      "cable_item_id": 210
    },
    {
      "hop_kind": "route",
      "stage_multi_id": 5,
      "stage_multi_channel": 3
    },
    {
      "hop_kind": "device",
      "device_source": "inventory",
      "inventory_item_id": 88,
      "cable_item_id": null
    }
  ]
}
```

(A stagebox output feeding a shared multichannel headphone amp, onward
over a stage multi to a bodypack — the IEM example from the spec.)

- `chain` — optional on write; omitted means "no change" on update,
  explicit `[]` means "clear the chain" (same semantics as `group_ids`
  already uses). Always present in responses (`[]` when empty).
- Every hop's `position` is assigned by the server as the array index —
  the client never sends `position`.
- `hop_kind` — required per hop, `device` or `route`. `400` on any other
  value.
- Device hop (`hop_kind = "device"`): at most one of `inventory_item_id` /
  `owned_item_id` / `output_device_id` may be set. `device_source`, if
  present, must match whichever is set (`inventory`/`owned`/`shared`).
  More than one device FK set → `400`. Referenced ids must belong to this
  event (`inventory_item_id`/`owned_item_id` must exist;
  `output_device_id` must belong to this event) → `400` otherwise.
- Route hop (`hop_kind = "route"`): `stagebox_id` and `stage_multi_id` are
  mutually exclusive (both set → `400`); same for the `_b` pair
  independently. Referenced stagebox/stage-multi ids must belong to this
  event → `400` otherwise (same `validSideBRefs`-style check already used
  for side B on inputs/outputs since Slice 9).
- `cable_item_id` — optional on any hop, references an inventory item
  (`validItemRef`, same as every other cable pick in the codebase).
  `cable_type`/`cable_length_m` — read-only legacy text carried over from
  a pre-Slice-6 row that never got a catalog cable pick; the server never
  writes them from payloads and clears them once `cable_item_id` is set,
  same lifecycle as the pre-existing input/output legacy cable fields.
- The whole `chain` array is validated and replaced atomically; a `400`
  on any hop rejects the entire request, leaving the previous chain
  untouched.

## New: shared output devices

### GET `/events/{eventID}/audio-patch`

Response gains `output_devices: OutputDevice[]` alongside the existing
`stageboxes`/`stage_multis`/`groups`/`dcas` arrays (same "load everything
the tabs need in one call" shape).

### POST `/events/{eventID}/output-devices`
### PATCH `/events/{eventID}/output-devices/{deviceID}`
### DELETE `/events/{eventID}/output-devices/{deviceID}`

```json
{
  "name": "IEM rack — headphone amp",
  "inventory_item_id": 210,
  "owned_item_id": null
}
```

- `name` — required, non-empty → `400` otherwise.
- Exactly one of `inventory_item_id` / `owned_item_id` must be set → `400`
  otherwise. Referenced item must exist → `400` otherwise.
- `DELETE` always succeeds (`204`) and clears `output_device_id` to null
  on every hop across the event that referenced it — it never blocks,
  matching stagebox/stage-multi delete behavior (see research.md R4).
  Response carries no "in use" warning; the resulting gap is visible the
  next time the affected chains are viewed (Signal Flow / print sheet).

## Changed: rental summary

### GET `/events/{eventID}/rental-summary`

No shape change — same `EventRental[]` response. Quantities now reflect:

- A non-shared device hop's `inventory_item_id` and any hop's
  `cable_item_id`: **×2** on a stereo output channel, **×1** on mono
  (identical rule to today's speaker/cable doubling).
- A shared device hop's `output_device_id`: contributes nothing itself —
  the declaration in `output_devices` is what counts, always **×1**,
  regardless of how many chains/hops reference it.
- Owned-gear hops (`device_source = "owned"`) and owned shared devices:
  **never** counted, matching the existing owned-gear rule.
- Migrated pre-existing rows: identical totals to before this feature
  (SC-005) — the old amplifier becomes a one-off shared device (×1, never
  doubles), the old speaker becomes a plain device hop (doubles on
  stereo), the old cable keeps doubling unconditionally.

## Changed: Excel rental export

No format change — reads the same `GetRentalSummary` result.

## Changed: Signal Flow / print sheets

- Signal Flow's per-output-channel row now renders every hop of `chain`
  in order (device name or route label, plus its cable), instead of just
  the old amplifier/speaker/destination fields. A hop missing its device
  or cable pick renders flagged and is included in the gap count,
  mirroring the existing input-side missing-link presentation.
- The output print sheet's per-channel row lists the full chain instead
  of a single destination + amplifier + speaker line.

## Unchanged surfaces (asserted by existing tests)

- Input endpoints, groups/DCAs/colors, stereo width/DI cabling on inputs
  (Slice 9) — untouched.
- Stagebox/stage-multi CRUD — a `route` hop just references existing rows
  via existing FK columns; deleting one now also clears any
  `output_chain_hops` rows that referenced it, extending the existing
  clear-on-delete behavior rather than changing it.
- Owned-gear catalog/CRUD (Slice 3) — untouched; hops and shared devices
  reference it the same way `event_owned_equipment` always has.
