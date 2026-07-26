---
description: "Task list for Slice 24 — audio patch shell, second pass"
---

# Tasks: Audio patch shell, second pass

**Input**: Design documents from `/specs/024-patch-shell-fixes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where they pin something a future change could silently
break — the desk-assignment fallback, the migration round trip, the output chain
continuing past a local jack, and the rental-cable parity between a local socket
and a stage box. Not included for pure presentation work, which quickstart.md
walks instead.

**Organization**: One phase per user story, in the spec's priority order. Each
phase is a commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Web app: `backend/` (Go) and `frontend/src/` (React + TS), per plan.md.

---

## Phase 1: Setup

**Purpose**: Nothing to initialize — this slice adds no dependency and no new
directory. This phase only confirms the starting state is the one the plan
assumes.

- [X] T001 Confirm the branch is `024-patch-shell-fixes` off `023-audio-patch-shell`, and that `go test ./...` and `npx vitest run` are green before any change, so a later failure is attributable to this slice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two things more than one story needs. Nothing else is shared —
the four stories touch mostly disjoint files.

- [X] T002 [P] Add a `size` prop to `frontend/src/components/ui/Input.tsx`: `sm` = `h-8 text-xs px-2`, `md` (default) = today's `h-10 text-sm px-3`. Do not change the default, so the eight tabs this slice does not touch are unaffected (research.md R12)
- [X] T003 [P] Add the same `size` prop to `frontend/src/components/ui/Select.tsx`, with matching classes

**Checkpoint**: `npx tsc -b` passes; every existing call site still renders at
`h-10`.

---

## Phase 3: User Story 1 — A channel keeps the desk it belongs to (Priority: P1)

**Goal**: Editing a row never detaches it from its desk, and no box on either
graph is fixed in place.

**Independent Test**: On an event with one desk, edit and save an existing
channel, then switch to Flow: the channel is still on the desk and there is
exactly one destination box. Repeat for an output. Delete the desk and drag the
box that appears.

### Backend — the safety net first

- [X] T004 [US1] In `backend/internal/db/audio_patch.go`, make `UpdateInputChannel` fall back to `DefaultConsoleID` when the incoming `ConsoleID` is nil, mirroring `CreateInputChannel` exactly. Comment it as the safety net beneath the whole-row PATCH convention, not a replacement for it (research.md R1)
- [X] T005 [US1] Apply the same fallback in `UpdateAudioPatchOutput` in the same file
- [X] T006 [US1] Add `TestUpdateInputChannelKeepsDeskWhenOmitted` to `backend/internal/db/console_assignment_test.go` — there is no `audio_patch_test.go`, and a name that says what the file is about beats creating one to match a task: seed an event with one console, create a channel, PATCH it with `console_id` absent, assert the console is still set. Add the multi-desk half: with two consoles, an absent `console_id` stays nil rather than guessing (FR-002, FR-003)
- [X] T007 [P] [US1] Add the matching `TestUpdateAudioOutputKeepsDeskWhenOmitted` to the same file, plus the two cases the plan implied but did not list: a row already detached repairs itself on save, and an explicit desk is never overridden

### Frontend — carry the field, and move the picker into the draft

- [X] T008 [US1] In `frontend/src/components/event/InputSheet.tsx`, add `console_id` to `ChannelDraft`, to `draftOf`, and to the `persist` payload
- [X] T009 [US1] In the same file, rewrite the Desk `<Select>` to write `editor.setDraft({ ...draft, console_id })` instead of firing its own `updateChannel.mutate`, so it is saved by the editor's own Save (FR-004, research.md R3)
- [X] T010 [US1] Make the same two changes in `frontend/src/components/event/OutputSheet.tsx` for its draft, its `persist`, and its Desk select
- [X] T011 [P] [US1] Check every other caller of `updateInputChannel` / `updateAudioOutput` — including `frontend/src/components/mobile/MobileChannelEditSheet.tsx` — and add `console_id` wherever the payload is built field by field. **Both mobile sheets had the same omission**; carrying a field is a bug fix, not the layout change FR-033 forbids

### Frontend — every box moves

- [X] T012 [US1] In `frontend/src/components/event/InputGraphCanvas.tsx`, pass `onDragStart={(e) => startNodeDrag('channel', 0, e)}` to `ChannelsNode` and accept it in that component's props, and make `persistPosition` a documented no-op for `kind === 'channel'` — there is no row to store it on (FR-006, research.md R4)
- [X] T013 [US1] In the same file, compute the orphan node's starting `y` from the lowest desk node actually placed rather than from a counter that ignores stored positions, so it cannot open on top of a desk (FR-007, research.md R5)
- [X] T014 [P] [US1] In `frontend/src/components/event/AudioOutputsTab.tsx`, do the same for the orphan `MixerNode`: confirm its drag handler is wired, and give it a starting `y` below the desks
- [X] T015 [P] [US1] Simplify the dead fallbacks `orphanChannels.length > 0 ? orphanChannels : channels` and `orphanOutputs.length > 0 ? orphanOutputs : outputs` to the orphan list alone — with `ON DELETE SET NULL` the two are the same set whenever the ternary is reached

**Checkpoint**: quickstart.md pass A walks green. Commit.

---

## Phase 4: User Story 2 — The desk's own sockets are a real destination (Priority: P2)

**Goal**: A desk's local jacks are their own two-sided box in the processing lane
on both graphs, so a source can reach a channel through the desk and a bus can
reach an amp through the desk.

**Independent Test**: With one desk and no stage box, run a source into a local
in and on to a channel; route a bus into a local out and on to an amp; read both
chains on the sheets; compare the cable count on the rental order with the same
run through a stage box.

### Schema and Go

- [X] T016 [US2] Write `backend/migrations/043_console_local_positions.up.sql` and `.down.sql` per data-model.md: four `REAL NOT NULL DEFAULT` columns added, dropped in reverse order
- [X] T017 [US2] Add `LocalPositionX/Y` and `LocalInputPositionX/Y` to `domain.Console` in `backend/internal/domain/audio.go`, with a comment saying which canvas each pair places and that the desk's own node still uses the existing pairs
- [X] T018 [US2] Extend `consoleColumns`, both scanners, `CreateConsole` and `UpdateConsole` in `backend/internal/db/consoles.go` to carry the four new columns in the documented order
- [X] T019 [US2] Add `TestMigration043UpDown` to `backend/internal/db/console_migration_test.go` using the existing `openMigratedTo` harness: at 42 the columns are absent, at 43 an existing console reads `260/320` on both graphs, and the down migration removes all four
- [X] T020 [P] [US2] Extend `backend/internal/api/consoles_test.go` with a PATCH that sets the four local positions and reads them back, asserting the desk's own `position_y` is untouched by it (contracts/console-positions.md §1)

### Types and client

- [X] T021 [P] [US2] Add the four fields to the `Console` interface in `frontend/src/types/index.ts`
- [X] T022 [P] [US2] Confirm `updateConsole` in `frontend/src/api/audioPatch.ts` accepts `Partial<Console>` and so needs no change; if it names fields explicitly, add the four

### Graph libraries

- [X] T023 [US2] In `frontend/src/lib/inputGraph.ts`, change `nodeZone('console_local')` from `channels` to `processing`, and give `consoleLocalPorts` per-side labels — `Local in N` on the in side, `To desk N` on the out side (data-model.md)
- [X] T024 [US2] In `frontend/src/lib/outputGraph.ts`, change `nodeZone('console_local')` from `sources` to `processing`, and label `From desk N` on the in side, `Local out N` on the out side
- [X] T025 [US2] In `frontend/src/lib/signalFlow.ts`, add `consoles?: Console[]` to `OutputFlowContext`, thread it into the walker's `nameContext`, and add an explicit `console_local` branch to `walkFromPort` that continues through the same port index via `consoleLocalPorts` — without it a run through a local out reads as ending at the desk (research.md R9, FR-016)
- [X] T026 [US2] Pass `consoles` into every `OutputFlowContext` construction site — `OutputSheet.tsx`, `frontend/src/components/print/OutputPatchSheet.tsx`, `SignalFlowTab.tsx` and any other — so the desk is named rather than printed as `#3`
- [X] T027 [P] [US2] Add to `frontend/src/lib/signalFlow.test.ts`: a bus → local out → device run yields three hops with the desk named, and the same run through a stage box yields the same shape — the parity SC-005 is checked by

