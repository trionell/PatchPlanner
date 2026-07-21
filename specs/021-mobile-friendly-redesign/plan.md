# Implementation Plan: Mobile-Friendly Redesign

**Branch**: `021-mobile-friendly-redesign` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-mobile-friendly-redesign/spec.md`

## Summary

Make PatchPlanner usable on a phone without touching desktop at all. The
fixed sidebar and nine-tab event strip get phone-width equivalents (a
bottom nav bar and a section-switcher sheet); Overview and Settings/My
Defaults stay fully editable as-is; Audio Inputs, Audio Outputs, and
Lighting Rig get a new condensed searchable list + edit-sheet pattern so
on-site rigging changes (channel routing, colors, DMX addresses/universe,
adding a channel or fixture) are possible from a phone; Stage Plots and
Signal Flow reuse their existing desktop canvases in `readOnly` mode as
pinch/pan viewers; Equipment and Rental Order become dense read-only
lists. Every mutation this feature needs already exists on the backend —
this is a frontend-only, presentation-and-interaction feature with zero
schema or API changes.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18 (frontend only — no backend
language/version change).

**Primary Dependencies**: None new. Reuses the existing frontend stack
(React Router, TanStack Query, Tailwind CSS, `lucide-react`) and native
browser APIs (`window.matchMedia`, Pointer Events) for the two genuinely
new mechanisms — the mobile/desktop breakpoint switch and pinch-to-zoom.

**Storage**: N/A — no schema, migration, or persisted-data change. Every
mobile view reads/writes through API functions that already exist in
`frontend/src/api/*.ts` (see `research.md` R3/R4).

**Testing**: Vitest for new frontend logic (breakpoint hook, pinch-zoom
math, cable-resolution helper reused by the mobile edit sheet); existing
Go `go vet`/`go test` gates stay green untouched since no backend code
changes.

**Target Platform**: Mobile web browsers (phone-width viewports, <768px)
as an additional supported layout of the existing responsive web app — no
native app, no new deployment target.

**Project Type**: Web application (existing `backend/` + `frontend/`
monorepo) — this feature is scoped entirely to `frontend/`.

**Performance Goals**: Pinch-zoom/pan on the stage-plot and signal-flow
viewers stays smooth (no dropped-frame stutter) with typical plot/graph
sizes; mobile list search/filter stays instant (client-side, no debounce
needed) for the channel/fixture counts real events have (dozens, not
thousands).

**Constraints**: Desktop layouts, densities, and interactions MUST be
pixel-unchanged (FR-016/SC-004) — every new component is additive and
gated behind `useIsMobile()`, never replacing a desktop code path in
place. No new runtime dependency (Constitution V).

**Scale/Scope**: Touches `Layout.tsx`, `EventDetailPage`, `AudioInputsTab`,
`AudioOutputsTab`, `LightingTab`, `EquipmentTab`, `RentalTab`, `Events`,
`Dashboard`, `Inventories`, `StagePlotCanvas`, `InputGraphCanvas`, plus a
handful of new shared components under `frontend/src/components/mobile/`.
No backend files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Domain-First Data Model | No new entity; audio routing continues to be represented as the explicit `input_cables`/`output_cables` graph — the mobile edit sheet's "stagebox/input" field is a UI simplification over that graph, never a new denormalized field (research.md R3). | PASS |
| II. Extensibility by Design | No new equipment/connector/fixture-mode concept introduced. | PASS (N/A) |
| III. Full-Stack Monorepo Architecture | Zero backend changes; frontend structure (`components/`, `pages/`, `hooks/`, `api/`) extended with existing conventions, no new top-level layout. | PASS |
| IV. Inventory-Driven Rental Workflow | Rental Order becomes read-only-on-mobile presentation only; export/aggregation logic untouched. | PASS (N/A) |
| V. Pragmatic Simplicity | No new runtime dependency — breakpoint detection and pinch-zoom use native browser APIs; server state stays on TanStack Query, new local/UI state (sheet open/close, search filter, pinch tracking) stays on `useState`. | PASS |

No violations. Complexity Tracking section is empty.

*Post-Phase-1 re-check*: data-model.md and contracts/mobile-ui-contract.md confirm no new entities, no new endpoints, and no new dependency were introduced during design — gate still PASSES unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/021-mobile-friendly-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── mobile-ui-contract.md
└── tasks.md              # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root)

```text
backend/                          # UNCHANGED by this feature

frontend/
├── src/
│   ├── hooks/
│   │   └── useIsMobile.ts                 # NEW — matchMedia(max-width: 767px)
│   ├── components/
│   │   ├── Layout.tsx                     # MODIFIED — mount MobileNav below md
│   │   ├── mobile/                        # NEW — shared mobile-only components
│   │   │   ├── MobileNav.tsx
│   │   │   ├── SectionSwitcher.tsx
│   │   │   ├── CondensedListRow.tsx
│   │   │   ├── MobileChannelList.tsx
│   │   │   ├── MobileChannelEditSheet.tsx
│   │   │   ├── MobileFixtureList.tsx
│   │   │   └── MobileFixtureEditSheet.tsx
│   │   └── event/
│   │       ├── StagePlotCanvas.tsx        # MODIFIED — add pinch-to-zoom (readOnly already exists)
│   │       ├── InputGraphCanvas.tsx       # MODIFIED — add pinch-to-zoom (readOnly already exists)
│   │       ├── AudioInputsTab.tsx         # MODIFIED — branch to MobileChannelList below md
│   │       ├── AudioOutputsTab.tsx        # MODIFIED — same, output variant
│   │       ├── LightingTab.tsx            # MODIFIED — branch to MobileFixtureList below md
│   │       ├── EquipmentTab.tsx           # MODIFIED — use CondensedListRow below md
│   │       └── RentalTab.tsx              # MODIFIED — use CondensedListRow below md
│   └── pages/
│       ├── EventDetail.tsx                # MODIFIED — branch to SectionSwitcher below md
│       ├── Dashboard.tsx                  # MODIFIED — use CondensedListRow below md
│       ├── Events.tsx                     # MODIFIED — use CondensedListRow below md
│       └── Inventories.tsx                # MODIFIED — condensed rows below md
```

**Structure Decision**: No new top-level directory beyond
`frontend/src/components/mobile/`, which groups the genuinely new,
mobile-only components (nav shell, section switcher, condensed row,
channel/fixture list-and-sheet pairs) — everything else is a small,
additive branch inside an existing file, gated by `useIsMobile()`, per
Constitution III's existing `components/`/`pages/` layout.

## Complexity Tracking

*No entries — Constitution Check has no violations to justify.*
