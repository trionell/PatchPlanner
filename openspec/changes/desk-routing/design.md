# Design — desk routing

The approved mockup is `mockup.html` (revision 2, https://claude.ai/artifact/Lvxz1DXXCwGrf9U9cVzQkf,
approved 2026-10-18 with C1–C5). It holds every visual value. The user's answers in that review
changed four of its decisions; the specs carry the answers:

| Mockup | Decided |
|---|---|
| A new channel joins no mix | It joins its desk's Main LR |
| Mute groups hold channels only | They hold channels and subgroups / groups / buses |
| LV1 recorder: typed tracks, default 64 | 64 / 64, read from the model |
| X32 card playback per track (assumed user in) | Confirmed |

## Context

- `mixer_groups` / `mixer_dcas` (migration 021) are per event; `audio_input_groups` /
  `audio_input_dcas` hold membership; a built-in LR group exists on every event and every new channel
  joins it (`CreateInputChannel`, `lrGroupID`). `db/buses.go` owns the CRUD; `BusesDrawer`,
  `BusSection`, `BusMultiSelect` the UI; `InputSheet`'s Buses column, `SignalFlowTab`'s `BusPills` and
  `service/audio_pdf_sections.go` `busLabel` read them.
- Slice 47 adds `desk_model`, the served profiles (with bus, group, Mon, FX, matrix, DCA, mute counts
  and bus modes), the desk selection hook and `service/deskmap.go`.
- Outputs carry `output_type` (destination) and `console_id`; nothing says which mix plays through one.

## Goals / Non-Goals

**Goals:** a data model Slice 49 can write both file formats from without guessing; one legality
check, server-side, served to the UI as rules.

**Non-Goals:** levels, pans, taps, FX racks and returns, cross-desk mixes, drag routing, physical
socket or block allocation (Slice 49), recorder transport.

## Decisions

### D1. Schema — migration `055_desk_mixes`

```
desk_mixes      (id, event_id, console_id NULL → event_consoles ON DELETE CASCADE,
                 kind  main|subgroup|monitor|fx|matrix|dca|mute,
                 slot INTEGER,        -- 1-based within the kind's pool; mains: 1 LR, 2 M/C | C, 3 Mono
                 width mono|stereo, name, color)
desk_routes     (src_kind channel|mix, src_id, dst_mix_id → desk_mixes ON DELETE CASCADE,
                 PRIMARY KEY (src_kind, src_id, dst_mix_id))
desk_recorder_tracks (console_id → event_consoles ON DELETE CASCADE, track INTEGER,
                 rec_kind ''|preamp|mix, rec_channel_id NULL, rec_mix_id NULL, rec_side ''|L|R,
                 play_channel_id NULL, play_mode ''|soundcheck|source,
                 PRIMARY KEY (console_id, track))
event_consoles  + recorder INTEGER NOT NULL DEFAULT 0, + recorder_tracks INTEGER NOT NULL DEFAULT 0
audio_patch_outputs + fed_by_mix_id NULL (SET NULL), fed_by_channel_id NULL (SET NULL),
                      fed_by_side TEXT NOT NULL DEFAULT ''
```

