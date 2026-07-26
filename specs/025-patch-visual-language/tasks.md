---
description: "Task list for Slice 25 — the mockup's visual language, for real"
---

# Tasks: The mockup's visual language, for real

**Input**: Design documents from `/specs/025-patch-visual-language/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: One pure function is worth pinning (`derivedOutputPortColor`) plus the
port-truncation helper. Everything else in this slice is appearance, which a unit
test can only assert a class string about — that pins the implementation, not the
result. quickstart.md walks it against the mockup instead.

**Organization**: One phase per user story, in the spec's priority order, except
US3 and US4 which share the panel and so share a phase. Each phase is a commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

`frontend/src/` only. This slice touches no backend file.

---

## Phase 1: Setup

- [X] T001 Confirm the branch is `025-patch-visual-language` off `024-patch-shell-fixes`, and that `npx tsc -b`, `npx eslint .` and `npx vitest run` are green before any change
- [X] T002 Open the mockup (sections two and three) in a second window and keep it there for passes C and D — these are judged side by side, not from memory

---

## Phase 2: Foundational

**Purpose**: The token table both later passes read. Nothing else is shared.

- [X] T003 Create `frontend/src/components/event/graph/tokens.ts` holding the carried-across scale from research.md R11 and the exact values from contracts/visual-language.md §5 — node chrome, row heights, port size, the truncation limit (8), and the micro-label recipe. Exported as named constants, not a theme object: they are read by className strings, and a lookup indirection would make the markup harder to check against the mockup, not easier

**Checkpoint**: nothing renders differently yet.

---

## Phase 3: User Story 1 — Getting to a channel's source takes one click (Priority: P1)

**Goal**: Edit in Flow opens the graph with the row's own source selected and its
inspector open, and the selection belongs to the tab.

**Independent Test**: Press Edit in Flow on a channel with a source; the graph
opens with that source marked and its editor showing its mic.

- [X] T004 [US1] In `frontend/src/components/event/InputGraphCanvas.tsx`, replace the private `useState<FlowSelection | null>` with `selection` and `onSelectionChange` props, and delete the internal setter. Keep every other piece of canvas state local — zoom, pending port, drag ghost, position overrides are genuinely the canvas's (data-model.md)
- [X] T005 [US1] In `frontend/src/components/event/AudioInputsTab.tsx`, hold `selection` and pass it to the canvas both ways
- [X] T006 [US1] In the same file, change `onEditInFlow={() => setView('flow')}` to set the selection from the `SegmentNode` it is given *and* switch the view. This one line is the whole reported defect (research.md R1)
- [X] T007 [US1] Map a `SegmentNode` to a `FlowSelection` where the two disagree — the sheet's node kinds come from the chain, the inspector's from the graph — and skip switching for a kind the graph has no node for, rather than switching to a view where nothing is selected
- [X] T008 [US1] Add a controlled `selection` to `frontend/src/components/event/AudioOutputsTab.tsx` and its canvas, marking the selected node via `NodeShell`'s selected state. No inspector: the mockup draws none, and inventing one is designing rather than following (spec Out of Scope)
- [X] T009 [US1] Scroll a selected source into view: give the selected `SourceRow` a ref and call `scrollIntoView({ block: 'nearest' })` when it becomes selected. `nearest` is what avoids yanking the page when the row is already visible (FR-004, research.md R2)
- [X] T010 [P] [US1] Confirm a selection pointing at a deleted row clears itself rather than rendering an editor for nothing — `FlowInspector` already resolves its subject by id, so check the empty case and make it close (FR-005)
- [X] T011 [P] [US1] Confirm the sheet's chain-hop picker still selects *that hop's* node rather than the row's source, since both now route through the same setter (FR-003)

**Checkpoint**: quickstart.md pass A walks green. Commit.

---

## Phase 4: User Story 2 — Colour runs end to end on the outputs graph (Priority: P2)

**Goal**: Every port on the outputs graph wears the colour of the output whose run
passes through it.

**Independent Test**: Colour three outputs, patch each through a stagebox to a
device, confirm every port along each run wears that colour.

- [X] T012 [US2] In `frontend/src/lib/outputGraph.ts`, extract the backward walk from `derivedCableColor` into `derivedOutputPortColor(kind, id, port, context)` per data-model.md, and redefine `derivedCableColor(cable, ctx)` as that function applied to the cable's `from` end. Keep the cycle guard and the `pairedForward` pairing exactly as they are
- [X] T013 [US2] Document in that function why there is no agree-or-neutral rule here: the walk goes backward, a port has at most one inbound cable, so there is exactly one origin — unlike the input side, where a source fans out to several channels
- [X] T014 [US2] Thread it into `AudioOutputsTab.tsx`'s `PortRow`: accept an optional colour, style the dot and the label from it, exactly as the input canvas's does
- [X] T015 [P] [US2] Extend `frontend/src/lib/outputGraph.test.ts`: a port on a coloured run wears the colour on both sides of a pass-through; a port with no traceable origin is neutral; an origin with no colour is neutral; and `derivedCableColor` still returns what it did for every case already covered — the refactor must not change the cables

**Checkpoint**: quickstart.md pass B walks green. Commit.

---

## Phase 5: User Stories 3 and 4 — One panel, the sheet, the canvas chrome, the inspector (Priority: P3)

**Goal**: The audio surface is one framed panel, the sheet reads at the mockup's
density, the canvas has tinted lanes with the zoom in the toolbar, and the
inspector is the mockup's rail.

**Independent Test**: Put each surface beside the mockup and compare the values in
contracts/visual-language.md §1–§4 and §7.

### The frame

- [X] T016 [US3] Create `frontend/src/components/ui/PatchPanel.tsx` per contracts §1: one bordered, once-rounded frame with a bar slot, a content slot and a rail slot, the rail taking `complete` / `gaps` / `over` tints on both its ground and its top border
- [X] T017 [US3] Rewrite `AudioPatchShell.tsx` to render `PatchPanel`, and move the zoom control into the bar via `toolbarExtras`. **Deviation:** `PatchPanel` has no rail slot. The mockup shows the status strip in the *Sheet* view only, so it belongs to the sheet, which computes it — a slot on the panel would have been an unused API plus a callback passing JSX upward during render
- [X] T018 [US3] Rework `frontend/src/components/event/PatchStatusRail.tsx` into the panel's bottom strip: no card of its own, one quiet line, and it reports its state so the panel can tint (FR-018)
- [X] T019 [US3] Update both tabs to pass the rail through the shell rather than rendering it inside the sheet, so the frame owns it in both views

### The sheet

- [X] T020 [US3] Create `frontend/src/components/ui/SheetTable.tsx` per contracts §2 — `SheetTable`, `SheetHead`, `SheetHeadCell`, `SheetBody`, `SheetRow`, `SheetCell`, plus `TapeBar`, `NumCell` and `Pill`. Do **not** touch `ui/Table` or `ui/Badge`: six other tabs render them and FR-039 requires those unchanged
- [X] T021 [US3] Adopt it in `frontend/src/components/event/InputSheet.tsx`: mono micro-label headings, the mockup's row density, subtle striping, `TapeBar` before the name, `NumCell` for Ch and W, `Pill` for buses. Remove the `boxShadow: inset 3px 0 0` on the number cell — that is what the tape bar replaces (FR-012 to FR-017)
- [X] T022 [US3] The same in `frontend/src/components/event/OutputSheet.tsx`, including its desk-filter row, which moves into the panel's bar rather than floating above the table
- [X] T023 [US3] Restyle `frontend/src/components/event/ChainCell.tsx` per contracts §3: mono, `→` as text quieter than the hops, dotted underlines on clickable hops, and **amber for a `kind: 'desk'` hop** — the one hop on a chain that is not a billable cable, which `patchSheet` already marks and nothing has ever drawn (FR-016)

### The canvas and the inspector

- [X] T024 [US4] Create `frontend/src/components/event/graph/LaneBands.tsx` per contracts §4: tinted vertical bands with their names in quiet mono inside the canvas, replacing the dashed edge borders and the label strip above it (FR-019)
- [X] T025 [US4] Adopt it in `InputGraphCanvas.tsx`, delete the lane-label strip, and lift the zoom out to the shell's toolbar. **Deviation:** zoom became a controlled prop rather than JSX handed upward — a parent cannot set state from a child during render, and the control lives in the bar, so the bar's owner should own the value. `graph/ZoomControl.tsx` is the button pair
- [X] T026 [P] [US4] The same in `AudioOutputsTab.tsx`'s canvas, whose lanes are Sources / Processing / Destinations
- [X] T027 [US4] Rebuild `frontend/src/components/event/FlowInspector.tsx` per contracts §7: a bordered rail, a header of micro-label + kind pill + close, the name as a bold field, every field in a `grid-cols-[44px_1fr]` row with its label beside it, Reaches and Legend as bordered notes, and the actions pinned with `mt-auto` (FR-021 to FR-025)
- [X] T028 [US4] Draw the legend: four rows, each a 22×4 inline `<svg>` stroke sample plus its meaning — solid coloured, dashed `6 3` coloured, dashed `4 3` grey, and the red 48 V bar. The samples must match what the canvas actually strokes, or the legend is a lie (FR-024, SC-008)
- [X] T029 [P] [US4] Confirm the read-only path: every inspector field renders disabled, Reaches and the Legend still read, and Duplicate/Delete are absent (FR-026)

**Checkpoint**: quickstart.md pass C walks green, side by side with the mockup,
including the "what must not have changed" list. Commit.

---

## Phase 6: User Story 5 — The nodes and the sources rail (Priority: P4)

**Goal**: Both graphs draw boxes, ports and rows from the same primitives, at the
mockup's values, and the sources rail matches the mockup row for row.

**Independent Test**: Compare each kind of box and the rail against the mockup, and
confirm the two graphs' boxes are indistinguishable.

### The shared primitives

- [X] T030 [US5] Create `frontend/src/components/event/graph/NodeShell.tsx` per contracts §5, with `desk` and `selected` variants, a mono badge (not a `Badge` pill), and a footer slot that can go red. Takes a structural port type, not either graph's `PortRef` union — the two differ, and a structural type is the seam that lets both use it (FR-036)
- [X] T031 [US5] Create `graph/PortDot.tsx` at the mockup's 7px, with a hit area larger than its paint (`p-1 -m-1`) — a 7px target is not clickable, and the mockup is a picture rather than something anyone had to hit (FR-030)
- [X] T032 [US5] Create `graph/PortRow.tsx` exporting `PortRow` (one-sided, left or right aligned) and `SplitPortRow` (one row per jack, in port on the left edge, out port on the right). `SplitPortRow` is the structural fix: a pass-through's two sides are the same jack, and two independent columns only line up by luck (FR-028)
- [X] T033 [US5] `MoreRow` lives in `graph/NodeShell.tsx` beside the box it belongs to, and `visiblePorts` in `graph/visiblePorts.ts` — a non-component export from a component file breaks fast refresh, which the linter said so before it could become a habit

### Both canvases adopt them

- [X] T034 [US5] **Taken as adapters rather than deletions.** Each canvas keeps a `NodeShell`/`PortRow` of its own name that is a five-line binding over the shared one — supplying `NODE_WIDTH`, this graph's port keys and its colour rule. The drawing is shared, which is what FR-036 asks for, and forty call sites across two 1,200-line files did not have to be rewritten to get it. `DeviceNode` keeps two independent columns on purpose: a device's two sides genuinely differ in count, so it is not a jack-for-jack pass-through
- [X] T035 [US5] The same in `AudioOutputsTab.tsx`, including its `ConsoleNode`, `MixerNode`, `DeviceNode` and `LocalJackNode`
- [X] T036 [US5] Verify the geometry after the split rows: cables must still meet their port dots at 50%, 100% and 150% zoom, and after dragging a box and scrolling the rail. `SplitPortRow` changes which element a port's ref registers on, and the canvas measures those elements — this is the one part of this pass that can break something rather than just look wrong

### The sources rail

- [X] T037 [US5] Rebuild `SourcesNode`'s header and footer per contracts §6: a mono micro-label with the count in the header, `+ Source` in the footer. Drop the mockup's `drag to reorder` hint — sources are not drag-reorderable and this slice does not add it, so the hint would be a lie (research.md R10)
- [X] T038 [US5] Rebuild `SourceRow` per contracts §6: **full-height tape** (`self-stretch`, the single most visible difference and a one-property fix), name, model in quiet mono, red 48 V bar, port flush right, at the mockup's row height with a hairline separator
- [X] T039 [US5] Stereo rows two slots tall, `L` above `R` in mono, each side independently patchable (FR-033)
- [X] T040 [US5] Selected row: amber tint, name stronger (FR-035)
- [X] T041 [P] [US5] Grey a source's name when it reaches no channel, as the mockup does — it is the rail's own version of the colour rule (contracts §6)

**Checkpoint**: quickstart.md pass D walks green, including the zoom-and-drag
geometry check. Commit.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T042 [P] Run every gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`, plus `go vet ./...` and `go test ./...` to prove the backend is untouched
- [X] T043 [P] Grep `frontend/src/components/event/` for a second `NodeShell`, `PortDot`, `PortRow`, any surviving `ui/Table` import in an audio sheet, and any `rounded-xl`/`mt-3` left over from the three-card layout
- [X] T044 Walk the "what must not have changed" list in quickstart.md: mobile, print, and the other six tabs — especially their tables and badges, which share components this slice deliberately did not touch
- [X] T045 Update `ROADMAP.md` with a Slice 25 section, and `PROJECT.md` §2.4–2.5 for the panel, the lanes, the inspector and the rail. Note again that the typeface and the other tabs are a slice of their own
- [ ] T046 Walk all four quickstart passes end to end in a signed-in browser, side by side with the mockup. **Left to the reporter:** needs a signed-in session, which is why quickstart.md is a click-through checklist that names the mockup's sections

