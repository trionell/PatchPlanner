# Phase 1 Data Model: Output signal chains

## Entities

### OutputDevice (new — `output_devices`)

A shared, event-scoped declaration of one physical device, referenced by
position from any number of output channels' chain hops. Managed the same
way as Stagebox/StageMulti (its own small manager, not folded into any
patch row).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | — | |
| `event_id` | INTEGER, NOT NULL | — | FK → `events(id)` ON DELETE CASCADE |
| `name` | TEXT, NOT NULL | — | e.g. "IEM rack — headphone amp" |
| `inventory_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Rented; counted once on the rental order regardless of hop-reference count. |
| `owned_item_id` | INTEGER, NULL | NULL | FK → `owned_items(id)`. Owned gear; never counted on the rental order (Slice 3 invariant), same as every other owned-gear reference. |

**Validation rules**:
- `name` MUST be non-empty.
- Exactly one of `inventory_item_id` / `owned_item_id` MUST be set → 400
  otherwise (mirrors the mutual-exclusivity check already used for
  destination-type FK pairs).
- Referenced item MUST exist → 400 otherwise (`validItemRef` pattern).
- Delete: clears `output_device_id` to NULL on every hop that referenced
  it (those hops become an incomplete "device not yet picked" gap), then
  deletes the row — never blocks, matching `DeleteStagebox`/
  `DeleteStageMulti` (R4).

### OutputChainHop (new — `output_chain_hops`)

One step in one output channel's signal path. Belongs to exactly one
output row; ordered within it.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | — | |
| `output_id` | INTEGER, NOT NULL | — | FK → `audio_patch_outputs(id)` ON DELETE CASCADE |
| `position` | INTEGER, NOT NULL | — | 0-based order within the chain; consecutive, renumbered on every wholesale replace (R5) |
| `hop_kind` | TEXT, NOT NULL | `'device'` | `device` \| `route` (Go-validated; selects which of the columns below are meaningful) |
| `cable_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. The cable feeding into this hop (side A when stereo). Meaningful for either hop kind. Doubles on a stereo channel *unless* `cable_item_id_b` is set (R3 addendum below), same as today's `cable_item_id`. |
| `cable_item_id_b` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Side B's own, independently-picked cable — meaningful only when the output's `width = 'stereo'`. Added post-implementation: a stereo hop's two physical runs are not always the same length (an amplifier on one side of the stage needs a shorter cable to the near speaker than the far one). Left unset, `cable_item_id` doubles as before (no forced extra step for the common case); set it and each side counts its own pick once. |
| `cable_type` | TEXT, NULL | NULL | Legacy pre-Slice-6 free-text cable type, meaningful only when `cable_item_id IS NULL` — same read-only-until-repicked lifecycle as the pre-existing column it's migrated from (Slice 6 backfill was conservative; not every row got a catalog pick). Server never writes it from payloads. No legacy equivalent for side B — `cable_item_id_b` is new in this slice. |
| `cable_length_m` | REAL, NULL | NULL | Legacy pre-Slice-6 free-text cable length, same lifecycle as `cable_type`. |
| `device_source` | TEXT, NULL | NULL | `inventory` \| `owned` \| `shared` (Go-validated). Meaningful only when `hop_kind = 'device'`; selects which one of the three columns below is set. |
| `inventory_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. Set when `device_source = 'inventory'`. Doubles on a stereo channel (per-side item, R3). |
| `owned_item_id` | INTEGER, NULL | NULL | FK → `owned_items(id)`. Set when `device_source = 'owned'`. Never rental-counted. |
| `output_device_id` | INTEGER, NULL | NULL | FK → `output_devices(id)`. Set when `device_source = 'shared'`. Always counted once, never doubles (R3). |
| `stagebox_id` | INTEGER, NULL | NULL | FK → `stageboxes(id)`. Set when `hop_kind = 'route'`. Mutually exclusive with `stage_multi_id`. |
| `stagebox_channel` | INTEGER, NULL | NULL | |
| `stagebox_id_b` | INTEGER, NULL | NULL | Side B route, meaningful only when the output channel's `width = 'stereo'` — same independently-patched-side semantics as Slice 9 (R3). |
| `stagebox_channel_b` | INTEGER, NULL | NULL | |
| `stage_multi_id` | INTEGER, NULL | NULL | FK → `stage_multis(id)`. Mutually exclusive with `stagebox_id`. |
| `stage_multi_channel` | INTEGER, NULL | NULL | |
| `stage_multi_id_b` | INTEGER, NULL | NULL | Side B route. |
| `stage_multi_channel_b` | INTEGER, NULL | NULL | |

**Validation rules** (API layer, checked on the whole `chain` array
whenever an output row is created/updated):
- `hop_kind` MUST be `device` or `route` → 400 otherwise.
- `hop_kind = 'device'`: at most one of `inventory_item_id` /
  `owned_item_id` / `output_device_id` may be set (none yet = incomplete
  hop, allowed per spec edge cases); if more than one is set → 400.
  `device_source`, if set, MUST match whichever FK is populated.
- `hop_kind = 'route'`: `stagebox_id` and `stage_multi_id` are mutually
  exclusive (same rule as the pre-existing side-A pair); `_b` fields
  follow the same mutual exclusivity independently.
- Every FK, when set, MUST reference a row belonging to the same event
  (`itemBelongsToEvent`/`validItemRef`/`validSideBRefs` patterns, all
  pre-existing).
- `position` values are assigned by the server as the 0-based array index
  on every wholesale replace — the client does not send `position`
  directly, avoiding a whole class of gap/duplicate/out-of-range
  validation for no behavioral gain (R5: chains are always replaced
  wholesale, so there's nothing to reconcile against).

### AudioPatchOutput (extended, superseded columns dropped)

Migration `023_output_chains` adds:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `chain` | *(not a column — see below)* | | The row's hops live in `output_chain_hops`, joined by `output_id`; there is no denormalized column on the output row itself. |

...and **drops** (table rebuild, values converted into hop rows first —
see research.md R6): `destination_type`, `stagebox_id`,
`stagebox_channel`, `stagebox_id_b`, `stagebox_channel_b`,
`stage_multi_id`, `stage_multi_channel`, `stage_multi_id_b`,
`stage_multi_channel_b`, `amplifier_item_id`, `speaker_item_id`,
`cable_item_id`, `cable_type`, `cable_length_m`. Every one of these is
fully superseded by hop rows; none has any remaining meaning once the
chain exists.

**Columns that remain unchanged**: `id`, `event_id`, `output_number`,
`output_name`, `output_type`, `width` (still channel-level — determines
hop doubling, R3), `color`, `notes`.

## Relationships

- `output_chain_hops.output_id` → `audio_patch_outputs.id` (1 output : N
  hops, cascade delete)
- `output_chain_hops.output_device_id` → `output_devices.id` (N hops : 1
  shared device, nullable — most hops reference nothing here)
- `output_chain_hops.stagebox_id(_b)` → `stageboxes.id`,
  `output_chain_hops.stage_multi_id(_b)` → `stage_multis.id` (route hops
  only)
- `output_chain_hops.{inventory_item_id,cable_item_id,cable_item_id_b}` → `inventory_items.id`
- `output_chain_hops.owned_item_id` → `owned_items.id`
- `output_devices.event_id` → `events.id` (1 event : N shared devices,
  cascade delete)
- `output_devices.inventory_item_id` → `inventory_items.id`,
  `output_devices.owned_item_id` → `owned_items.id`

## Derived / computed values (not stored)

- **Rental quantity per hop** (SQL, `output_chain_hops` CTE arms — see
  research.md R7): a non-shared device hop uses
  `CASE WHEN width='stereo' THEN 2 ELSE 1 END`; a hop's cable uses
  `CASE WHEN width='stereo' AND cable_item_id_b IS NULL THEN 2 ELSE 1 END`
  (doubles only when side B hasn't been given its own independent pick);
  `cable_item_id_b`, when set, contributes its own flat `1` on a stereo
  channel (never on mono — inert-not-lost, same as every other side-B
  field); a shared-device reference contributes nothing directly (the
  declaration itself, in `output_devices`, contributes a flat `1`
  independent of hop count).
- **Chain completeness / gap flag** (Signal Flow, mirrors the existing
  input-side missing-link logic): a hop is a gap if `hop_kind = 'device'`
  and no device source is set, or if `hop_kind = 'route'` and neither
  `stagebox_id` nor `stage_multi_id` is set — a hop's cable (either side)
  is optional and never itself a gap, matching how a missing non-DI
  cable already isn't flagged on the input side (FR-013).

## State transitions

- **Adding/reordering/removing a hop**: the client sends the full,
  reordered `chain` array on the output's update call; the server deletes
  all existing hop rows for that output and re-inserts the array with
  `position` = array index, in one transaction (matches the existing
  `group_ids`/`dca_ids` "replace wholesale" pattern — no partial-hop
  endpoints).
- **mono → stereo**: a `route` hop's `_b` fields become meaningful; a
  device/cable's rental quantity starts doubling (unless the device is a
  shared reference). No new one-time convenience default is introduced for
  hops beyond what Slice 9 already does for the (now hop-scoped) route's
  side B.
- **stereo → mono**: `_b` fields and quantities revert to their `width`-
  driven behavior automatically (nothing to migrate — doubling is computed
  at query time, not stored).
- **Deleting a shared device**: every hop referencing it via
  `output_device_id` reverts to `device_source = NULL`,
  `output_device_id = NULL` (an incomplete device pick, flagged as a gap)
  — R4.
- **Deleting a stagebox/stage-multi**: every `route` hop referencing it
  (side A or B) has that side's FK/channel cleared — same clearing
  behavior `DeleteStagebox`/`DeleteStageMulti` already apply to the
  pre-existing `audio_patch_inputs`/`audio_patch_outputs` columns, now
  extended to also clear `output_chain_hops`.
