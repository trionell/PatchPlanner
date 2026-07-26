---

description: "Task list for 023-audio-patch-shell"
---

# Tasks: Audio Patch Shell — Sheet, Flow, Drawers & the Console

**Input**: Design documents from `/specs/023-audio-patch-shell/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included where the spec makes a guarantee only a test can hold — the
migration backfill (FR-025 / SC-010), the rental arm (FR-019 / SC-005), the
count guards (FR-024), the chain-segment derivation (FR-009 to FR-012) and the
capacity rule (FR-023 / research.md R15). Presentation is verified by hand
through `quickstart.md`; CI gates `go test ./...` and `npm test`.

**Organization**: Grouped by the four passes of plan.md, which map one-to-one
onto the spec's user stories. Each phase is independently shippable in order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1 / US2 / US3 / US4 from spec.md

## Path Conventions

Web app monorepo: `backend/` (Go) and `frontend/` (React + TS), per plan.md.

## Standing rules for every task in this slice

- Mobile branches (`if (isMobile) …`) stay first in their component and
  byte-identical. Never edit a desktop code path in place where a mobile branch
  exists without re-reading the branch first.
- Restricted roles get controls **absent from the DOM**, never disabled.
- Never run against `backend/patchplanner.db`; use a copy via `PATCHPLANNER_DB`.
- Frontend gate is `tsc -b` (`npm run typecheck`), never `tsc --noEmit`.

---

## Phase 1: Setup (shared shell primitives)

**Purpose**: The two primitives every later phase renders inside. No behaviour
change yet.

- [ ] T001 [P] Add `frontend/src/components/ui/Drawer.tsx` — a right-anchored overlay panel following `Dialog.tsx`'s conventions exactly (`open`/`onClose`/`title`/`children`, backdrop click closes, `cn` for class merging) plus: a `subtitle` line, a `width` prop (`wide` for Rig, `narrow` for Buses), Escape-to-close via a `keydown` listener, and `overflow-y: auto` on the body so a long rig list scrolls inside the panel
- [ ] T002 [P] Add `frontend/src/hooks/usePatchView.ts` — `usePatchView(eventId, tab)` returning `[view, setView]` for `'sheet' | 'flow'`, persisted to `localStorage` under `patchplanner.patchView.{eventId}.{tab}`, defaulting to `'sheet'`, tolerant of a missing/garbage stored value and of `localStorage` throwing (private-mode Safari)

---

## Phase 2: User Story 1 — One surface instead of a stack of cards (Priority: P1) 🎯 MVP

**Goal**: Both audio tabs become one toolbar plus one content area, with the
former cards living in drawers.

**Independent test**: quickstart.md § "Pass 1 — the shell", steps 1–8.

- [ ] T003 [US1] Add `frontend/src/components/event/AudioPatchShell.tsx` — the shared shell per `contracts/ui-contract.md` §1: one toolbar row with the Sheet/Flow segmented toggle, a growing search input, the drawer buttons, `PrintButton` and the add action; props `{ tab, view, onViewChange, search, onSearchChange, drawers, actions, readOnly, children }`. `readOnly` omits the drawer buttons and the add action from the returned tree rather than disabling them
- [ ] T004 [US1] Add `frontend/src/components/event/RigDrawer.tsx` — a `Drawer` (wide) titled `Rig`, subtitle `Shared by Audio Inputs and Audio Outputs`, rendering sections in signal order. In this phase: `StageboxMultiSection`, then the device section passed in by the calling tab (`InputDeviceSection` on Inputs; `ProcessingDeviceSection` + `TrueOutputDeviceSection` on Outputs), each section re-parented unchanged. Footer: `Every row here is one line on the rental order · N items`
- [ ] T005 [P] [US1] Add `frontend/src/components/event/BusesDrawer.tsx` — a `Drawer` (narrow) titled `Buses`, subtitle `Mix groups and DCAs for this event`, wrapping `BusSection` unchanged
- [ ] T006 [US1] Rewrite the desktop branch of `frontend/src/components/event/AudioInputsTab.tsx` to render `AudioPatchShell` with `usePatchView`: Sheet content = the existing `ChannelSection` (plus `SourceSection` below it — retired in T035, see plan.md § Implementation Sequencing), Flow content = `InputGraphCanvas`, drawers = `RigDrawer` + `BusesDrawer`. Delete the "Signal flow" `Card` wrapper, its graph/table toggle and the now-unreferenced `InputResourceTable`. Leave the `isMobile` branch and the `InputPatchSheet` render untouched
- [ ] T007 [US1] Rewrite the desktop branch of `frontend/src/components/event/AudioOutputsTab.tsx` the same way: Sheet content = the existing `OutputChannelsSection`, Flow content = `OutputGraphCanvas`, drawers = `RigDrawer` only. Delete the "Signal flow" `Card` wrapper, its toggle and `OutputResourceTable`. Leave the `isMobile` branch and `OutputPatchSheet` untouched
- [ ] T008 [US1] Wire selection and search through the shell: lift the selected row/node id into each tab's state so it survives a view switch, and pass `search` down to both the table and the canvas (canvas dims non-matching nodes per research.md R14 — implemented for real in T021, stubbed as a no-op prop here)
- [ ] T009 [P] [US1] Verify the read-only contract end to end: `ReadOnlyBanner` still renders, no drawer buttons, no add button, no row editor, and `InputGraphCanvas`/`OutputGraphCanvas` still pan and zoom with `readOnly`

**Checkpoint**: Six cards are two surfaces plus a toolbar; no data changed. Ship.

---

## Phase 3: User Story 2 — A channel's whole path on one line (Priority: P1)

**Goal**: The Sheet becomes worth landing on: chain per row, one row editor,
per-hop repatch, status rail.

**Independent test**: quickstart.md § "Pass 2 — the sheet", steps 1–9.

- [ ] T010 [US2] Add `frontend/src/lib/patchSheet.ts` — pure conversion of an existing flow into renderable, clickable segments: `inputChainSegments(channel, context)` over `buildInputChannelFlow` and `outputChainSegments(output, context)` over `buildOutputChannelFlow`. Each segment carries `{ label, kind, missing, port?, cableId? }` where `port` is the `PortRef` the per-hop picker would repatch. Collapse a stereo pair's two paths into one segment list, rendering matched jack pairs as a range (`SB1 : 6–7`) and diverging paths as two labelled lines (research.md R9)
- [ ] T011 [P] [US2] Add `frontend/src/lib/patchSheet.test.ts` — cases: mono through a stagebox; through a DI box (device hop present and ordered); stereo collapsing to a range; stereo whose sides go to different boxes (stays two lines); no source at all (one `missing` segment); a cableless hop labelled `built-in`; a chain of 6+ hops (middle truncation preserves first and last)
- [ ] T012 [US2] Add `frontend/src/components/event/ChainCell.tsx` — renders a segment list with `→` separators, `missing` segments in the error colour, middle truncation, and each segment as a button opening a small picker anchored to it. The picker reuses the existing cable-target selection logic and writes through the existing `input-cables`/`output-cables` endpoints; confirming affects only that hop
- [ ] T013 [US2] Add `frontend/src/components/event/PatchStatusRail.tsx` with `frontend/src/lib/patchCapacity.ts` — derive row count, per-box usage (`SB1 8/32`), cables picked, and gap list; render the `complete` / `N gap` states of `contracts/ui-contract.md` §3 including the `Show only gaps` action. Leave a documented seam for the console arm (T031)
- [ ] T014 [P] [US2] Add `frontend/src/lib/patchCapacity.test.ts` — gap counting for a channel with no source and for one stereo side unpatched; per-box usage against declared counts; `cables picked` counting only `cable_item_id IS NOT NULL`
- [ ] T015 [US2] Add `frontend/src/components/event/InputSheet.tsx` — the columns of `contracts/ui-contract.md` §2, `ChainCell` for the chain, `PatchStatusRail` beneath, and an in-place row editor holding only name / width / colour / groups / DCA / notes plus an `Edit in Flow →` link. One row open at a time: opening another saves and closes the first
- [ ] T016 [US2] Add `frontend/src/components/event/OutputSheet.tsx` — same shape for outputs (`Out` · `Name` · `Type` · `W` · `Chain` · `Notes`), row editor holding name / type / width / colour / notes
- [ ] T017 [US2] Add the row-editor keyboard contract to both sheets: `Esc` closes without saving, `⌘↵`/`Ctrl↵` saves and opens the next row. Implement once in a small shared hook or helper rather than twice
- [ ] T018 [US2] Swap `ChannelSection` for `InputSheet` in `AudioInputsTab.tsx` and `OutputChannelsSection` for `OutputSheet` in `AudioOutputsTab.tsx`; delete `ChannelSection.tsx` and the now-unused `OutputChannelsSection`, checking first that no mobile path imports either
- [ ] T019 [P] [US2] Converge the print sheets on the Sheet's columns: `frontend/src/components/print/InputPatchSheet.tsx` and `OutputPatchSheet.tsx` render `patchSheet.ts` segments instead of walking hops themselves, so screen and paper cannot drift (FR-017)
- [ ] T020 [P] [US2] Update `frontend/src/components/print/printSheets.test.tsx` for the shared segments, keeping its existing assertions about empty events and stereo pairs
- [ ] T021 [US2] Implement search for real: filter Sheet rows on number, name, notes and chain string; in Flow, lower the opacity of non-matching nodes without removing them or their cables (research.md R14). Show a "nothing matches" line in place of an empty table body

**Checkpoint**: The pre-show check is one screen. Ship.

---

## Phase 4: User Story 3 — The console in the plan (Priority: P2)

**Goal**: The desk exists: on the rental order, in both graphs, with local jacks
and real capacity.

**Independent test**: quickstart.md § "Pass 3 — the console", steps 1–8.

### Schema and domain

- [ ] T022 [US3] Create `backend/migrations/042_event_consoles.up.sql` exactly as specified in `data-model.md` § Migration 042 — table, backfill of one console per event carrying `output_mixer_position_y`, the two `console_id` columns with `ON DELETE SET NULL`, the two `UPDATE`s, then `ALTER TABLE events DROP COLUMN output_mixer_position_y` — and `042_event_consoles.down.sql` reversing all of it (re-add the column, copy back from the lowest-id console per event, drop both columns, drop the table)
- [ ] T023 [US3] Add `Console` to `backend/internal/domain/audio.go` with the field set of `data-model.md`, `ConsoleRoles = []string{"foh","monitor","broadcast"}`, and `console_local` appended to `ValidInputCableFromKinds`, `ValidInputCableToKinds`, `ValidPortFromKinds` and `ValidPortToKinds`. Document on the type why counts are per-event (research.md R5) and why role is not a `reference_values` vocabulary (R7)
- [ ] T024 [US3] Add `backend/internal/db/consoles.go` — `ListConsoles`, `GetConsole`, `CreateConsole`, `UpdateConsole`, `DeleteConsole` (clearing `console_local` cables on both graphs in one transaction and returning the count, mirroring `DeleteStagebox`), plus `ConsoleLocalPortCounts(db, id)` and the usage counters of `data-model.md` § Derived values
- [ ] T025 [US3] Thread `console_id` through `backend/internal/db/audio_patch.go`: select and scan it in `ListInputChannels`/`GetInputChannel`/`ListAudioPatchOutputs`/`GetAudioPatchOutput`, accept it in create and update, and default a new channel/output to the event's sole console when it has exactly one. Delete `OutputMixerPositionY`/`SetOutputMixerPositionY`
- [ ] T026 [US3] Add the console arm to `rentalSummaryQuery` in `backend/internal/db/rental.go` per `contracts/console-api.md` §7 — after the `stage_multis` arm, `COALESCE(inventory_item_id, owned_item_id)`, 12 arms and 13 `eventID` parameters in `GetRentalSummary`. Extend the comment block above the query with the console line and the reason owned desks count here but not for stageboxes (research.md R6)

### API

- [ ] T027 [US3] Register and implement `POST /consoles`, `PATCH /consoles/{consoleID}`, `DELETE /consoles/{consoleID}` in `backend/internal/api/audio_patch.go` per `contracts/console-api.md` §1–3, including role validation, the mutual-exclusion check on the two item ids, the non-negative count check, and the reduce-below-patched guard returning `409` with the conflicting hops named
- [ ] T028 [US3] Add `consoles` to the `getAudioPatch` payload, remove `output_mixer_position_y` and delete the `PATCH /output-mixer-position` route and handler
- [ ] T029 [US3] Accept `console_local` in input- and output-cable validation, rejecting a port index at or beyond the console's declared local count with the same message shape as the existing stagebox range check

### Backend tests

- [ ] T030 [P] [US3] Add `backend/internal/db/console_migration_test.go` — drive migration 042 up against a temp-file DB seeded with events, channels, outputs and a non-zero `output_mixer_position_y`; assert one console per event, every channel and output assigned, position carried across, then drive it down and assert `events.output_mixer_position_y` is back with its original values (technique from `output_graph_migration_test.go`)
- [ ] T031 [P] [US3] Add rental coverage in `backend/internal/db/rental_test.go` — a catalog console counts 1 under audio; an owned console counts 1; a console with neither item counts nothing; two consoles of the same catalog item count 2; and the `specs/013-stage-plots/rental-baseline.json` comparison still passes for a backfilled event
- [ ] T032 [P] [US3] Add `backend/internal/api/consoles_test.go` — create/patch/delete happy paths; `400` on an unknown role, on both item ids set, on a negative count; `409` on reducing a count below what is patched with the hop named; delete clears `console_local` cables and nulls `console_id` without deleting channels; a viewer gets `403`; cross-event and cross-inventory ids are refused (extend `idor_regression_test.go` if that is where the pattern lives)
- [ ] T033 [P] [US3] Add cable coverage in `backend/internal/api/input_cables_test.go` and `output_cables_test.go` — `source → console_local` then `console_local → channel` is accepted and the second hop stores `cable_item_id IS NULL`; `mixer → console_local` then `console_local → device` likewise; an out-of-range jack index is `400`; the `console_local` from-port uniqueness is enforced

### Frontend

- [ ] T034 [US3] Add `Console` and `console_id` to `frontend/src/types/index.ts`, `console_local` to both `PortRef['kind']` unions, and console CRUD to `frontend/src/api/audioPatch.ts`; remove the mixer-position call
- [ ] T035 [US3] Add `frontend/src/components/event/ConsoleSection.tsx` and render it first in `RigDrawer` — the summary-line-plus-Edit shape of `contracts/ui-contract.md` §4, with a create form (name, role, catalog **or** owned item, four counts) and per-console `in / out / local / used` figures
- [ ] T036 [US3] Teach both canvases the console node: in `AudioOutputsTab.tsx` replace the `{ kind: 'mixer', id: 0 }` placeholder with one node per console reading its own `position_x/y`, and in `InputGraphCanvas.tsx` add the console node to the Channels lane using `input_position_x/y`; render per `contracts/ui-contract.md` §7, with drag-end persisting through `PATCH /consoles/{id}`
- [ ] T037 [US3] Add `console_local` ports to both canvases and both graph libs — `consoleLocalPorts(console, side)` in `inputGraph.ts`/`outputGraph.ts`, `nodeName`/`nodeKindLabel` returning the console's own name instead of `"Mixer"`, `isCablelessEdge`/`isCablelessToKind` extended per `data-model.md`, and `portsConnectable` accepting the new kind pairs
- [ ] T038 [US3] Extend `inputSignalFlow.ts` and `signalFlow.ts` to label a `console_local` hop as `{console name} local in {n}` / `local out {n}`, so the chain cell and both print sheets read the direct-into-the-desk runs correctly with no further change
- [ ] T039 [US3] Add the console arm to `PatchStatusRail`/`patchCapacity.ts`: declared-versus-used per console, the `over capacity` state with its shortfall and `Open Rig` action, and the rule that a count of `0` disables the check (research.md R15). Extend `patchCapacity.test.ts` accordingly
- [ ] T040 [US3] Add the `Desk` column and desk filter to `OutputSheet`, rendered only when the event has more than one console, and a console picker in the input and output row editors under the same condition (FR-021)

**Checkpoint**: The desk is on the order, sources can land in it, over-capacity warns. Ship.

---

## Phase 5: User Story 4 — The graph at festival scale (Priority: P3)

**Goal**: Flow reads at 32 sources, colour runs end to end, and the inspector
replaces the last card.

**Independent test**: quickstart.md § "Pass 4 — the flow view", steps 1–8.

- [ ] T041 [US4] Rework `SourcesNode` in `InputGraphCanvas.tsx` to the row anatomy of `contracts/ui-contract.md` §5 — full-height derived colour tape, name with ellipsis, dimmed model, red bar for 48 V, port flush right — keeping the consolidated rail and the existing 20px row pitch so cable geometry stays correct
- [ ] T042 [US4] Give a stereo source two stacked port slots (`L` over `R`, 40px total) with independent cables and a tape spanning both, and update the rail's row-centre arithmetic so every cable still lands on its port
- [ ] T043 [US4] Make the source rail scroll inside its own lane without moving the rig or console lanes, and show a source count in the node header
- [ ] T044 [US4] Apply the derived colour along the whole run: cable strokes, every intermediate port dot and the console's channel row all take `derivedPortColor`'s result, with the cable-versus-network distinction moved entirely onto the dash pattern (research.md R11). Keep the existing fallbacks — amber when a cable has an item and reaches nothing, grey dashed when it does not
- [ ] T045 [US4] Add `frontend/src/components/event/FlowInspector.tsx` — the right-hand rail of the mockup: node details, `Reaches …` for a source, the legend, and Duplicate/Delete. For a source it holds every field `SourceSection` holds (name, kind, mic, stand, connector, width, 48 V), so it fully replaces it
- [ ] T046 [US4] Wire `+ Source`, `+ Stagebox` and `+ DI box` into the Flow palette (opening the Rig drawer where the entity belongs there), then delete `frontend/src/components/event/SourceSection.tsx` and its render in `AudioInputsTab.tsx` — in the same commit, per plan.md § Implementation Sequencing
- [ ] T047 [P] [US4] Apply the same colour treatment to the output canvas in `AudioOutputsTab.tsx` (output tape colour along the run, dash for network) so the two graphs stay symmetrical

**Checkpoint**: The mockup is the app. Ship.

---

## Phase 6: Documentation & close-out

- [ ] T048 [P] Add the Slice 23 section to `ROADMAP.md` with its dependency line (Slice 12 input graph + Slice 11 output graph → Slice 23) and record that the console closes the standing rental invariant's last gap
- [ ] T049 [P] Update `PROJECT.md` where it describes the audio tabs as card stacks and where it lists what the plan can hold, so the console is named as a planned entity
- [ ] T050 Run every gate on a clean tree — `go vet ./...`, `go test ./...`, `npm run typecheck`, `npm run lint`, `npm test` — then walk all four quickstart sections against a copy of the production DB via `PATCHPLANNER_DB`

---

## Dependencies

```
T001, T002 ────► T003 ────► T004, T005 ────► T006, T007 ────► T008, T009      (Phase 2)
                                                    │
                            T010 ─► T011            ▼
                            T010 ─► T012 ─► T015, T016 ─► T017, T018 ─► T021  (Phase 3)
                            T013 ─► T014 ─┘
                            T019 ─► T020
                                                    │
        T022 ─► T023 ─► T024, T025, T026 ─► T027, T028, T029 ─► T030…T033     (Phase 4)
                            T034 ─► T035, T036, T037 ─► T038, T039, T040
                                                    │
                            T041 ─► T042 ─► T043, T044 ─► T045 ─► T046, T047  (Phase 5)
                                                    │
                                            T048, T049 ─► T050                (Phase 6)
```

Phase 4 is the only phase with backend work, and T022 blocks all of it. Phase 5's
T044 assumes T036/T037 (the console node has to exist before a run can be
coloured through it), so Phase 5 must follow Phase 4 even though its story is
independently valuable.

## Parallel opportunities

- T001 and T002 are independent files.
- Every `[P]` test task can be written alongside its implementation task's
  sibling, not before it — this project keeps tests beside the code and does not
  practise red-first TDD.
- T019/T020 (print) touch no file Phase 3's other tasks touch.
- T030–T033 are four independent test files.
- T048 and T049 are documentation only.
