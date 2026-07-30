# Implementation Plan: The canvases

**Branch**: `036-phone-canvas` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/036-phone-canvas/spec.md`

## Summary

Wave 6d of the design convergence — the last phase, and the only one that is a **new
capability** rather than a conversion. Both audio Flow canvases mount on a phone, closing
audit finding **M6** and with it Wave 6.

The canvas becomes a **viewport**: the graph's logical space is pinned, zoom moves the
window rather than the contents, the pan is the platform's own scrolling, and nothing is
pinned to the canvas's edges. It opens at the scale where the whole graph fits both axes,
and the zoom readout resets there. The inspector rail's contents open in the un-scrimmed
`ui/Sheet` that 6a built for this and left with no caller, and they **edit**.

Two things arrive with it. **Search stops being a highlight and becomes a direction** —
the first match is brought into view, at every width, which is a small deliberate desktop
improvement. And **the second zoom control 6c hand-built inside `StagePlotTab` is
deleted**: the shared one gains a phone form inside itself, which is the fifth time in
this wave that a branch inside a shared component gave several surfaces a phone form at
once.

Frontend only: no endpoint, no migration, no backend file, no stored field.

## Technical Context

**Language/Version**: TypeScript 5, React 18

**Primary Dependencies**: Vite, Tailwind CSS, `tailwind-merge` via `cn()`, TanStack React
Query, `lucide-react`. **No new dependency** — the pinch handler is Pointer Events, which
is already how both canvases drag

**Storage**: N/A. No schema change, no query change, no new cache key. The one persisted
value the slice reads — which view a tab is showing — already persists in `localStorage`
through `usePatchView`

**Testing**: Vitest with `renderToStaticMarkup` from `react-dom/server` for components,
and plain unit tests for the two new pure modules. No DOM, no React Testing Library
(constitution; precedent `Sheet.test.tsx`, `MobilePanel.test.tsx`, `dmxPlan.test.ts`)

**Target Platform**: Browser. The branch is `useIsMobile()` — `(max-width: 767px)`

**Project Type**: Web application (Go backend + React frontend); **frontend only** this
slice

**Performance Goals**: No new render work on a desk. On a phone the graph is drawn once
and then only transformed — pan is `scrollLeft`/`scrollTop`, which never re-renders React,
and zoom re-runs the same layout effect the desktop's zoom already re-runs. **The pan must
not enter React state**, or a 20-node graph re-renders on every pointer move

**Constraints**: Every tappable control ≥ 44 px. The panel bar has **317 px** at 375 and
wraps to two rows in Flow. The graph's logical space is **fixed at 820 × 640** and no node
position is written. **No shared drawing primitive may change**, and **no desktop
composition may change** except the one stated search behaviour

**Scale/Scope**: 2 canvases, 2 inspectors, 2 tabs, 1 shared control, 1 new frame, 2 new
`lib/` modules, 1 new hook, ~14 changed files plus `design/`

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | No model change and no new entity. The only new state is `fit`, which is a fact about the **viewport** rather than about the plan — the one thing in this slice a phone and a desk may legitimately disagree about (data-model §5). No node position is written from a phone; the stored coordinate space is read and never renegotiated (research R1). |
| **II · Extensibility by Design** | The third canvas is already a caller of `ZoomControl`; the phone form it gains serves all three without any of them branching. `InspectorFrame` takes exactly what an inspector already had, so a third flow inspector would need nothing new. Nothing branches on a node kind, a section name or a role string. |
| **III · Full-Stack Monorepo** | Frontend only, asserted rather than assumed: `git diff -- backend/ frontend/src/api/` must be empty (quickstart, *Scope assertions*). |
| **IV · Inventory-Driven Rental Workflow** | Untouched. The canvas reads the patch; the rental order derives from it exactly as before, and the inspector's writes invalidate `['rental-summary']` exactly as they already do. |
| **V · Pragmatic Simplicity** | Five calls, all recorded in research. **(a)** `InspectorFrame` is a new component with two callers, and it exists so the desktop return is identical *by construction* rather than by care (R7) — the alternative was the same sheet wiring in two files, which is the pair this project has already watched drift. **(b)** `usePinchZoom` is a hook with two callers, for arithmetic that is one frame from being wrong (R12). **(c)** Two `lib/` modules rather than inline arithmetic, because the constitution puts derivations where they can be tested without rendering and both have edge cases invisible in a render test (R2, R6). **(d)** The canvases call `useIsMobile()` themselves rather than taking a prop — the `ui/Drawer` precedent, and the fifth use of it in this wave (R1). **(e)** `useInspectorControlSize` is a hook rather than sixteen inline ternaries (R9). |

**Violations**: none. Complexity Tracking is empty.

### One requirement of this spec was revised during planning

The spec's first draft said the zoom control **must not change** (FR-013), and that the
shared primitives *including it* must not change (FR-033). Planning found that this cannot
hold with `tokens.md` §7 amendment 1: the shared control's targets are 28 px, and the only
way for a phone to reach 44 without changing it is to hand-build a second control — which
is what 6c did, and which this slice would have made the third copy of.

So both requirements were rewritten before Phase 0 rather than worked around. The
primitives that **draw** stay pinned (FR-033); the control gains a phone form inside itself
(FR-013); 6c's copy is deleted (FR-013a). The finding is recorded in the spec's Context,
because a phase that discovers a duplicate is the phase that should own it.

## Project Structure

### Documentation (this feature)

```text
specs/036-phone-canvas/
├── mockup.html               # revision 1 — the approved visual source of truth
├── spec.md
├── plan.md                   # this file
├── research.md               # R1–R13
├── data-model.md             # view state, and who owns each piece
├── quickstart.md             # gates, three byte-identical checks, the handset pass
├── contracts/
│   └── phone-canvas.md
├── checklists/
│   └── requirements.md
└── tasks.md                  # /speckit-tasks output
```

### Source code

```text
frontend/src/
├── lib/
│   ├── canvasFit.ts               + fitScale — the largest scale that fits both axes   R2
│   ├── canvasFit.test.ts          +
│   ├── canvasFocus.ts             + firstMatch, focusOffset — moving the window        R6
│   └── canvasFocus.test.ts        +
├── hooks/
│   └── usePinchZoom.ts            + two pointers, scaling about their midpoint        R12
├── components/
│   ├── event/
│   │   ├── graph/
│   │   │   ├── ZoomControl.tsx         ~ a phone form inside itself; + resetLabel      R8
│   │   │   ├── ZoomControl.test.tsx    +
│   │   │   ├── InspectorFrame.tsx      + the rail, or the un-scrimmed sheet            R7
│   │   │   ├── InspectorFrame.test.tsx +
│   │   │   ├── InspectorRail.tsx       ~ + useInspectorControlSize — additions only    R9
│   │   │   ├── NodeShell.tsx           — untouched (FR-033)
│   │   │   ├── PortDot.tsx             — untouched (FR-033)
│   │   │   ├── PortRow.tsx             — untouched (FR-033)
│   │   │   ├── LaneBands.tsx           — untouched (FR-033)
│   │   │   └── tokens.ts               — untouched (FR-033)
│   │   ├── InputGraphCanvas.tsx        ~ viewport, pan guard, gestures      R1 R4 R5 R11
│   │   ├── InputFlowInspector.tsx      ~ InspectorFrame; the control size         R7 R9
│   │   ├── OutputFlowInspector.tsx     ~ InspectorFrame; the control size         R7 R9
│   │   ├── AudioInputsTab.tsx          ~ two views, zoom + fit, the bar         R3 R10
│   │   ├── AudioOutputsTab.tsx         ~ the same, and OutputGraphCanvas lives here
│   │   └── StagePlotTab.tsx            ~ the hand-built zoom cluster deleted         R8
│   └── mobile/
│       └── MobileEntityList.tsx        ~ + actions, titleAdornment, search, children R10
└── ...

