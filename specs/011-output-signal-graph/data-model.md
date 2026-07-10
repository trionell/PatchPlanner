# Phase 1 Data Model: Audio Output Signal-Flow Graph

## Entities

### OutputDevice (extended — `output_devices`)

Existing fields unchanged (`id`, `event_id`, `name`, `inventory_item_id`,
`owned_item_id`). New fields (migration `025_output_graph`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `input_port_count` | INTEGER, NOT NULL | `0` | Number of input jacks on this device. `0` means the device has no input side (a pure source — not expected in practice for a `Device` row, since sources are the implicit mixer/stagebox nodes, but not forbidden). |
| `input_connector_type` | TEXT, NULL | NULL | One connector type for every input jack (e.g. `xlr`). NULL when `input_port_count = 0`. |
| `output_port_count` | INTEGER, NOT NULL | `0` | Number of output jacks. `0` means the device is a pure destination (a speaker, an IEM pack). |
| `output_connector_type` | TEXT, NULL | NULL | One connector type for every output jack (e.g. `speakon`). NULL when `output_port_count = 0`. |
| `position_x` | REAL, NOT NULL | `0` | Canvas position, this event only (R3's per-event placement). |
| `position_y` | REAL, NOT NULL | `0` | |

**Validation rules**:
- `input_port_count`/`output_port_count` MUST be `>= 0`; at least one MUST
  be `> 0` (a device with zero ports on both sides has nothing to connect
  and is meaningless).
- `input_connector_type` MUST be set when `input_port_count > 0`, and
  vice versa (same for output). Connector type values reuse whatever
  vocabulary/free-text convention the existing `connection_type`/
  `connector_type` fields on stageboxes/stage multis already use.
- Exactly one of `inventory_item_id`/`owned_item_id` (unchanged from
  Slice 10).
- Reducing a port count below the number of cables currently attached to
  that side is rejected (`409`) with the list of cables that would be
  orphaned — the caller must delete those cables first (FR-016).

**Role in the graph** (derived, not stored): a device with
`input_port_count = 0` is pinned to the destination rail; with
`output_port_count = 0`, the source rail; with both `> 0`, it's freely
positioned in the middle. The mixer and stageboxes are *always*
source-rail (they are not `Device` rows at all — see below); stage
multis are always middle (both sides configured, from their existing
`channels` field).

### OutputCable (new — `output_cables`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | — | |
| `event_id` | INTEGER, NOT NULL | — | FK → `events(id)` ON DELETE CASCADE |
| `from_kind` | TEXT, NOT NULL | — | `mixer` \| `stagebox` \| `stage_multi` \| `device` (Go-validated) |
| `from_id` | INTEGER, NOT NULL | — | Resolves against `audio_patch_outputs.id` / `stageboxes.id` / `stage_multis.id` / `output_devices.id` depending on `from_kind` — no DB FK (polymorphic), validated in Go (research.md R2/R7) |
| `from_port` | INTEGER, NOT NULL | — | 0-based index into that node's **output** side |
| `to_kind` | TEXT, NOT NULL | — | `stage_multi` \| `device` only — mixer/stagebox have no input side to target |
| `to_id` | INTEGER, NOT NULL | — | Resolves against `stage_multis.id` / `output_devices.id` |
| `to_port` | INTEGER, NOT NULL | — | 0-based index into that node's **input** side |
| `cable_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Always NULL when `to_kind = 'stage_multi'` (R6/FR-013) — the API rejects a non-null value in that case rather than silently dropping it. |

**Validation rules**:
- `from_kind`/`to_kind` MUST be one of the enumerated values.
- `(from_kind, from_id)` and `(to_kind, to_id)` MUST resolve to a real row
  belonging to this event.
- `from_port` MUST be `< ` that node's live output port count;
  `to_port` MUST be `< ` that node's live input port count (R7).
- `(from_kind, from_id, from_port)` MUST be unique across the event's
  cables (a port sources at most one cable).
- `(to_kind, to_id, to_port)` MUST be unique across the event's cables (a
  port receives at most one cable).
- `cable_item_id` MUST be NULL when `to_kind = 'stage_multi'` → `400`
  otherwise (FR-013); otherwise optional, validated the same as every
  other cable pick in this codebase (`validItemRef`).

### AudioPatchOutput (unchanged from Slice 10, minus `chain`)

Keeps `id`, `event_id`, `output_number`, `output_name`, `output_type`,
`width`, `color`, `notes`. The `chain` field (Slice 10's ordered hop
array) is removed — an output channel's signal path is now entirely
expressed through `output_cables` referencing `from_kind = 'mixer',
from_id = <this row's id>`.

**Derived mixer ports** (not stored): output row *i* contributes one
output-only port at `(mixer, i, 0)`; if `width = 'stereo'`, a second,
fully independent port at `(mixer, i, 1)`.

### Stagebox / StageMulti *(existing entities, reused unchanged)*

No schema change. Contribute derived ports:
- Stagebox: `output_count` output-only ports at `(stagebox, id, 0..output_count-1)`. No input ports in this graph (FR-004/spec Assumptions — its own input side belongs to the separate input-patch context).
- StageMulti: `channels` ports on *each* side — `(stage_multi, id, 0..channels-1)` as inputs, and the same index range as outputs. Input index *i* and output index *i* are not automatically linked to each other; each is an independently connectable port (spec FR-012 — a multi's channels don't have to share a source or destination).

## Relationships

- `output_cables.event_id` → `events.id` (cascade delete)
- `output_cables.cable_item_id` → `inventory_items.id`
- `output_cables.{from_id,to_id}` → polymorphic, resolved by `{from,to}_kind` (no DB FK — R2/R7)
- `output_devices.inventory_item_id` → `inventory_items.id`,
  `output_devices.owned_item_id` → `owned_items.id` (unchanged)

## Superseded (dropped)

- `output_chain_hops` — fully replaced by `output_cables` +
  `output_devices`' new port fields. Dropped in migration
  `026_drop_output_chain_hops`, applied only after the Go-level data
  conversion (research.md R5) has run and been verified — kept as a
  separate migration step specifically so the conversion has a clean,
  auditable "before" state to replay against in tests, the same
  before/after separation Slice 10 itself used for its own migration
  test.

## Derived / computed values (not stored)

- **A node's role on the canvas** (source / processing / destination):
  computed from whether it has an input side, an output side, or both —
  never a stored flag, so it can't drift from the port counts it's
  derived from.
- **Rental quantity**: flat per-row counting, no doubling logic anywhere
  in this feature (research.md R4) — `output_devices.{inventory_item_id}`
  contributes `1` per device row; `output_cables.cable_item_id`
  contributes `1` per cable row (excluding `to_kind = 'stage_multi'` rows,
  which are always NULL by construction).
- **Gap flagging** (Signal Flow / print sheet): a port with no cable
  attached is a gap — except a mixer port, which is only a gap if it's
  genuinely unconnected (matches today's "no routing = direct to console,
  not a gap" input-side precedent, generalized: a source with nothing
  downstream isn't inherently wrong, a processing/destination device with
  an unfilled *input* is).

## State transitions

- **Adding a device**: starts with a default position (e.g. the canvas
  center, or offset from the last-added device) — the tech drags it into
  place afterward.
- **Editing a device's port counts**: increasing is always safe (new
  empty ports); decreasing below the number of attached cables on that
  side is rejected until those cables are removed (FR-016).
- **Deleting a device or a stagebox/stage-multi**: every cable
  referencing it (on either the `from` or `to` side, as applicable) is
  deleted, freeing both ends' ports — mirrors the existing
  clear-on-delete behavior for stageboxes/stage-multis/shared devices
  from Slices 0 and 10, generalized from "clear a reference column" to
  "delete the now-dangling cable row" since cables are a real table now,
  not inline columns.
- **Deleting a cable**: only the cable row is removed; both endpoint
  devices remain untouched (FR-015).
