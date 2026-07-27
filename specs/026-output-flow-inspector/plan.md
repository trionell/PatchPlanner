# Implementation Plan: An inspector for the audio outputs flow graph

**Branch**: `026-output-flow-inspector` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-output-flow-inspector/spec.md`

## Summary

The outputs Flow view can be looked at but not worked in: selecting a box marks it
and nothing else, because that canvas has no inspector. Every output field is
therefore Sheet-only, while on the inputs side a source is editable from either
view.

This slice gives that canvas the rail its sibling already has, on the entity that
maps one-to-one onto the sheet's rows — the output. Three pieces, in order:

1. **Widen the selection** so it can name an output row and not just the box that
   draws it, and split the row gesture: the label selects, the dot still cables.
2. **Extract the rail** — frame, header, field row, note box, legend strokes — out
   of the inputs inspector into shared primitives, and build the output inspector
   on them. Not a copy: the two canvases' private copies of `NodeShell`/`PortDot`/
   `PortRow` are why the last slice existed, and a second rail would be the same
   mistake with a different component.
3. **Wire the rail** into the outputs canvas beside the graph, editing the output
   through the routes the sheet already uses, and stating where the run lands from
   the same chain model the sheet's Chain column renders.

Frontend only. No migration, no route, no domain change — and that is checked, not
assumed (`git diff --stat main -- backend/` must be empty).

## Technical Context

**Language/Version**: TypeScript 5 (React 18), Go 1.25 (untouched this slice)

**Primary Dependencies**: React 18, TanStack React Query, Tailwind CSS, Vite,
`lucide-react` for the two icons the rail uses. No new dependency.

**Storage**: SQLite — read and written through existing output routes; no schema
change.

**Testing**: Vitest for the pure helpers and the rail's derivations; `tsc -b` and
`eslint` as gates; the four-pass interactive walkthrough in
[quickstart.md](./quickstart.md) for the visual and gesture claims, which no unit
test can make.

**Target Platform**: Desktop browsers. The Flow view is desktop-only; the mobile
audio tabs keep their list-and-sheet editor and are untouched.

**Project Type**: Web application — `backend/` (Go) + `frontend/` (React/TS).

**Performance Goals**: An edit visible on the canvas within one refetch (SC-005).
No new render work per frame: the rail is one component beside the canvas, not
inside the per-node loop.

**Constraints**: The inputs Flow view must behave exactly as it does today
(FR-015/SC-006) — the extraction may move where its rail parts are defined and may
rename its file, and may change nothing about what it draws or does.

**Scale/Scope**: 2 new modules, 1 new inspector, 5 files edited, 1 renamed. Two
frontend test files. No backend files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Domain-First Data Model** | ✅ The rail edits a bus off a desk using the domain's own words — output number, type, width, tape, desk. Where it lands is **derived by walking the port-and-cable graph** (`outputChainSegments`), never stored on the row; storing "reaches the amp rack" as a field is exactly the free-text shortcut this principle forbids. |
| **II. Extensibility by Design** | ✅ Output types come from the `output_types` vocabulary and tape colours from `channel_colors`, both read through `useReferenceData` — the rail branches on no type name. `OutputFlowSelection` gains a `kind`, which is a client-side discriminated union, not a domain node kind: no table, endpoint or component per kind. |
| **III. Full-Stack Monorepo Architecture** | ✅ Frontend-only change under `frontend/src/`. No route, no handler, no migration. |
| **IV. Inventory-Driven Rental Workflow** | ✅ Not touched. The rail edits no inventory reference and no quantity; cables and their catalog items keep their existing editors. |
| **V. Pragmatic Simplicity** | ✅ Server state through `useMutation`/`useQuery` as everywhere else; selection is local `useState`. The one abstraction added — the shared rail module — is justified by a concrete existing need (two inspectors that must not drift), not a speculative one. No new dependency. |

**Post-design re-check**: still passing. The design added no entity, no endpoint and
no dependency; the only new type is a client-side union, and the only new module is
the extraction Principle V would have wanted anyway once there were two callers.

One thing worth naming rather than leaving to a reviewer to notice: the rail
deliberately does **not** hold a draft, while the sheet's inline editor does
(data-model.md §4). That is not an inconsistency to fix later — a rail with a draft
is a second source of truth for a row the sheet may also be editing.

## Project Structure

### Documentation (this feature)

```text
specs/026-output-flow-inspector/
├── plan.md                        # This file
├── spec.md                        # 16 FRs, 3 user stories, 6 success criteria
├── research.md                    # R1–R11: why no rail existed, and every decision
├── data-model.md                  # OutputFlowSelection; no persisted change
├── quickstart.md                  # Four interactive passes + the gate commands
├── checklists/requirements.md     # Spec quality checklist (all pass)
├── contracts/
│   └── inspector-rail.md          # The shared rail's values and the gesture split
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── event/
│   │   ├── graph/
│   │   │   ├── InspectorRail.tsx        # NEW — frame, header, Field, Note, Legend
│   │   │   ├── PortRow.tsx              # + optional selected/onSelect on PortRow
│   │   │   ├── PortDot.tsx              # unchanged
│   │   │   ├── NodeShell.tsx            # unchanged
│   │   │   ├── LaneBands.tsx            # unchanged
│   │   │   ├── ZoomControl.tsx          # unchanged
│   │   │   └── tokens.ts                # unchanged
│   │   ├── OutputFlowInspector.tsx      # NEW — the output rail
│   │   ├── InputFlowInspector.tsx       # RENAMED from FlowInspector.tsx; rail parts imported
│   │   ├── AudioOutputsTab.tsx          # selection widens; canvas gains the rail
│   │   ├── InputGraphCanvas.tsx         # import path + type name only
│   │   └── AudioInputsTab.tsx           # import path + type name only
│   └── ui/                              # untouched — Table, Badge, SheetTable, Input, Select
└── lib/
    ├── outputGraph.ts                   # unchanged
    ├── patchSheet.ts                    # unchanged — `outputChainSegments` reused as-is
    └── outputInspector.ts               # NEW — nextOutputNumber, landsOn, duplicateOf

