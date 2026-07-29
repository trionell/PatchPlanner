---
description: "Task list for Wave 6d — the canvases"
---

# Tasks: The canvases

**Input**: Design documents from `/specs/036-phone-canvas/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/phone-canvas.md](contracts/phone-canvas.md),
[quickstart.md](quickstart.md), and the approved [mockup.html](mockup.html) revision 1

**Tests**: Included where the plan names them. This project's method is Vitest with
`renderToStaticMarkup` — no DOM, no React Testing Library (constitution). That decides
what is testable: structure, class strings, conditional rendering and **pure arithmetic**,
never pixels and never a gesture. Everything a gesture decides is in the handset pass.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: which user story the task belongs to

## Path conventions

Web app: `frontend/src/`, `backend/` — **frontend only** this slice.

---

## Phase 1: Setup — capture what must not change

**Purpose**: three desktop surfaces move in this slice. The *before* markup is only
capturable before they move.

- [ ] T001 Confirm the tree is clean and the branch is `036-phone-canvas`; run the full gate suite from [quickstart.md](quickstart.md) once to record a green baseline
- [ ] T002 [P] Capture the **before** markup of `ZoomControl` at zoom `0.5 · 1 · 1.5`, with `onZoomChange` and with explicit handlers, into a scratch file (quickstart, *three byte-identical checks*)
- [ ] T003 [P] Capture the **before** markup of `InputFlowInspector` for every selection kind (`source` · `stagebox` · `stage_multi` · `device` · `console_local` · `channel`) × read-only/not × mic/line
- [ ] T004 [P] Capture the **before** markup of `OutputFlowInspector` for every selection kind × read-only/not

**Checkpoint**: three baselines exist. Every later change to those files is diffable.

---

## Phase 2: Foundational — the two pure modules

**Purpose**: everything below calls them, and they can be wrong in ways only a unit test
finds. No user story of their own, because alone they deliver nothing.

**⚠️ BLOCKING**: US1 and US3 cannot start until this phase is done.

- [ ] T005 [P] `lib/canvasFit.ts` — `fitScale(vpW, vpH, graphW, graphH)`: the largest scale at which the graph fits **both** axes, floored to two decimals, clamped to `(0, 1]` (research R2, contract §5)
- [ ] T006 [P] `lib/canvasFit.test.ts` — a `0 × 0` viewport on the first frame yields a usable value rather than `Infinity`/`NaN`; a viewport wider *and* taller than the graph caps at `1`; the binding axis is whichever is tighter; the two-decimal floor holds
- [ ] T007 [P] `lib/canvasFocus.ts` — `firstMatch(layout, predicate)` walking **layout order**, and `focusOffset(node, { zoom, viewportW, viewportH, nodeW, clearBottom })` returning a clamped `{ left, top }` (research R6, contract §5)
- [ ] T008 [P] `lib/canvasFocus.test.ts` — first match is layout order and not data order; a node already fully visible produces the offset it is already at; `clearBottom` moves a node clear of the sheet; a node at the far right clamps rather than overshooting; no match returns `undefined`

**Checkpoint**: `npx vitest run` green. Both modules are callable and proven.

---

## Phase 3: US1 (P1) — one zoom control, at 44 px

**Goal**: the shared control reaches a phone target, and 6c's copy goes.

**Independent test**: render `ZoomControl` at both reaches; confirm the desktop markup is
byte-identical to T002's capture and the phone form's three targets are ≥ 44 px.

- [ ] T009 [US1] `graph/ZoomControl.tsx` — branch on `useIsMobile()`; phone form is three targets of ≥ 44 px around the existing look, plus optional `resetLabel` rendered as a second line **on the phone only** (research R8, contract §1)
- [ ] T010 [US1] `graph/ZoomControl.test.tsx` — the phone form's targets are `h-11 w-11`; `resetLabel` never appears in the desktop form; the desktop form is unchanged
- [ ] T011 [US1] Diff `ZoomControl`'s desktop markup against T002. **Must be byte-identical.** Any delta is read and written into quickstart, never waved through
- [ ] T012 [US1] `event/StagePlotTab.tsx` — delete the hand-built phone zoom cluster (`h-11 w-11` Minus/Plus/percentage) and render `ZoomControl` with the plot's own `zoomBy` stepping and no `resetLabel` (FR-013a)

**Checkpoint**: one zoom control in the tree. `grep -rn "Zoom out" frontend/src` returns 1.

---

## Phase 4: US2 (P1) — the inspector's phone form

**Goal**: the rail's contents open in the un-scrimmed sheet, and edit.

**Independent test**: render both inspectors at both reaches; confirm the desktop markup
matches T003/T004 and the phone return has no backdrop and no footer.

- [ ] T013 [US2] `graph/InspectorRail.tsx` — **add only** `useInspectorControlSize()`, returning `'sm'` on a desk and `'md'` in a hand (research R9, contract §2). The rail component itself is not modified, so its stage-plot caller keeps one shape
- [ ] T014 [US2] `graph/InspectorFrame.tsx` — the rail + header on a desk, `ui/Sheet` with `scrim={false}` in a hand. It **renders** `InspectorRail` and `InspectorHeader`; nothing is copied out of them (research R7, contract §2)
- [ ] T015 [US2] `graph/InspectorFrame.test.tsx` — the desktop return carries the rail's `w-60 border-l` frame; the phone return has no backdrop element, no footer and no confirm control
- [ ] T016 [US2] `event/InputFlowInspector.tsx` — root becomes `InspectorFrame` with `heading` / `pill` / `onClose` as props; every `size="sm"` on an `Input`, `Select` or `Button` comes from `useInspectorControlSize()`; the `h-7` overrides go with it
- [ ] T017 [US2] `event/OutputFlowInspector.tsx` — the same two changes, in the same commit as T016, because a phone form built at one and copied to the other is this project's own cautionary tale (research R7)
- [ ] T018 [US2] Diff both inspectors' desktop markup against T003/T004. **Must be byte-identical.** The frame's return is identical *by construction*; the check runs anyway, because this project has twice found a by-construction claim that was not true

**Checkpoint**: both inspectors render a sheet below 768 px and their old rail above it.

---

## Phase 5: US1 + US3 + US4 (P1/P2) — the canvases become viewports

**Goal**: the largest phase. Both canvases, together.

**Independent test**: at 375 px the whole graph is visible at open, drags with one finger,
selects on a clean tap, and refuses every spatial gesture; at ≥ 768 px nothing has changed
except that a search term brings its first match into view.

### The viewport (US1)

- [ ] T019 [US1] `hooks/usePinchZoom.ts` — two pointers, scaling about the midpoint of the contacts, the logical point under the midpoint held still by adjusting scroll in the same frame (research R12)
- [ ] T020 [US1] `event/InputGraphCanvas.tsx` — call `useIsMobile()` once; **pin the logical space to `820 × 640` on a phone** so zoom moves the window and not the contents (research R1, contract §3). The desktop's `wrapperWidth / zoom` is untouched
- [ ] T021 [US1] `event/InputGraphCanvas.tsx` — the wrapper becomes `flex-1 min-h-0 overflow-auto touch-action:pan-x pan-y` on a phone, and keeps `height: CANVAS_HEIGHT` on a desk; the canvas root becomes a flex column so the wrapper can fill it
- [ ] T022 [US1] `event/InputGraphCanvas.tsx` — widen `zoom` to `number | null`, add `onFitChange`, measure fit from the live wrapper through `fitScale` and report it (data-model §2, §4)
- [ ] T023 [US1] `event/InputGraphCanvas.tsx` — mount `usePinchZoom` on the viewport, clamped to `[fit, 1]`
- [ ] T024 [US1] [P] `event/AudioOutputsTab.tsx` — the same four changes on `OutputGraphCanvas`, which lives in that file (T020–T023)

### The withheld gestures (US4)

- [ ] T025 [US4] `event/InputGraphCanvas.tsx` — withhold the spatial gestures on a phone in one expression: no `onPortPointerDown`, no port-click connect half, no `onDragStart`. The cable picker and the cable info dialog become unreachable with the ports and get no phone form (research R11, spec Out of Scope)
- [ ] T026 [US4] `event/InputGraphCanvas.tsx` — the **pan guard**: `pointerdown` records the origin, `pointermove` past 3 px sets a ref, every `onSelect` is wrapped so it no-ops while the ref is set. Nothing is asked of any shared drawing primitive (research R5)
- [ ] T027 [US4] [P] `event/AudioOutputsTab.tsx` — T025 and T026 on `OutputGraphCanvas`

### Search aims the window (US3)

- [ ] T028 [US3] `event/InputGraphCanvas.tsx` — on a search change, take `firstMatch` over the canvas's own `layout` with the **same** `matchesSearch` predicate the dimming uses, and scroll the viewport to `focusOffset`. **Unconditional** — not guarded on reach (FR-030). No match moves nothing
- [ ] T029 [US3] [P] `event/AudioOutputsTab.tsx` — the same on `OutputGraphCanvas`
- [ ] T030 [US2] `event/InputGraphCanvas.tsx` + `AudioOutputsTab.tsx` — on a phone, a new selection scrolls the selected node clear of the sheet, through `focusOffset`'s `clearBottom` (FR-019)

**Checkpoint**: both canvases behave identically. `npx tsc -b`, `eslint`, `vitest` green.

---

## Phase 6: US1 + US4 + US5 (P1/P2) — the panel, the bar and the sentence

**Goal**: the phone's two views in one frame.

**Independent test**: toggle `Sheet │ Flow` on both tabs; the bar keeps its state, the
strip keeps its verdict, the `＋` appears in one view only.

- [ ] T031 [US1] `mobile/MobileEntityList.tsx` — four additions: `actions` and `titleAdornment` pass through to `MobilePanel`; `search`/`onSearch` become optionally controlled, falling back to the component's own state for Lighting; `children` **replace the rows** when present (research R10, contract §4)
- [ ] T032 [US1] `event/AudioInputsTab.tsx` — the phone branch renders **one** `MobileEntityList` for both views: `actions` carries the `Sheet │ Flow` segment and, in Flow, the `ZoomControl` with `resetLabel="fit"`; `children` carries the canvas in Flow (research R10)
- [ ] T033 [US1] `event/AudioInputsTab.tsx` — own `zoom: number | null` and `fit`; adopt fit on the first measurement and **clamp rather than reset** on later ones; step ×1.4 over `[fit, 1]`; reset to fit (data-model §2, FR-010, FR-012)
- [ ] T034 [US1] `event/AudioInputsTab.tsx` — lift the search query out of `MobileEntityList` onto the tab's existing `search` state, so one surface has one query (research R10)
- [ ] T035 [US4] `event/AudioInputsTab.tsx` — the withheld-gesture sentence as `ui/InfoNote` + `InfoToggle` in `titleAdornment`, in Flow only: *"Patching is a desk job — open this event on a computer. Tap any box to read or edit what it is."* It does not vary with role (contract §6, FR-027, FR-028)
- [ ] T036 [US1] `event/AudioInputsTab.tsx` — **no primary action in Flow** (FR-022); the overflow and the strip are unchanged by the view (FR-023, FR-024)
- [ ] T037 [US5] `event/AudioOutputsTab.tsx` — T032–T036, applied identically. Any behaviour that differs between the two tabs is a defect, not a design (FR-005 of US5)

**Checkpoint**: both phone surfaces have two views. The handset pass can begin.

---

## Phase 7: Documentation — in the same commit as the code it describes

`design/audit.md` Part 3: *a slice that changes a value updates the document in the same
commit*. These are listed separately only because they are separate files.

- [ ] T038 [P] `design/patterns.md` §7f — the **viewport-versus-layout** distinction: on a desk zoom changes the coordinate space, in a hand it moves the window. §7f already implies it; the code now depends on it (research R1)
- [ ] T039 [P] `design/components.md` §5 — `InspectorFrame`, `ZoomControl`'s phone form and the deleted copy, and `MobileEntityList`'s four additions
- [ ] T040 [P] `design/audit.md` — **M6 moves to Part 1b** with the wave that closed it; Part 1 becomes empty; Part 2's Wave 6 row reads *done*; the deferred field-test question is answered on the record
- [ ] T041 [P] `design/design-language.html` — the phone canvas specimen, and the two-row bar
- [ ] T042 `ROADMAP.md` — Slice 36, the dependency graph's last arrow, and the `window.confirm` finding added to *Known defects* beside D1 (spec Out of Scope)

---

## Phase 8: Validation

- [ ] T043 Run every gate in [quickstart.md](quickstart.md), including all six scope assertions
- [ ] T044 Run the three byte-identical checks and record the result — a delta that is accepted is written down, never waved through
- [ ] T045 The **handset pass**, A–G. Section A is a judgement, not a check: *is the whole graph at fit worth having, or is it just small?*
- [ ] T046 `reviewer` sub-agent against the spec, the acceptance criteria and the diff

---

## Dependencies

```
Phase 1 (baselines)  ──→ everything
Phase 2 (lib/)       ──→ Phase 5
Phase 3 (ZoomControl)──→ Phase 6   (the bar renders it)
Phase 4 (inspector)  ──→ Phase 5   (the canvas opens it)
Phase 5 (canvases)   ──→ Phase 6   (the panel renders them)
Phase 6              ──→ Phase 7, 8
```

**Parallel opportunities**: T002–T004; T005–T008; the `[P]` Outputs tasks against their
Inputs siblings once the Inputs one is written (they are the same change in a second
file, and doing them together is the point); all of Phase 7.

## Out of scope, restated so it is not re-discovered

Patching, moving a node, adding a row from Flow, a phone form for the cable picker or the
cable info dialog, replacing `window.confirm`, and any change to the stage plot canvas
beyond deleting its duplicated zoom cluster.