---

## Dependencies

```
Phase 1 (T001–T002)
   └─→ Phase 2 (T003)                       # the token table
         ├─→ Phase 3 · US1  (T004–T011)     # independent of everything below
         ├─→ Phase 4 · US2  (T012–T015)     # independent
         ├─→ Phase 5 · US3+US4 (T016–T029)  # needs T003
         │     └─→ Phase 6 · US5 (T030–T041)  # needs T003 and the panel
         └─→ Phase 7 (T042–T046)
```

US1 and US2 are each deliverable alone and touch different files from the restyle.
US5 follows US3/US4 because its nodes sit inside the panel those build and read the
same tokens.

Two hard sequencing constraints, both stated in the plan:

- **T034 and T035 land together.** Two `NodeShell`s of the same name in one import
  graph is not a state to commit.
- **T036 gates Phase 6.** It is the only check in this pass that can catch a
  functional break rather than a cosmetic one.

## Parallel Execution Examples

**Phase 3**: T010 and T011 are both verification of paths the earlier tasks
change, and can be checked together once T004–T009 are in.

**Phase 4**: T015 is a separate file from T012–T014.

**Phase 5**: T020 (the table primitives) and T024 (the lane bands) are independent
of each other; T021/T022 both depend on T020; T026 is independent of T025.

**Phase 6**: T030–T033 are four new files and can go in parallel. T037–T041 are all
in one file and cannot.

## Implementation Strategy

**MVP**: Phase 3 alone. It is the only item here that costs the planner time on
every use rather than looking wrong.

**Then**: Phase 4 — small, tested, and it makes the two tabs teach the same lesson
about colour.

**Then**: Phases 5 and 6 together, since they share the tokens and are judged the
same way, against the mockup rather than against a test.

**Verification order**: each phase's own quickstart pass at its checkpoint, then all
four again at T046 — and at T046 specifically with the mockup open, because that is
what the last two rounds of this work turned out to need.