### The sockets node

- [X] T028 [US2] **Deviation, taken deliberately:** `LocalJackNode` is defined in each canvas rather than in a shared `LocalJackNode.tsx`. The two canvases' `PortRow` signatures differ — the input one requires a `colorContext` the output one has no concept of — so sharing it would mean injecting `PortRow` as a prop, which is more machinery than a 20-line node that already has a twin (`StageboxNode`) in each file. The two canvases deliberately keep their own node components; this follows that, rather than making one exception to it
- [X] T029 [US2] In `InputGraphCanvas.tsx`, split the desk node from the sockets node in one edit: re-key the desk node as `channel:{consoleID}` reading `input_position_y`, add a `console_local:{consoleID}` node at `local_input_position_x/y` in the processing lane, drop the local ports from `ConsoleNode`, and render `LocalJackNode` for the new node. Omit it when `local_input_count === 0` (FR-008, FR-014, data-model.md)
- [X] T030 [US2] Extend the same file's `persistPosition` and `startNodeDrag` so `console_local` PATCHes `local_input_position_x/y` free in both axes, and `channel:{id}` PATCHes `input_position_y` y-only
- [X] T031 [US2] Make the mirrored split in `AudioOutputsTab.tsx`: desk node re-keyed `mixer:{consoleID}` at `position_y`, sockets node `console_local:{consoleID}` at `local_position_x/y` in the processing lane, local ports dropped from its `ConsoleNode`, `LocalJackNode` rendered, omitted when `local_output_count === 0`, and `persistPosition` extended to match
- [X] T032 [P] [US2] Update `frontend/src/lib/outputGraph.test.ts`'s `console local jacks` block for the new labels, and add a case asserting both sides are sized by `local_output_count`
- [X] T033 [US2] Check `FlowInspector.tsx`'s title resolution and the canvases' selection handling still name a `console_local` selection after the split, since that kind now identifies the sockets box rather than the desk

