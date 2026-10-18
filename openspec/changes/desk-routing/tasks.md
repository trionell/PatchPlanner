## 1. Backend — schema and migration

- [ ] 1.1 `internal/domain`: `DeskMix`, `DeskRoute`, `RecorderTrack`; mix kinds, widths, sides, play modes as validated enums; `Console.Recorder`, `RecorderTracks`; output `FedBy*`
- [ ] 1.2 Migration `055_desk_mixes` up (tables, columns, data move per design D2, drops) and down (rebuild event-level groups/DCAs)
- [ ] 1.3 Migration test: one desk (wedding shape), two desks sharing a group, memberless group, no desk (mixes wait with `console_id` NULL), Fed by exact match; read back every membership
- [ ] 1.4 `db/desk_mixes.go` replaces `db/buses.go`: list/create/update(with sources)/delete mixes, routes, recorder tracks; channel and mix deletes clear routes in the same transaction (test: no orphans)

## 2. Backend — rules

- [ ] 2.1 `domain.PoolOf` and `RouteAllowed` per engine (design D4); exhaustive (engine, src, dst) table test, including LV1 feed-forward, no X32 bus → bus, no X32 channel → matrix, mixes → mute
- [ ] 2.2 Slot allocation: first legal free slot, X32 odd–even pairs, LV1 consecutive stereo, LV1 groups one stereo slot, Generic unbounded; full/absent pool refusals with the X32 bus breakdown; tests
- [ ] 2.3 Ensure mains per engine on `CreateConsole` and on switch (D3); mains undeletable; the first desk on an event adopts waiting mixes
- [ ] 2.4 LV1 matrix 12-source limit; recorder track limit (32 X32 · M32, 64 LV1, typed Generic)
- [ ] 2.5 Extend the profiles served by `GET /desk-models` with each engine's route matrix and pool membership

## 3. Backend — API

- [ ] 3.1 Mix endpoints (design D5) with tests: add per type, full pool 409, PATCH writes fields + sources atomically, illegal source 400, delete main 409, viewer 403
- [ ] 3.2 Channel create joins its desk's Main LR; `mix_ids` replaces `group_ids`/`dca_ids`; PATCH keeps monitor/FX/matrix routes; desk change drops old routes and joins the new Main LR; tests
- [ ] 3.3 Output Fed by: same desk, allowed kinds per engine (no FX), side required for stereo → mono; tests
- [ ] 3.4 Recorder endpoints: declare, tracks replace, Record every preamp (fills free tracks in channel order, refuses when they don't fit); tests
- [ ] 3.5 `GET /audio-patch` returns mixes, routes, recorder tracks; remove `/groups`, `/dcas`
- [ ] 3.6 `service/deskmap.go` `MapMixes` (design D6) in the switch preview and apply; table tests: LV1 64 → M32 (16 placed in type order, 8 over, group → group Left out and kept), M32 → LV1 (mono subgroup → stereo group Changed, M/C → C/Mono), round trip; verify by breaking the order rule
- [ ] 3.7 `audio_pdf_sections.go` `busLabel` and `audio_graph.go` read routes; PDF tests updated
- [ ] 3.8 Backend gates

## 4. Frontend — data

- [ ] 4.1 Types and API functions for mixes, routes, recorder, Fed by; remove group/DCA types and calls
- [ ] 4.2 `lib/deskRouting.ts`: rows and columns per table and engine from the served rules, hatched cells, pool fills, "plays nowhere" count, a channel's Routes summary; unit tests per engine
- [ ] 4.3 `useRoutingTable(eventId)` (localStorage, try/catch)

## 5. Frontend — the Desk Routing tab

- [ ] 5.1 Tenth tab `desk-routing` in `useEventTab`, `EventDetail`, `MOBILE_SECTIONS` (C4 into `patterns.md` §6/§7e, `components.md` §5)
- [ ] 5.2 Panel bar: title, Sheet | Flow, desk selector (shared), search, + Mix (Sheet only); no-desk refusal with Open Rig
- [ ] 5.3 `RoutingIndex` (C2 into `patterns.md` §1) with each table's pool fill
- [ ] 5.4 `RoutingGrid` with squares, hatched inert cells, folded LV1 matrix channels with Show all (C3 into `patterns.md` §2)
- [ ] 5.5 `MixColumnEditor`: open one column, fields above the grid, cells as controls, Save writes both; + Mix type picker; inline refusals naming the desk
- [ ] 5.6 Tables: Mains (channels, then groups/buses as rows), Subgroups/Groups (LV1 triangle), Monitors, FX, Matrices, DCAs, Mute groups (channels and mixes), Recorder (`RecorderTable`, Record every preamp)
- [ ] 5.7 Routing status strip: pool fills and "N mixes play nowhere"
- [ ] 5.8 `DeskRoutingCanvas`: one desk, columns in signal order, LV1 depth layout, selection-only channel edges, 1.25 px internal and dashed SoundGrid edges, inspector rail with Open in Sheet (C1 into `patterns.md` §1 amending B6)
- [ ] 5.9 Render tests: X32 shared bus fill on three tables, LV1 triangle hatching, no X32 channel rows in Matrices, viewer has no controls

## 6. Frontend — the other surfaces

- [ ] 6.1 `InputSheet`: Routes column; editor Routes to / DCAs / Mute groups via `BusMultiSelect` on the channel's desk; monitor/FX sentence with Edit in Desk Routing; "Kick leaves N routes on FOH" before a desk change
- [ ] 6.2 Delete `BusesDrawer`, `BusSection`, the Rig-bar Buses button and the phone's Groups & DCAs row; fix the `design/` lines that name them (C5)
- [ ] 6.3 `OutputSheet`: Fed by before Type, editor field with side for stereo → mono; `MobileOutputEditSheet` likewise
- [ ] 6.4 `ConsoleSection`: Recorder spec and declare control; track count read-only on real models
- [ ] 6.5 `ModelSwitchDialog`: mix figures and mix lines
- [ ] 6.6 `SignalFlowTab` bus pills from routes
- [ ] 6.7 Phone: table picker in the bar, mixes as rows, bottom sheet of 44 px tick rows; `MobileChannelEditSheet` Routes

## 7. Close-out

- [ ] 7.1 Frontend and backend gates (validator)
- [ ] 7.2 Real data on a `/tmp` copy: the wedding's LR, groups and DCAs survive; Inputs, Desk Routing, the PDF and Signal Flow agree; a two-desk copy shows separate mixes
- [ ] 7.3 `reviewer` against the specs and the mockup; fix findings
- [ ] 7.4 ROADMAP Slice 48 record; archive before any merge (merge is the user's call)