design/
├── audit.md                  ~ M6 moves to Part 1b; Wave 6 is complete
├── patterns.md               ~ §7f gains the viewport-vs-layout distinction
├── components.md             ~ §5 gains InspectorFrame and the control's phone form
└── design-language.html      ~ the phone canvas specimen
```

**Structure Decision**: The existing frontend layout, unchanged. The two new `lib/`
modules sit beside `patchCapacity.ts` and `dmxPlan.ts`, which are the precedent for a pure
derivation with its own tests; the new hook sits beside `useIsMobile.ts`; `InspectorFrame`
sits in `graph/` because it is canvas-only, which is `components.md` §6's rule.

## Phase ordering

Five phases, ordered so nothing is built twice and a regression is attributable.

| Phase | What | Why here |
|---|---|---|
| **1** | The two `lib/` modules and their tests | Pure, dependent on nothing, and everything below calls them. They can be wrong in ways only a unit test finds. |
| **2** | `ZoomControl`'s phone form; `StagePlotTab`'s copy deleted | The only change that touches a **third** surface, so it lands alone and its desktop return is diffed before anything else moves. |
| **3** | `InspectorFrame`, `useInspectorControlSize`, both inspectors onto them | The inspector must exist before a canvas can open one. Both together, because a phone form built at one and copied to the other is this project's own cautionary tale. |
| **4** | Both canvases: the viewport, the pan guard, pinch, the withheld gestures, search moving the window | The largest phase, and the only one whose **desktop** behaviour changes at all (the search scroll). Both together, for the same reason as phase 3. |
| **5** | Both tabs: two views in one panel, the bar, the sentence; `MobileEntityList`'s four additions | Last, because it cannot be verified without the four below it. |

`design/` is updated **in the same commit as the change it describes**, per
`design/audit.md` Part 3 — never in a documentation phase at the end.

## Complexity Tracking

*Empty — the Constitution Check found no violation.*
