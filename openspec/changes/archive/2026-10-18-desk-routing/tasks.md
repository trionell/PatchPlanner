## 1. Backend — schema and migration

- [x] 1.1 `internal/domain`: `DeskMix`, `DeskRoute` (port-to-port, design D1); mix kinds, port kinds, play modes as validated enums; `Console.Recorder`, `RecorderTracks`
- [x] 1.2 Migration `055_desk_mixes` up (tables, columns, data move per design D2, Fed by as routes, drops) and down (rebuild event-level groups/DCAs)
- [x] 1.2a `CreateEvent` stops seeding `mixer_groups` and ensures its default desk's mains; a fresh database migrates to the top
- [x] 1.3 Migration test: one desk (wedding shape), two desks sharing a group, memberless group, no desk (mixes wait with `console_id` NULL), Fed by exact match; read back every membership
- [x] 1.4 `db/desk_mixes.go` replaces `db/buses.go`: list/create/update(with sources)/delete mixes and routes; channel, mix and output deletes clear every route naming them in the same transaction (test: no orphans, recorder and Fed by included)

## 2. Backend — rules

- [x] 2.1 `domain.PoolOf` and `RouteAllowed` per engine (design D4); exhaustive (engine, src, dst) table test, including LV1 feed-forward, no X32 bus → bus, no X32 channel → matrix, mixes → mute
- [x] 2.2 Slot allocation: first legal free slot, X32 odd–even pairs, LV1 consecutive stereo, LV1 groups one stereo slot, Generic unbounded; full/absent pool refusals with the X32 bus breakdown; tests
- [x] 2.3 Ensure mains per engine on `CreateConsole` and on switch (D3); mains undeletable; the first desk on an event adopts waiting mixes
- [x] 2.4 LV1 matrix 12-source limit; recorder track limit (32 X32 · M32, 64 LV1, typed Generic)
- [x] 2.5 Extend the profiles served by `GET /desk-models` with each engine's route matrix and pool membership

## 3. Backend — API

- [x] 3.1 Mix endpoints (design D5) with tests: add per type, full pool 409, PATCH writes fields + sources atomically, illegal source 400, delete main 409, viewer 403
- [x] 3.2 Channel create joins its desk's Main LR; `mix_ids` replaces `group_ids`/`dca_ids`; PATCH keeps monitor/FX/matrix routes; desk change drops old routes and joins the new Main LR; tests
- [x] 3.3 Output Fed by as a route: same desk, allowed kinds per engine (X32: LR, M/C, subgroup/monitor buses, matrices; LV1: mains, groups, Mon, matrices, direct outs; never FX), side for stereo → mono; viewer 403; tests
- [x] 3.4 Recorder endpoints: declare, tracks replace (routes to/from `recorder` ports), Record every preamp (fills free tracks in channel order, refuses when they don't fit); one playback per channel; side only for stereo mixes; viewer 403; tests
- [x] 3.5 `GET /audio-patch` returns mixes, routes, recorder tracks; remove `/groups`, `/dcas`
- [x] 3.6 `service/deskmap.go` `MapMixes` (design D6) in the switch preview and apply; table tests: LV1 64 → M32 (16 placed in type order, 8 over, group → group Left out and kept), M32 → LV1 (mono subgroup → stereo group Changed, M/C → C/Mono), round trip; Fed by a refused kind and an X32 direct out Left out and kept; recorder tracks past the new count Left out; recorder count from the model; verify by breaking the order rule
- [x] 3.7 `audio_pdf_sections.go` `busLabel` and `audio_graph.go` read routes; PDF tests updated
- [x] 3.8 Backend gates

## 4. Frontend — data

- [x] 4.1 Types and API functions for mixes, routes, recorder, Fed by; remove group/DCA types and calls
- [x] 4.2 `lib/deskRouting.ts`: rows and columns per table and engine from the served rules, hatched cells, pool fills, "plays nowhere" count, a channel's Routes summary; unit tests per engine
- [x] 4.3 `useRoutingTable(eventId)` (localStorage, try/catch)

## 5. Frontend — the Desk Routing tab

- [x] 5.1 Tenth tab `desk-routing` in `useEventTab` (fix the "same nine" comment), `EventDetail`, `types/mobile.ts` `MOBILE_SECTIONS`, between the audio tabs, with an order test (C4 into `patterns.md` §6/§7e, `components.md` §5)
- [x] 5.2 Panel bar: title, Sheet | Flow, desk selector (shared), search, + Mix (Sheet only); no-desk refusal with Open Rig
- [x] 5.3 `RoutingIndex` (C2 into `patterns.md` §1) with each table's pool fill
- [x] 5.4 `RoutingGrid` with squares, hatched inert cells, folded LV1 matrix channels with Show all (C3 into `patterns.md` §2)
- [x] 5.5 `MixColumnEditor`: open one column, fields above the grid, cells as controls, Save writes both; + Mix type picker; inline refusals naming the desk
- [x] 5.6 Tables: Mains (channels, then groups/buses as rows), Subgroups/Groups (LV1 triangle), Monitors, FX, Matrices, DCAs, Mute groups (channels and mixes), Recorder (`RecorderTable`, Record every preamp)
- [x] 5.7 Routing status strip: pool fills and "N mixes play nowhere"
- [x] 5.8 `DeskRoutingCanvas`: one desk, columns in signal order, LV1 depth layout, selection-only channel edges, 1.25 px internal and dashed SoundGrid edges, inspector rail with Open in Sheet (C1 into `patterns.md` §1 amending B6)
- [x] 5.9 Render tests: X32 shared bus fill on three tables, LV1 triangle hatching, no X32 channel rows in Matrices, viewer has no controls

## 6. Frontend — the other surfaces

- [x] 6.1 `InputSheet`: Routes column; editor Routes to / DCAs / Mute groups via `BusMultiSelect` on the channel's desk; monitor/FX sentence with Edit in Desk Routing; "Kick leaves N routes on FOH" before a desk change
- [x] 6.2 Delete `BusesDrawer`, `BusSection` (callers in `AudioInputsTab` only), `AudioPatchShell.onOpenBuses` and the phone's Groups & DCAs row; fix the `design/` lines that name them (C5)
- [x] 6.3 `OutputSheet`: Fed by before Type, editor field with side for stereo → mono; `MobileOutputEditSheet` likewise
- [x] 6.4 `ConsoleSection`: Recorder spec and declare control; track count read-only on real models
- [x] 6.5 `ModelSwitchDialog`: mix figures and mix lines
- [x] 6.6 `SignalFlowTab` bus pills and its Buses header from routes
- [x] 6.7 Phone: table picker in the bar, mixes as rows, bottom sheet of 44 px tick rows; `MobileChannelEditSheet` Routes

## 7. Close-out

- [x] 7.1 Frontend and backend gates (validator)
- [x] 7.2 Real data on a `/tmp` copy: the wedding's LR, groups and DCAs survive; Inputs, Desk Routing, the PDF and Signal Flow agree; a two-desk copy shows separate mixes
- [x] 7.3 `reviewer` against the specs and the mockup; fix findings
- [x] 7.4 ROADMAP Slice 48 record; archive before any merge (merge is the user's call)