**Checkpoint**: quickstart.md pass B walks green, including the rental-parity
step. Verify migration 043 against `/tmp/pp-slice24.db` with `PATCHPLANNER_DB`,
never against `backend/patchplanner.db`. Commit.

---

## Phase 5: User Story 3 — The Rig and Buses drawers are one usable design (Priority: P3)

**Goal**: Every section of both drawers reads and behaves the same way, full
width, with fields wide enough to use.

**Independent Test**: Open the Rig drawer and add, edit and delete one of each
kind of equipment without resizing the window. Every section follows one pattern.

### The primitives

- [X] T034 [US3] Create `frontend/src/components/ui/GearList.tsx` exporting `MicroLabel`, `DrawerSection`, `GearCard`, `GearTop`, `GearSpecs`, `Spec`, `Meter`, `GearForm` and `FieldStack` exactly as contracts/drawer-design.md specifies. No audio knowledge in this file
- [X] T035 [US3] Update `frontend/src/components/ui/Drawer.tsx` to lay its body out as a `gap-5` column, now that sections no longer carry their own `mb-6`

### The six sections, one at a time

- [X] T036 [US3] Rebuild `frontend/src/components/event/ConsoleSection.tsx` on the primitives: role badge, name, catalog-or-owned item, a spec line of `in`/`out`/`local`/`used`, a meter, fields only on Edit, one open at a time, delete inside the open form with its cable-clearing confirmation (FR-019, FR-020, FR-022, FR-023)
- [X] T037 [US3] Create `frontend/src/components/event/StageboxSection.tsx` on the primitives, taking over the stagebox half of `StageboxMultiManager` including its inventory-model auto-fill of in/out counts from the item description
- [X] T038 [US3] Create `frontend/src/components/event/StageMultiSection.tsx` likewise, keeping the channel-count auto-fill and the length-in-metres field
- [X] T039 [US3] **Scope grew, for the right reason:** the three device sections were 230-line near-copies differing in a table name, a minimum input count and whether link ports exist — which is precisely how they came to look like three different things. Rather than rebuild three copies, they became thin wrappers over one new `frontend/src/components/event/DeviceSection.tsx`. Each keeps its own mutations and doc comment, because which table a device belongs to is a real domain distinction (Slice 12 research.md R3)
- [X] T040 [P] [US3] `ProcessingDeviceSection.tsx` as a wrapper: `minInputs={0}`, since an output-side source legitimately has no inputs
- [X] T041 [P] [US3] `TrueOutputDeviceSection.tsx` as a wrapper: `withOutputs={false}` and the link-port fields, the one list that declares them
- [X] T042 [P] [US3] Rebuild `frontend/src/components/event/BusSection.tsx` on the primitives, keeping the colour swatch and adding a member count per bus (FR-017, research.md R16)

### Wire-up and removal

- [X] T043 [US3] Update `frontend/src/components/event/RigDrawer.tsx` to render `StageboxSection` and `StageMultiSection` in place of `StageboxMultiSection`, stacked in signal order after the consoles
- [X] T044 [US3] Delete `frontend/src/components/event/StageboxMultiSection.tsx` and `frontend/src/components/StageboxMultiManager.tsx`, and remove every remaining import of them (research.md R13)
- [X] T045 [US3] Confirm every section hides its add and Edit controls for a read-only role by not rendering them, rather than by disabling them (FR-025) — the standing rule from Slice 15
- [X] T046 [P] [US3] Check `StageboxMultiManager` was not also used outside the audio tabs before deleting it; if it was, that call site keeps working or is converted in the same commit

**Checkpoint**: quickstart.md pass C walks green, including the read-only and
"other tabs unchanged" steps. Commit.

---

