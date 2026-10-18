## Why

PatchPlanner's groups and DCAs belong to the **event**, not to a desk, and there is nothing else
inside the desk: no monitor mixes, FX sends, matrices or mains, no record of which mix feeds which
output, and no recorder. A two-desk event therefore shares one set of groups between FOH and
Monitor, an output's mix is guessed from its type, and Slice 49's showfile export has nothing to
write. With Slice 47 a desk has a model and its mix pools; this slice fills them.

## What Changes

- **Mixes per desk.** Six mix types: Main (LR, plus M/C on X32 · M32, C and Mono on LV1 32+),
  Subgroup (Group on LV1), Monitor, FX, Matrix; plus DCAs and mute groups. Each lives on one desk,
  in a slot of that desk's pool, mono or stereo where the engine allows.
- **Pool rules per engine**, hard-blocked like Slice 47:
  - X32 · M32: one pool of 16 buses shared by subgroups, monitors and FX; bus → LR and → M/C; no
    bus → bus; 6 matrices fed by LR, M/C and buses; odd–even pairs; 8 DCAs, 6 mute groups.
  - LV1: separate pools per type and tier; groups always stereo; a group may feed any
    higher-numbered group; each group's Main on/off; 8 matrices of up to 12 sources including
    channels; 16 DCAs, 8 mute groups.
  - Generic: every type, any count, no pool checks, LV1's feed-forward group rule.
- **Routes are membership only** — no levels, pans or taps.
- **A new tab, Desk Routing**, between Audio Inputs and Audio Outputs, one desk at a time with
  Slice 47's selector: eight tables (Mains, Subgroups/Groups, Monitors, FX, Matrices, DCAs, Mute
  groups, Recorder) shown one at a time from an index row, and a Flow canvas of that desk's inside.
- **Outputs gain Fed by** — a mix (or, on LV1, a channel direct out), set in the Outputs row editor.
  `output_type` stays the destination.
- **A recorder per desk**: the X32 · M32 card (32 / 32), the LV1 SoundGrid recorder (64 / 64), or a
  typed one on Generic. A track records a channel's preamp or a mix side, and plays back into a
  channel as soundcheck or source.
- **The Inputs sheet's Buses column becomes Routes**, and its editor edits the channel's own desk's
  mains, groups, DCAs and mute groups; monitor and FX membership is edited on Desk Routing.
- **A new channel joins its desk's Main LR**, as it joins the event's LR today (user, 2026-10-18).
- **Mute groups may hold channels and mixes** (user, 2026-10-18).
- **The model switch also maps mixes** (Moved / Changed / Left out / Fits again), nothing deleted.
- **Migration**: the event's built-in LR becomes each desk's Main LR, every other group a Subgroup
  routed to Main, DCAs move across, every membership kept; on multi-desk events a group or DCA is
  copied to each desk holding one of its channels. Fed by is filled only on an exact name match.
- **BREAKING**: the channel API's `group_ids` / `dca_ids` and the event-level group and DCA
  endpoints are replaced by per-desk mixes and routes. The Buses drawer is deleted.

## Capabilities

### New Capabilities

- `desk-mixes`: the mixes, DCAs and mute groups of a desk, their pools and slots per engine, what
  may route to what, Fed by on outputs, new-channel defaults, the migration from event-level
  groups, and how a model switch maps them.
- `desk-recorder`: the recorder a desk carries, its tracks, what a track records and plays back into.
- `desk-routing-views`: the Desk Routing tab — its tables, column editing, index row, canvas, phone
  form and read-only roles — and the Routes column on the Inputs sheet.

### Modified Capabilities

None in `openspec/specs/`. Slice 47's `console-desk-model` (not yet archived) is extended by the
mix lines of the switch preview, stated here under `desk-mixes`.

## Impact

**Backend.** Migration `055_desk_mixes` (tables `desk_mixes`, `desk_routes`, `desk_recorder_tracks`;
`audio_patch_outputs.fed_by_*`; data moved from `mixer_groups`, `mixer_dcas`,
`audio_input_groups`, `audio_input_dcas`, which are then dropped). `internal/domain` (mix kinds,
pool rules on the Slice 47 profiles), `internal/db/buses.go` (replaced), `internal/db/audio_patch.go`
(channel create joins Main LR; outputs' Fed by), `internal/api` (mix, route and recorder endpoints;
the audio-patch payload), `service/deskmap.go` (mixes in the switch), `service/audio_pdf_sections.go`
and `service/audio_graph.go` (bus labels from routes).

**Frontend.** New `DeskRoutingTab` and its tables, column editor, canvas and phone sheet;
`useEventTab` / `EventDetail` (tenth tab); `InputSheet` and `MobileChannelEditSheet` (Routes);
`OutputSheet` and `MobileOutputEditSheet` (Fed by); `SignalFlowTab` (bus pills); `ConsoleSection`
(Recorder spec); `ModelSwitchDialog` (mix lines). Deleted: `BusesDrawer`, `BusSection`, the Rig-bar
Buses button and the phone's Groups & DCAs row.

**`design/`.** C1 (patterns.md §1, amends B6), C2 (§1), C3 (§2), C4 (§6, §7e, components.md §5),
C5 (components.md §ui/Drawer, §ui/GearList), approved 2026-10-18, written with the code.

**Depends on** Slice 47 (`desk-models`). **Needed by** Slice 49 (`console-showfile-export`).

## Constitution Check — Principles I–V

**I. Domain-First Data Model.** Reinforced. A mix, a DCA and a recorder track are things on a
particular desk; modelling them on the event was the approximation. Membership is a relation
(`desk_routes`), never a free-text list.

**II. Extensibility by Design.** Mix kinds are Go-validated enums because each carries pool and
routing semantics in code (as `ValidWidths` does); the pools come from the Slice 47 profiles, so a
new model needs no routing code. Generic covers any desk not on the list.

**III. Full-Stack Monorepo Architecture.** Unchanged. Route legality is checked by the server and
the same rules are served to the frontend with the profiles.

**IV. Inventory-Driven Rental Workflow.** Unaffected. Mixes, routes and recorder tracks are desk
configuration, not equipment; nothing is added to the rental order.

**V. Pragmatic Simplicity.** No levels, no drag routing, no FX racks. One routes table serves every
kind of membership. The Buses drawer is deleted, not kept beside the tab that replaces it.

### Declared deviation

Groups and DCAs that a multi-desk event shared become **copies on each desk** — an edit to FOH's
"Drums" no longer reaches Monitor's. That is the user's ruling that desks stay separate; the
migration keeps every membership.