backend/                                 # NO CHANGE (asserted by a gate, not assumed)
```

**Structure Decision**: The existing web-application layout. The shared rail goes
in `components/event/graph/` beside the other primitives Slice 25 extracted, because
it is the same kind of thing for the same reason. The three pure derivations
(next number, lands-on, duplicate payload) go in `lib/outputInspector.ts` rather
than inside the component, so they are testable without rendering — the pattern
`lib/patchSheet.ts` and `lib/patchCapacity.ts` already set.

The outputs canvas stays inside `AudioOutputsTab.tsx` this slice. Splitting it into
`OutputGraphCanvas.tsx` to mirror `InputGraphCanvas.tsx` is worth doing and is
recorded in research.md R11 — a 1000-line pure move in this commit would bury the
feature in the diff.

## Phase 0 — Research

Complete: [research.md](./research.md). Eleven findings, of which four changed the
design:

- **R1** — the missing rail was a documented Slice 25 boundary ("the mockup draws
  none"), not an oversight, so all the selection plumbing already exists. The work
  is the rail, not the wiring.
- **R2/R3** — `mixer` was doing two jobs: a mixer *port*'s id is an output's id, a
  mixer *node*'s selection id is a desk's id. Widening the union with `output` and
  dropping `mixer` removes the ambiguity instead of documenting it.
- **R5** — the legend's strokes must be shared (their claim is "this is what the
  canvas draws") but its wording must not: the input side's colour means *reaching a
  channel*, the output side's means *carrying an output*, and no output has phantom
  power.
- **R6** — "lands on" reuses the sheet's own chain model, so the rail and the Chain
  column cannot disagree — the same reasoning that made `derivedCableColor` be
  defined in terms of `derivedOutputPortColor` rather than reimplementing the walk.

## Phase 1 — Design

Complete: [data-model.md](./data-model.md),
[contracts/inspector-rail.md](./contracts/inspector-rail.md),
[quickstart.md](./quickstart.md).

**Order of work**, which is also the order the tasks are in:

1. `graph/InspectorRail.tsx` — extract the five parts verbatim from the inputs
   inspector, except the legend, which splits into shared strokes plus caller
   wording.
2. Rewire the inputs inspector onto them and rename its file. Gate: it must render
   identically. This is done *before* the new inspector exists, so any visual
   regression is attributable to the extraction alone.
3. `PortRow`'s optional `selected`/`onSelect`.
4. `lib/outputInspector.ts` + its tests — the three pure derivations.
5. `OutputFlowInspector.tsx`.
6. `AudioOutputsTab.tsx` — widen the selection, pass row selection into the two
   bus-list nodes, drop the desk box's `onSelect`, mount the rail, thread
   `itemLabelById` through.
7. Docs, gates, walkthrough.

## Complexity Tracking

> No Constitution Check violations. Nothing to justify.

One judgement call, recorded because it grows this slice's diff on the inputs side
beyond zero: **`FlowInspector.tsx` is renamed to `InputFlowInspector.tsx`** and its
exported `FlowSelection` becomes `InputFlowSelection`. FR-015 forbids changing what
the inputs inspector *draws or does*; a rename changes neither. Left alone, the pair
reads as "the flow inspector" and "the output one", which misdescribes both.

## Not in this slice

Named so they are decisions rather than omissions:

- **Splitting the outputs canvas into its own file** (research.md R11).
- **A rail for the desk box, or the "No desk" box** — their fields are in the Rig
  drawer and their contents each have a rail now (research.md R3).
- **Row selection on the inputs canvas's channel rows** — `PortRow` gains the
  capability; using it there would change the inputs Flow view, which FR-015
  forbids here.
- **A rail on the mobile audio tabs** — the Flow view is desktop-only.