## Phase 6: User Story 4 — The sheet's row editor matches the agreed design (Priority: P4)

**Goal**: One editor construction, used by both sheets, laid out as the mockup's
wrapping field strip, with labelled Save and Delete and a way into Flow.

**Independent Test**: Open a row editor on each tab; fields flow and wrap, Save
and Delete read as words and are correctly proportioned, Edit in Flow opens the
graph with that row's source selected.

- [X] T047 [US4] Create `frontend/src/components/event/RowEditor.tsx`: a `flex flex-wrap items-end gap-3` strip with `border-l-2 border-amber-500`, a faint amber ground, an `ml-auto` primary Save, a red labelled Delete, and a slot for the tab's own fields — per contracts/drawer-design.md (FR-027, FR-029)
- [X] T048 [US4] Adopt it in `InputSheet.tsx`, replacing the `md:grid-cols-[6rem_1fr_8rem_9rem]` grid. Each field becomes a `FieldStack` of its natural width; the actions leave the field flow entirely, which is what fixes the compressed Save and the squashed trash icon (research.md R14)
- [X] T049 [US4] Tint the row being edited to match its editor and drop the border between them, so the two read as one block (FR-028)
- [X] T050 [US4] Add `Edit in Flow →` under a `SOURCE` micro-label, passing the row's first upstream node from its chain model to the existing `onEditInFlow` prop, falling back to the row itself when nothing feeds it (FR-030, research.md R15)
- [X] T051 [US4] Make the same three changes in `OutputSheet.tsx`, with `Save output` (FR-032)
- [X] T052 [P] [US4] Confirm `Esc` and `⌘↵`/`Ctrl↵` still work — `useRowEditor.onKeyDown` must stay on the element that wraps the fields (FR-031)

**Checkpoint**: quickstart.md pass D walks green, including the mobile step.
Commit.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T053 [P] Run every gate: `go vet ./...`, `go test ./...`, `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`
- [X] T054 [P] Grep `frontend/src` for stale references to `StageboxMultiManager`, `StageboxMultiSection`, and any `md:grid-cols` left inside a drawer or a row editor
- [X] T055 Update `ROADMAP.md` with a Slice 24 section: what the field test found, and the four fixes. Note that applying this design language app-wide, including the typeface, is a slice of its own
- [X] T056 [P] Update `PROJECT.md` §2.3–2.5 for the second node per desk and the drawer language, and `README.md` for the four new console fields on the audio-patch payload and the console PATCH
- [ ] T057 Walk all four quickstart passes end to end in a signed-in browser; report anything that does not match, rather than adjusting the spec to fit. **Left to the reporter:** this needs a signed-in browser session, which is why `quickstart.md` is written as a click-through checklist

---

## Dependencies

```
Phase 1 (T001)
   └─→ Phase 2 (T002, T003)            # Input/Select size variants
         ├─→ Phase 3 · US1  (T004–T015)   independent of everything below
         ├─→ Phase 4 · US2  (T016–T033)   independent of US1, US3, US4
         ├─→ Phase 5 · US3  (T034–T046)   needs T002/T003
         │     └─→ Phase 6 · US4 (T047–T052)   needs T034's primitives
         └─→ Phase 7 (T053–T057)
```

Only one real cross-story dependency: US4 uses the primitives US3 introduces. US1
and US2 could each be delivered alone.

Within Phase 4 the sequencing is strict where it says so: T029 and T031 must each
be one edit, because the `console_local:{id}` layout key moves from the desk node
to the sockets node — half-done, both nodes read the same position and land on top
of each other, which is the very defect US1 fixes.

## Parallel Execution Examples

**Phase 2**: T002 and T003 together — two files, same change.

**Phase 3**: T006 and T007 (two test funcs), then T011, T014 and T015 together
once T008–T010 are in.

**Phase 4**: T021 and T022 together; T023 and T024 together (one file each);
T020, T027 and T032 are three independent test files.

**Phase 5**: T039, T040, T041 and T042 are four independent sections and can go in
parallel once T034 exists. T036, T037 and T038 are listed sequentially only
because they are the three that set the pattern the other four copy.

## Implementation Strategy

**MVP**: Phase 3 alone. It stops a plan coming apart while being edited, which is
the only defect here that loses information the planner typed.

**Then**: Phase 4, which turns a promised capability into a working one. After
Phase 4 the slice is functionally complete and the rest is appearance.

**Then**: Phases 5 and 6 together, since the second reuses the first's
primitives, and both are judged by eye against the same mockup.

**Verification order**: each phase's own quickstart pass at its checkpoint, then
all four again at T057 — the second walk is what catches a later pass having
broken an earlier one, which is exactly how this slice's own defects reached the
field.