`console_id` is NULL only for mixes migrated from an event with no desk; the first `CreateConsole`
on that event adopts them (spec: they wait). A channel's routes are deleted with the channel
(`DeleteInputChannel` clears `desk_routes` where `src_kind = 'channel'`, since there is no FK on a
polymorphic source). Pools are per engine (X32's subgroup/monitor/fx share one); uniqueness of a
slot is checked in Go, not by an index, because the pool depends on the model.

*Alternative:* a table per kind — six near-identical tables and six route tables; one table keyed
by kind is what the tables and the export both iterate.

### D2. Migration of today's buses

In SQL, per event: create Main LR (and, by Generic default, M/C, C, Mono are created lazily — see
D3) on every desk; copy each non-builtin group as `subgroup` and each DCA as `dca`, per desk that
holds a member (first desk for memberless), slots in id order; route each member channel to its
desk's copy; route every subgroup to its desk's Main LR; LR members → Main LR. Fed by: exact,
case-insensitive name match on the output's desk. Then drop `audio_input_groups`,
`audio_input_dcas`, `mixer_groups`, `mixer_dcas`. The down migration rebuilds event-level groups
and DCAs from the mixes (merging same-named copies) and drops the new tables. A migration test
covers one desk, two desks with a shared group, and no desk.

### D3. Mains are implied, created on demand

Every desk's mains exist by rule (spec), so the server **ensures** them: `CreateConsole` and the
switch create the mains the engine has (X32: LR, M/C; LV1 16: LR; LV1 32+ and Generic: LR, C, Mono).
Mains never appear in + Mix and cannot be deleted (409).

### D4. Rules are data on the profile

`domain.RouteAllowed(engine, src, dst) error` and `domain.PoolOf(engine, kind)` encode the spec's
table; `GET /desk-models` additionally returns each engine's route matrix and pool membership so the
UI hatches cells from the same rules rather than re-deriving them. Unit tests enumerate every
(engine, src kind, dst kind) pair.

### D5. API

- `GET /audio-patch` gains `mixes`, `routes`, `recorder_tracks`; loses `groups`, `dcas`.
- `POST /consoles/{cid}/mixes` `{kind, width, name, color}` → first legal free slot (409 with the
  pool breakdown when full). `PATCH /mixes/{id}` `{slot?, name, width, color, sources: [{kind, id}]}`
  writes fields and sources in one transaction (the column Save). `DELETE /mixes/{id}` (mains 409).
- Channel `POST/PATCH` replace `group_ids`/`dca_ids` with `mix_ids` (mains, subgroups/groups, DCAs,
  mutes on its desk). A PATCH leaves monitor/FX/matrix routes untouched. A desk change drops the
  old desk's routes and joins the new Main LR (spec).
- Output `PATCH` gains `fed_by_mix_id`, `fed_by_channel_id`, `fed_by_side`, checked against the
  output's desk and engine.
- `PUT /consoles/{cid}/recorder` `{recorder, recorder_tracks (Generic only)}`;
  `PUT /consoles/{cid}/recorder/tracks` full replace; `POST …/recorder/fill` = Record every preamp.
- The event-level `/groups` and `/dcas` routes are removed.

### D6. The switch maps mixes

`service/deskmap.go` gains `MapMixes(mixes, routes, target)` beside Slice 47's `MapRows`; the
switch endpoint returns and applies both. Order: subgroups, monitors, FX (sharing X32's bus pool),
then matrices, DCAs, mutes; each keeps its slot if legal and free, else next legal, else past the
end flagged `over`. Routes the target engine refuses are reported as Left out and **kept**;
`RouteAllowed` is applied when routes are *used* (tables hatch them, the export skips them), not
when stored. A desk's mains are re-ensured for the target.

### D7. Frontend

- `useEventTab` / `EventDetail` / `MOBILE_SECTIONS`: `desk-routing` between the audio tabs.
- `DeskRoutingTab` owns the desk selection (Slice 47 hook) and `useRoutingTable(eventId)`
  (localStorage, like `usePatchView`). `RoutingIndex` (C2), `RoutingGrid` (columns = mixes, rows =
  sources, hatched cells from the served rules, C3), `MixColumnEditor`, `RecorderTable`,
  `DeskRoutingCanvas` (layout by column and feed-forward depth; inspector rail), and the phone
  list + bottom sheet.
- `InputSheet` Routes column and editor; `MobileChannelEditSheet` likewise. `BusMultiSelect` is kept
  and fed the desk's mixes; `BusesDrawer`, `BusSection` are deleted (C5) with their callers in both
  audio tabs.
- `OutputSheet` Fed by column + editor field; `MobileOutputEditSheet`.
- `ConsoleSection`: Recorder spec and toggle (B3 read-only count on real models).
- `ModelSwitchDialog`: mix figures and lines from the extended preview.
- `SignalFlowTab` `BusPills` and the PDF `busLabel` read routes.

### D8. design/ edits

C1–C5 land with the code that needs them: C4 with the tab; C2 + C3 with the tables; C1 with the
canvas; C5 with the drawer's deletion.

## Risks / Trade-offs

- [Dropping the event-level tables is one-way in practice] → the down migration rebuilds them from
  the mixes; the migration test reads back every membership.
- [Polymorphic `desk_routes.src_id` has no FK] → deletes of channels and mixes clear routes in the
  same transaction; a test deletes each and checks no orphan remains.
- [Kept-but-illegal routes after a switch could confuse] → they are listed under Left out at switch
  time, hatched in the tables, and skipped by the export.
- [Unverified: LV1 stereo FX costs two slots; LV1 groups cannot send to Mon or FX; X32 Core's card]
  → each is one entry in the rules table; the export slice confirms against a saved session.

## Migration Plan

Additive tables, then the data move, then the drops, in one migration. Verify on a `/tmp` copy of
the real database (`PATCHPLANNER_DB`): the wedding keeps LR → Main LR with every member and its
"LR" output fed by Main LR; Inputs, Desk Routing, the PDF and Signal Flow agree.
