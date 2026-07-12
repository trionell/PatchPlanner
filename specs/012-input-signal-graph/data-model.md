# Phase 1 Data Model: Audio Input Signal-Flow Graph

## Entities

### InputSource (new — `input_sources`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | — | |
| `event_id` | INTEGER, NOT NULL | — | FK → `events(id)` ON DELETE CASCADE |
| `name` | TEXT, NOT NULL | — | |
| `kind` | TEXT, NOT NULL | — | `mic` \| `line` (Go-validated enum, same treatment as `width`/`mixer_behavior` — structurally drives which other fields apply, not a reference vocabulary, research.md R3's sibling note) |
| `mic_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Required when `kind = 'mic'`, forbidden otherwise. |
| `stand_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Optional, meaningful only when `kind = 'mic'`. |
| `phantom_power` | INTEGER (bool), NOT NULL | `0` | Meaningful only when `kind = 'mic'`; forced `false` when `kind = 'line'`. |
| `connector_type` | TEXT, NOT NULL | — | Always required regardless of kind; reuses the existing `preamp_connectors` vocabulary (gains a `3.5mm TRS (mini-jack)` value, FR-021). |
| `width` | TEXT, NOT NULL | `'mono'` | `mono` \| `stereo` (`ValidWidths`, reused). |
| `position_x` / `position_y` | REAL, NOT NULL | `0` | Canvas placement, this event only. |

**Validation rules**:
- `kind` MUST be `mic` or `line`.
- `kind = 'mic'` REQUIRES `mic_item_id`; `kind = 'line'` FORBIDS
  `mic_item_id`, `stand_item_id`, and `phantom_power = true` (`400` if
  violated).
- `connector_type` MUST always be present, independent of `kind`.
- Deleting a Source deletes every `input_cables` row that references it
  (FR-020) after a confirmation prompt — mirrors the Output graph's
  device-deletion behavior.

**Role in the graph** (derived, not stored): always the source rail —
symmetric with the Output graph's Mixer/source-role devices, a Source has
no input side at all.

### InputChannel (renamed in place from `audio_patch_inputs` — `input_channels`)

Existing fields kept unchanged: `id`, `event_id`, `channel_number`,
`channel_name`, `width`, `mixer_behavior`, `color`, `notes`, plus the
existing `audio_input_groups`/`audio_input_dcas` memberships (FK'd on the
same `id`, untouched by the rename — research.md R4).

Dropped fields (moved to `InputSource`/`InputCable`, or superseded
entirely): `signal_type`, `preamp_connector`, `stagebox_id`,
`stagebox_channel`, `stage_multi_id`, `stage_multi_channel`,
`stagebox_id_b`, `stagebox_channel_b`, `stage_multi_id_b`,
`stage_multi_channel_b`, `mic_item_id`, `mic_label`, `cable_item_id`,
`stand_item_id`, `cable_type`, `cable_length_m`, `mic_stand`,
`phantom_power`, `source_cable_item_id`, `source_cabling`.

**Validation rules**: unchanged from today for the kept fields
(`channel_number` uniqueness per event, `width`/`mixer_behavior` enums,
`color` a `channel_colors` vocabulary value).

**Derived mixer-equivalent port** (not stored): every Channel row
contributes exactly one input-only port at `(channel, id, 0)` — unlike
the Output graph's Mixer, there is no stereo-doubling here; a "stereo"
Channel (`width = 'stereo'`) is two independent `InputChannel` rows today
already (Slice 9's convention, unchanged) — the Playback L/R example in
the accepted mockup is two rows, not one row with two ports.

**Role in the graph** (derived, not stored): always the destination rail
— a Channel has no output side.

### InputDevice (new — `input_devices`)

Same shape as `output_devices`'s port/connector/position fields
(research.md R3), deliberately without the Slice-11-round-6 link-out
fields (`link_port_count`/`link_connector_type`) — no daisy-chaining
concept is needed on the input side.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | — | |
| `event_id` | INTEGER, NOT NULL | — | FK → `events(id)` ON DELETE CASCADE |
| `name` | TEXT, NOT NULL | — | |
| `inventory_item_id` / `owned_item_id` | INTEGER, NULL | NULL | Exactly one set. |
| `input_port_count` | INTEGER, NOT NULL | `0` | |
| `input_connector_type` | TEXT, NULL | NULL | Required exactly when `input_port_count > 0`. |
| `output_port_count` | INTEGER, NOT NULL | `0` | |
| `output_connector_type` | TEXT, NULL | NULL | Required exactly when `output_port_count > 0`. |
| `position_x` / `position_y` | REAL, NOT NULL | `0` | |

**Validation rules**: identical shape to `output_devices` — both port
counts `>= 0`, at least one `> 0`; connector type set exactly when its
side's count is `> 0`; exactly one of `inventory_item_id`/`owned_item_id`;
reducing a port count below its attached-cable count → `409` listing the
orphaned cables (mirrors Slice 11 FR-016).

**Role in the graph** (derived): a device with `input_port_count = 0`
would be source-role, `output_port_count = 0` destination-role, but in
practice every input-side device declared here has both sides `> 0` (a
DI box always has an in and an out) — it's the Processing zone,
free-floating, exactly like the Output graph's processing devices.

### InputCable (new — `input_cables`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | — | |
| `event_id` | INTEGER, NOT NULL | — | FK → `events(id)` ON DELETE CASCADE |
| `from_kind` | TEXT, NOT NULL | — | `source` \| `stagebox` \| `stage_multi` \| `device` (Go-validated) |
| `from_id` | INTEGER, NOT NULL | — | Resolves against `input_sources.id` / `stageboxes.id` / `stage_multis.id` / `input_devices.id` — polymorphic, no DB FK, Go-validated (research.md R2) |
| `from_port` | INTEGER, NOT NULL | — | 0-based index into that node's output side |
| `to_kind` | TEXT, NOT NULL | — | `stagebox` \| `stage_multi` \| `device` \| `channel` — `source` is never a `to_kind` (no input side) |
| `to_id` | INTEGER, NOT NULL | — | Resolves against `stageboxes.id` / `stage_multis.id` / `input_devices.id` / `input_channels.id` |
| `to_port` | INTEGER, NOT NULL | — | 0-based index into that node's input side (always `0` when `to_kind = 'channel'`, a Channel has exactly one port) |
| `cable_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Forced NULL when `from_kind ∈ {stagebox, stage_multi}` AND `to_kind = 'channel'` (research.md R5) — API rejects a non-null value in that case. |

**Validation rules**:
- `from_kind`/`to_kind` MUST be one of the enumerated values.
- `(from_kind, from_id)`/`(to_kind, to_id)` MUST resolve to a real row
  belonging to this event.
- `from_port` MUST be `<` that node's live output port count; `to_port`
  MUST be `<` that node's live input port count.
- `(to_kind, to_id, to_port)` MUST be unique across the event's cables (a
  port receives at most one cable) — no exception, unlike the Output
  graph's Mixer.
- `(from_kind, from_id, from_port)` MUST be unique **unless**
  `from_kind = 'source'` — a Source's output port may originate more than
  one cable at once (FR-006, double-patching) — every other `from_kind`
  stays one-cable-per-port.
- `cable_item_id` MUST be NULL when `from_kind ∈ {stagebox, stage_multi}`
  and `to_kind = 'channel'` (R5) → `400` otherwise; otherwise optional,
  `validItemRef`-checked when present.

### Stagebox / StageMulti *(existing entities, reused unchanged)*

No schema change. Shared unchanged with the Output graph — the same row
can be cabled independently on both graphs, since `input_cables` and
`output_cables` are entirely separate tables. Contribute derived ports
for the Input graph:
- Stagebox: `input_count` ports on each side — `(stagebox, id,
  0..input_count-1)` as an input side (real cable in, from a Source or
  Device) and the *same* index range as an output side (cableless,
  research.md R5, to a Channel only).
- StageMulti: `channels` ports on each side, same shape as the Stagebox
  above, using its existing `channels` field.

## Relationships

- `input_cables.event_id` → `events.id` (cascade delete)
- `input_cables.cable_item_id` → `inventory_items.id`
- `input_cables.{from_id,to_id}` → polymorphic, resolved by
  `{from,to}_kind` (no DB FK — research.md R2)
- `input_sources.mic_item_id` / `.stand_item_id` → `inventory_items.id`
- `input_devices.inventory_item_id` → `inventory_items.id`,
  `input_devices.owned_item_id` → `owned_items.id`
- `input_channels.id` ← `audio_input_groups.input_id` /
  `audio_input_dcas.input_id` (unchanged FK target, table renamed in
  place — research.md R4)

## Superseded (dropped)

- `audio_patch_inputs`'s source-only columns (listed under InputChannel
  above) — dropped in a follow-up migration
  (`030_drop_legacy_input_channel_columns`) applied only after the Go-level
  data conversion (research.md R7) has run and been verified, mirroring
  Slice 11's two-migration split (extend/convert, then drop) so the
  conversion has a clean, auditable "before" schema to replay against in
  tests.

## Derived / computed values (not stored)

- **A node's role on the canvas**: Source always source-role;
  Stagebox/StageMulti/Device always processing-role (both port sides
  populated); Channel always destination-role. Never a stored flag.
- **Rental quantity**: flat per-row counting — `input_sources.mic_item_id`/
  `.stand_item_id` contribute per Source row; `input_devices.
  {inventory_item_id,owned_item_id}` per Device row;
  `input_cables.cable_item_id` per cable row (naturally excluding
  `NULL`-by-construction cableless rows, and any deliberately-`null`
  splitter-pair row, research.md R6 — no special-case logic needed).
- **A port/node's displayed color** (research.md R9): traced forward from
  that port through `input_cables` to whichever Channel(s) it reaches —
  a single shared color, or neutral if none/conflicting. Computed
  client-side on every render; never persisted anywhere but
  `input_channels.color` itself.
- **Gap flagging** (Signal Flow / print sheet): a Channel with no cable
  targeting it is a gap (research.md R8). A Source, Device, or
  Stagebox/Stage-Multi port with nothing attached is simply unused
  capacity, not flagged — mirrors the Output graph's "a stage multi's
  unused channels are not a gap" rule.

## State transitions

- **Adding a Source/Device**: starts at a default canvas position; the
  engineer drags it into place afterward (same convention as the Output
  graph).
- **Editing a Device's port counts**: increasing is always safe;
  decreasing below the number of attached cables on that side is
  rejected (`409`) until those cables are removed first.
- **Deleting a Source, Device, Stagebox, or Stage Multi**: every
  `input_cables` row referencing it (`from` or `to` side, as applicable)
  is deleted, after confirmation — mirrors the Output graph's
  clear-on-delete behavior (FR-020).
- **Deleting a Channel**: same as above; also removes its
  `audio_input_groups`/`audio_input_dcas` membership rows via existing
  cascade.
- **Deleting a cable**: only the cable row is removed; both endpoint
  nodes remain untouched.
- **Switching a Source's `kind` from `mic` to `line`**: `mic_item_id`,
  `stand_item_id`, and `phantom_power` are cleared server-side as part of
  the same update (spec Edge Cases) — never silently retained.
