# Phase 1 Data Model: Mobile-Friendly Redesign

No new persisted entities, tables, or migrations. This feature is presentation and interaction only — every field below already exists on an entity the backend already serves; nothing here is written to a new table.

## Reused entities and the fields the mobile UI touches

| Entity (existing) | Fields the mobile edit sheet reads/writes | Notes |
|---|---|---|
| `InputChannel` / `AudioPatchOutput` (audio channel) | `channel_name`/`name`, `color`, `notes` | Direct field PATCH via `updateInputChannel`/`updateAudioOutput`, unchanged from desktop. |
| `InputCable` (audio routing edge) | `from_kind`/`from_id` → `to_kind`/`to_id` | The mobile "source/mic" and "stagebox/input" fields are a simplified view over this graph edge, not a channel field. Reassigning it deletes the channel's current incoming cable (if any) and creates a new one — the same effect as the desktop graph's drag-to-connect. |
| `LightingFixture` | `fixture_number` (console/GrandMA ID), `custom_name`, `dmx_universe`, `dmx_start_address`, `dmx_channel_mode`, `dmx_channel_count` | Direct field PATCH via the existing fixture update call — no graph indirection, unlike audio. |
| `Event` | `name`, `venue`, `date`, `notes` | Overview form, unchanged desktop fields. |
| Vocabulary rows (`channel_colors`, `connector_types`, etc.) | `label`/`value` | Settings/My Defaults add/rename/delete, unchanged desktop calls. |

No validation rule changes: every mobile form defers to the same backend validation the desktop forms already trigger through the same mutation calls.

## New frontend-only view models (not persisted)

### `MobileSectionCapability`

Describes, per event tab, which of the three mobile treatments applies. Used only to drive the `SectionSwitcher`'s labels and which mobile component variant mounts for a given tab — never sent to or read from the backend.

| Field | Type | Values |
|---|---|---|
| `section` | enum | `overview` \| `audio-inputs` \| `audio-outputs` \| `lighting-rig` \| `stage-plots` \| `signal-flow` \| `equipment` \| `rentals` \| `settings` |
| `capability` | enum | `editable` \| `read-only` \| `viewer` |

Fixed mapping (from spec.md's FR-004–FR-013), not user-configurable:

| Section | Capability |
|---|---|
| Overview | editable |
| Audio Inputs | editable |
| Audio Outputs | editable |
| Lighting Rig | editable |
| Settings | editable |
| Stage Plots | viewer |
| Signal Flow | viewer |
| Equipment | read-only |
| Rental Order | read-only |

A signed-in viewer-role user sees every section as read-only regardless of this table (FR-015) — `capability` reflects the section's ceiling, not the current user's actual permission, which the existing `readOnly` prop threaded through every tab already enforces.

### `MobileChannelListItem` (derived, audio inputs/outputs list row)

Computed client-side from the same `getAudioPatch` response the desktop tab already fetches — not a new query.

| Field | Derived from |
|---|---|
| `channelNumber` | `InputChannel.channel_number` |
| `name` | `InputChannel.channel_name` |
| `colorHex` | `InputChannel.color` |
| `sourceLabel` | Resolved upstream node name (same backward-walk `nodeName`/`inputSignalFlow.ts` helper the desktop graph and patch sheet already use) |
| `routingLabel` | Resolved stagebox/device + input number from the same cable walk |

### `MobileFixtureListItem` (derived, lighting list row)

| Field | Derived from |
|---|---|
| `fixtureId` | `LightingFixture.fixture_number` |
| `name` | `LightingFixture.custom_name` or the linked inventory item's name |
| `universe` / `address` | `LightingFixture.dmx_universe` / `dmx_start_address` |
| `mode` / `channelCount` | `LightingFixture.dmx_channel_mode` / `dmx_channel_count` |

No state transitions apply — these are read projections refreshed on every query invalidation, identical in spirit to the desktop table's row rendering.
