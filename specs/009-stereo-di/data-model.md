# Phase 1 Data Model: Mono/Stereo Channels & DI Cabling

## Entities

### AudioPatchInput (extended)

Existing fields unchanged. New fields (migration `022_stereo_di`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `width` | TEXT, NOT NULL | `'mono'` | `mono` \| `stereo`. Whether this row represents one or two physical inputs. |
| `mixer_behavior` | TEXT, NOT NULL | `'stereo_channel'` | `stereo_channel` \| `linked_channels`. Meaningful only when `width = 'stereo'`; ignored otherwise. Controls console-number display/suggestion only (R2) — never affects routing or counting. |
| `stagebox_id_b` | INTEGER, NULL | NULL | FK → `stageboxes(id)`. Side B's stagebox route, meaningful only when `width = 'stereo'`. Mutually exclusive with `stage_multi_id_b`, same as the existing side-A pair. |
| `stagebox_channel_b` | INTEGER, NULL | NULL | Side B's stagebox channel number. |
| `stage_multi_id_b` | INTEGER, NULL | NULL | FK → `stage_multis(id)`. Side B's stage-multi route. |
| `stage_multi_channel_b` | INTEGER, NULL | NULL | Side B's stage-multi channel number. |
| `source_cable_item_id` | INTEGER, NULL | NULL | FK → `inventory_items(id)`. The source → DI cable. Meaningful only when `signal_type = 'di'`; ignored (but not cleared) otherwise. |
| `source_cabling` | TEXT, NOT NULL | `'two_cables'` | `two_cables` \| `splitter`. Meaningful only when `signal_type = 'di' AND width = 'stereo'`; determines whether `source_cable_item_id` counts once or twice. |

**Validation rules** (API layer, mirrors existing patterns):
- `width` MUST be `mono` or `stereo` → 400 otherwise.
- `mixer_behavior` MUST be `stereo_channel` or `linked_channels` → 400 otherwise (checked unconditionally for simplicity; value is simply unused when mono, per FR-003).
- `source_cabling` MUST be `two_cables` or `splitter` → 400 otherwise (checked unconditionally; unused when not stereo DI, per FR-007).
- `stagebox_id_b` / `stage_multi_id_b`, when set, MUST reference an existing stagebox/stage-multi belonging to the same event → 400 otherwise (same `validRefs`-style check as side A).
- `source_cable_item_id`, when set, MUST reference an existing inventory item → 400 otherwise (same check as `cable_item_id`).
- No server-side enforcement that `stagebox_id_b`/`stage_multi_id_b` are empty when `width = 'mono'` — a mono row simply ignores its `_b` fields on display and counting (matches the "switching stereo→mono... doubled counts return to single" edge case: values may persist but become inert, avoiding silent data loss on an accidental toggle).

**Not stored / not new**: no `pair_id`, no second row, no per-side equipment picks (mic/cable/stand remain single columns applying to both sides — per spec Assumptions).

### AudioPatchOutput (extended)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `width` | TEXT, NOT NULL | `'mono'` | `mono` \| `stereo`. No `mixer_behavior` equivalent — outputs have no console-strip semantics (FR excludes it). |
| `stagebox_id_b` | INTEGER, NULL | NULL | Side B's stagebox route. |
| `stagebox_channel_b` | INTEGER, NULL | NULL | Side B's stagebox channel. |
| `stage_multi_id_b` | INTEGER, NULL | NULL | Side B's stage-multi route. |
| `stage_multi_channel_b` | INTEGER, NULL | NULL | Side B's stage-multi channel. |

Same validation pattern as inputs for `width` and the `_b` reference columns. No source-cable concept on outputs (DI is an input-only signal type).

## Relationships

- `audio_patch_inputs.stagebox_id_b` → `stageboxes.id` (nullable FK, mirrors existing `stagebox_id`)
- `audio_patch_inputs.stage_multi_id_b` → `stage_multis.id` (nullable FK, mirrors existing `stage_multi_id`)
- `audio_patch_inputs.source_cable_item_id` → `inventory_items.id` (nullable FK, mirrors existing `cable_item_id`)
- `audio_patch_outputs.stagebox_id_b` → `stageboxes.id`
- `audio_patch_outputs.stage_multi_id_b` → `stage_multis.id`

No new tables, no new join tables — this slice extends two existing rows with more columns, consistent with Constitution Principle V (Pragmatic Simplicity).

## Derived / computed values (not stored)

- **Suggested next channel number** (frontend only, `AudioInputsTab`/`AudioOutputsTab` `addRow`): `max(occupied) + 1` where `occupied` is the union, over all existing rows, of `{channel_number}` for mono or `stereo_channel` rows and `{channel_number, channel_number + 1}` for `linked_channels` rows.
- **Display channel-number label**: `"${channel_number}"` for mono/`stereo_channel`; `"${channel_number}–${channel_number + 1}"` for `linked_channels`. Pure display formatting, computed wherever a channel number is rendered (tabs, print sheets, signal flow).
- **Rental quantity multiplier per row** (SQL, in the `combined` CTE — see [contracts/stereo-di-api.md](contracts/stereo-di-api.md) and research.md R4): 2 for per-side items on a stereo row, 1 for two-channel devices (DI, amplifier) regardless of width, and for the source-cable arm: 2 only when stereo AND `source_cabling = 'two_cables'`.

## State transitions

- **mono → stereo**: side B route columns become meaningful; frontend defaults them to side A's stagebox/multi + `channel_number + 1` as a one-time convenience fill (FR-002a) — the planner can immediately override. No default is silently reapplied later if side A's route changes afterward.
- **stereo → mono**: side B columns are left as stored (not cleared) but become inert for display/counting purposes — reversible without data loss if the planner toggles back.
- **signal_type → di** (from any other type): `source_cable_item_id`/`source_cabling` become meaningful; any previously stored value (from an earlier di→other→di round trip) reappears rather than being re-entered (FR-012, edge case "Switching signal type away from DI").
- **signal_type: di → other**: `source_cable_item_id` is left as stored but becomes inert for display/counting (same reversible-inertness pattern as width).
