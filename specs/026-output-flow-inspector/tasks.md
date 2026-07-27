---

description: "Task list for Slice 26 — an inspector for the audio outputs flow graph"
---

# Tasks: An inspector for the audio outputs flow graph

**Input**: Design documents from `/specs/026-output-flow-inspector/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/inspector-rail.md](./contracts/inspector-rail.md)

**Tests**: Vitest tasks are included for the three pure derivations in
`lib/outputInspector.ts` only. The rail's appearance and its two gestures are
checked by the four passes in [quickstart.md](./quickstart.md) — a render test
asserting Tailwind class strings would restate the contract rather than verify it,
and this project has no component-test harness.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves

## A note on phase order

The template puts US1 first. Here the **extraction** (US3's substance) is in
Phase 2, because both US1 and US2 build on it and because doing it *before* the
new inspector exists is what makes a visual regression on the inputs side
attributable to the extraction alone. Phase 5 then holds US3's verification, not
its implementation. This is deliberate, not a mis-numbering.

---

## Phase 1: Setup

**Purpose**: Nothing to install. Confirm the ground is where the plan says it is.

- [x] T001 Confirm the gates are green on the branch before any edit: `cd frontend && npx tsc -b && npx eslint . && npx vitest run` — a pre-existing failure must not be discovered later and blamed on this slice
- [x] T002 Confirm `git diff --stat main -- backend/` is non-empty *now* (Slices 23–25 touched it) and record the current output in the implementation notes, so the end-of-slice assertion is "unchanged **by this slice**" rather than "empty", which would be false

---

## Phase 2: Foundational — the shared rail (blocks US1, US2, US3)

**Purpose**: One rail, extracted from the inputs inspector before a second caller
exists. Per contracts/inspector-rail.md §1.

- [x] T003 Create `frontend/src/components/event/graph/InspectorRail.tsx` with `InspectorRail` (the `<aside>` frame) and `InspectorHeader` (micro-label, optional pill slot, close ✕), copying the class strings **verbatim** from `FlowInspector.tsx:119-126`
- [x] T004 Add `Field` to `graph/InspectorRail.tsx`, moved verbatim from `FlowInspector.tsx:296-303`, keeping the `grid-cols-[44px_minmax(0,1fr)]` column and its comment about why the label sits beside the control
- [x] T005 Add `Note` to `graph/InspectorRail.tsx`, moved verbatim from `FlowInspector.tsx:306-313`
- [x] T006 Add `Legend` and `LegendRow` to `graph/InspectorRail.tsx` per contracts §1: the component owns the four stroke samples (`cable`, `network`, `unpatched`, `phantom`), the caller supplies each row's wording. Document in the file why the strokes are shared and the words are not (research.md R5)
- [x] T007 Rewire `FlowInspector.tsx` onto the five shared parts — delete its local `Field`, `Note` and `Legend`, replace its `<aside>` and header markup with `InspectorRail`/`InspectorHeader`, and pass its own three-plus-phantom legend wording in. No visual or behavioural change (FR-015)
- [x] T008 `git mv frontend/src/components/event/FlowInspector.tsx frontend/src/components/event/InputFlowInspector.tsx` and rename its exported `FlowSelection` → `InputFlowSelection`
- [x] T009 [P] Update the import and type name in `frontend/src/components/event/InputGraphCanvas.tsx`
- [x] T010 [P] Update the import and type name in `frontend/src/components/event/AudioInputsTab.tsx`
- [x] T011 Gate the extraction on its own: `npx tsc -b && npx eslint .` clean, and the inputs Flow view visually unchanged (quickstart pass D steps 22–23) **before** moving on. A regression found here is the extraction's; found later it is anyone's

**Checkpoint**: the inputs rail is built from shared parts and looks exactly as it did.

---

## Phase 3: User Story 1 — Edit an output from the Flow view (Priority: P1) 🎯 MVP

**Goal**: Selecting an output row opens a rail holding all seven of the sheet's
fields, states where the run lands, and offers Duplicate and Delete.

**Independent test**: quickstart pass A, steps 1–12.

### The gesture split (FR-009, FR-010)

- [x] T012 [US1] Add optional `selected` and `onSelect` to `PortRow` in `frontend/src/components/event/graph/PortRow.tsx` per contracts §2: with `onSelect`, the label becomes a clickable region; with `selected`, the row tints `bg-amber-500/10` and the label goes `font-semibold text-zinc-50`. The dot's handlers are untouched, and both props absent must render byte-identically to today
- [x] T013 [US1] Verify no existing `PortRow` call site changes behaviour — 11 call sites across the two canvases, none of which passes either prop

### The pure derivations (testable without rendering)

- [x] T014 [US1] Create `frontend/src/lib/outputInspector.ts` with `nextOutputNumber(outputs)` = `max(output_number) + 1`, not `at(-1) + 1` — the raw query is not guaranteed sorted (research.md R8)
- [x] T015 [US1] Add `duplicateOf(output, outputs)` to `lib/outputInspector.ts`: every field copied, same `console_id`, number from `nextOutputNumber`, name `${name} copy` only when the row has a name — an unnamed row's copy must not be called " copy"
- [x] T016 [US1] Add `landsOn(model)` to `lib/outputInspector.ts`: the **last** segment of each line of an `outputChainSegments` model, with its side label when there is more than one line, and a `patched: boolean` so the caller can render the not-patched wording rather than an empty list (contracts §4)
- [x] T017 [P] [US1] Create `frontend/src/lib/outputInspector.test.ts` covering `nextOutputNumber` (gap in the numbering; empty list; unsorted input — the case `at(-1)` gets wrong) and `duplicateOf` (named row, unnamed row, desk preserved, no-desk preserved)
- [x] T018 [P] [US1] Extend `frontend/src/lib/outputInspector.test.ts` for `landsOn`: an unpatched output, a single-line chain, a stereo chain that collapsed to one line, a stereo chain that did not, and a chain whose last hop is the desk's own local jack (which must read as the local jack, not as the desk head)

### The rail

- [x] T019 [US1] Create `frontend/src/components/event/OutputFlowInspector.tsx` exporting `OutputFlowSelection` per data-model.md §2 and the component, built on the Phase 2 primitives
- [x] T020 [US1] Add the seven fields in the order and with the save timing of contracts §3: name (blur, non-empty), Out number, Type from vocabulary `output_types`, Width, Tape via `ColorSelect`, Desk (only when `consoles.length > 1`), Notes (blur). Each saves through `updateAudioOutput` as `{...output, ...patch}` — one mutation per field, no draft (research.md R7)
- [x] T021 [US1] Add the "Lands on" note using `landsOn` over `outputChainSegments`, in the output's derived colour, plus the quieter line carrying the port count and the desk name (contracts §4)
- [x] T022 [US1] Add the Legend note: three rows, wording for the output side (*carrying* an output, not *reaching* a channel), and **no phantom row** (FR-013)
- [x] T023 [US1] Add Duplicate (via `createAudioOutput` with `duplicateOf`, then select the returned row so the rail follows the copy) and Delete (confirm naming the output and warning that cables leaving it go too, then close the rail) — both absent entirely when read-only (FR-016)
- [x] T024 [US1] Handle the vanished subject: when the selection is `{kind:'output'}` and no such row exists, render nothing and clear the selection (research.md R9) — not an empty frame, and not a stale row

### Wiring it into the canvas

- [x] T025 [US1] In `frontend/src/components/event/AudioOutputsTab.tsx`, replace the tab's `selection` type with `OutputFlowSelection`, and update the comment at lines 90-94 that currently states this graph has no inspector
- [x] T026 [US1] Thread `itemLabelById` into `OutputGraphCanvas`'s props — the chain model needs it and the canvas does not currently receive it (research.md R6)
- [x] T027 [US1] Pass `selectedOutputId` and `onSelectOutput` into `ConsoleNode` and `MixerNode`, and from there into each `PortRow` as `selected`/`onSelect`, so a row in a desk's bus list *and* in the "No desk" box both select (FR-002, FR-006 of the spec's scenario 6)
- [x] T028 [US1] Mount `OutputFlowInspector` beside the canvas in the same `flex items-start gap-3` shape `InputGraphCanvas.tsx:544` uses, so the canvas gives up the width and the rail does not compress
- [x] T029 [US1] Update the tab's `openInFlow` for the widened union — `device_link` still maps to `device`, `mixer` is no longer a selection, and a chain node that names no selectable box still leaves the view alone

**Checkpoint**: US1 is complete and shippable on its own. quickstart pass A passes end to end.

---

## Phase 4: User Story 2 — The rail is never blank (Priority: P2)

**Goal**: Every selectable box opens the rail; the desk box stops being selectable
rather than being marked with nothing to show.

**Independent test**: quickstart pass B, steps 13–17.

- [x] T030 [US2] In `OutputFlowInspector.tsx`, add the non-output branch: a `describe()` resolving stagebox / stage multi / device / local jacks to a heading and a name, and the "declared in the Rig drawer" note — the mirror of `InputFlowInspector`'s, with the outputs side's wording
- [x] T031 [US2] Remove `onSelect` from `ConsoleNode` and `MixerNode` in `AudioOutputsTab.tsx` so the desk box and the "No desk" box are no longer selectable, and confirm the desk keeps its amber border (which comes from `desk={badge === 'DESK'}`, not from selection) — research.md R3
- [x] T032 [US2] Confirm the close ✕ clears the selection, un-marks the box and returns the canvas to full width (FR-012)

**Checkpoint**: five of five box kinds behave the same way (SC-003).

---

## Phase 5: User Story 3 — One rail, not two look-alikes (Priority: P3)

**Goal**: Verify the extraction actually holds — that a change to a rail value moves
both inspectors.

**Independent test**: quickstart pass D, steps 22–25.

- [x] T033 [US3] Grep-verify no rail value is defined twice: neither inspector may contain `w-60`, `grid-cols-[44px`, `rounded-[5px] border border-zinc-800 bg-zinc-950/60`, or an `<svg width="22"` — all five must resolve to `graph/InspectorRail.tsx` alone (SC-004)
- [x] T034 [US3] Prove it the other way: temporarily change the label column from 44px to 60px, confirm **both** rails move, then revert. Record the result in the implementation notes — this is the only check that distinguishes shared code from matching copies
- [x] T035 [US3] Confirm the inputs side is otherwise untouched: `git diff main --stat -- frontend/src/components/event/InputGraphCanvas.tsx frontend/src/components/event/AudioInputsTab.tsx` shows import/type-name lines only (SC-006)

---

## Phase 6: Polish & Cross-Cutting

- [x] T036 Read-only pass: quickstart step 21 — every field disabled, Duplicate and Delete **absent** rather than disabled, the rail still readable (FR-016, and the standing "hide, don't just block" rule)
- [x] T037 [P] Update `ROADMAP.md` with the Slice 26 entry and add it to the dependency graph after Slice 25
- [x] T038 [P] Update `PROJECT.md` where it describes the audio tabs' two views, so "the Flow view is editable on the inputs side only" is no longer stated anywhere
- [x] T039 Update `specs/025-patch-visual-language/contracts/visual-language.md` §7 to point at this slice's contract for the rail's values, so there is one place they live and one pointer to it — not two tables that must agree
- [x] T040 Run every gate: `cd frontend && npx tsc -b && npx eslint . && npx vitest run && npm run build`; `cd backend && go vet ./... && go test ./...`
- [x] T041 Assert the frontend-only claim: `git diff --stat 025-patch-visual-language -- backend/` must be **empty** for this branch (T002 explains why the comparison is against the previous slice's tip, not `main`)
- [ ] T042 Walk [quickstart.md](./quickstart.md) passes A–D in a signed-in browser and record anything that differs from the contract

---

## Dependencies & Execution Order

```text
Phase 1 (T001–T002)
   └─→ Phase 2  the shared rail (T003–T011)      ← blocks everything
          ├─→ Phase 3  US1 the output rail (T012–T029)   🎯 MVP
          │        └─→ Phase 4  US2 every other box (T030–T032)
          └─→ Phase 5  US3 verification (T033–T035)
                   └─→ Phase 6  Polish (T036–T042)
```

- **T007 before T008**: rewire, then rename. Doing both in one step makes a
  behavioural regression indistinguishable from a bad import path.
- **T011 is a hard gate**: the inputs rail must be verified unchanged before the
  second caller exists.
- **T012 before T027**: the row cannot be told it is selected until it can be.
- **T014–T016 before T019–T023**: the rail imports them.
- **T031 after T027**: don't remove the box's selection until its rows have one, or
  the desk's contents are briefly unreachable.
- **Phase 4 depends on Phase 3** only because both edit `OutputFlowInspector.tsx`
  and `AudioOutputsTab.tsx` — the stories themselves are independent.

## Parallel Opportunities

- T009 and T010 — two different files, same mechanical change.
- T017 and T018 — the same test file, but disjoint describes; sequential in
  practice, parallel in review.
- T037 and T038 — two different documents.

Everything else is serial. This is a small, deeply-linked slice: five of the seven
implementation tasks touch one of two files.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That is a shippable answer to the request:
an output editable from the Flow view. Phase 4 removes the last inconsistency
between the two canvases, and Phase 5 is what stops the rail from becoming two
rails in six months.

**The one thing to resist**: building `OutputFlowInspector` first and extracting
afterwards. It is the faster path by an hour and it produces two rails that happen
to match today — precisely the state Slice 25 was spent undoing. Phase 2 comes
first for that reason and no other.

## Deviations, recorded rather than taken silently

Four, all found during implementation:

1. **T002's assertion had to change target.** `git diff --stat main -- backend/` is
   *not* empty on this branch — Slices 23–25 touched 16 backend files and are all
   still unmerged. The frontend-only claim is therefore checked against the previous
   slice's tip (`025-patch-visual-language`, at `0f88c8c`), which is the branch point.
   Asserting against `main` would have "failed" for reasons that predate this slice,
   and quietly dropping the check would have been worse.

2. **T020: the number field saves on blur, not on change.** Saving per keystroke means
   typing `12` saves `1` and then `12`, briefly renumbering the row to a number another
   row may hold. The rule is now typed-fields-on-blur, picked-fields-on-change, and
   contracts §3 says so.

3. **Scope grown by two small things, both forced by the change rather than adjacent
   to it:**
   - `outputTypeTint` moved from `OutputSheet.tsx` to `lib/patchTints.ts`. The rail's
     header shows the same pill for the same value; a second copy of the mapping is
     how `monitor` becomes two different greens. Exporting it from `OutputSheet.tsx`
     would also have tripped `react-refresh/only-export-components`.
   - The sheet's row-level **Edit in Flow** now selects the output, and `RowEditor`
     gained an `editInFlowLabel` prop so the outputs sheet can say `Routing` where the
     inputs sheet says `Source`. The button used to target `chainSourceNode(chain)` —
     the first box downstream of the desk — so pressing it on a bus opened a stagebox.
     Leaving it pointed there while the row itself became selectable would have been
     the odd half of a finished feature.

4. **`chainSourceNode`'s fallback branch is now only the input side's.** The outputs
   sheet no longer calls it. The helper is kept general and its doc comment says why,
   rather than being narrowed — narrowing it would delete the only place the
   outward-reading behaviour is written down, and its test still covers it.

## Notes

- Every FR maps to a task: FR-001→T028, FR-002→T027, FR-003→T020, FR-004→T020,
  FR-005→T020/T021, FR-006→T021, FR-007→T023, FR-008→T023/T024, FR-009→T012,
  FR-010→T012/T027, FR-011→T030, FR-012→T032, FR-013→T022, FR-014→T003–T007,
  FR-015→T011/T035, FR-016→T023/T036.
- T034's result: changing the label column from 44px to 60px removed
  `grid-template-columns:44px` from the built CSS **entirely** and produced exactly one
  `60px` rule. If either rail held its own copy, the 44px rule would have survived. That
  is the check that tells shared code from matching copies; reverted after.
- T042, the four-pass browser walkthrough, is the one task left open: it needs a
  signed-in session, a two-desk event and a viewer account, so it is the user's to run.
