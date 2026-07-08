# Implementation Plan: Print & Signal Flow

**Branch**: `005-print-signal-flow` | **Date**: 2026-07-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-print-signal-flow/spec.md`

## Summary

Add paper-friendly printing for the three planning tabs (input patch, output patch,
lighting rig) and a read-only per-input-channel signal-flow view. This is a
**frontend-only slice**: every piece of data the sheets and the flow view need is already
delivered by existing endpoints (`GET /events/{id}/audio-patch` returns stageboxes, stage
multis, inputs, and outputs in one response; the lighting endpoint returns rig, sections,
and fixtures). Printing is done with dedicated print-only sheet components (static tables,
no form controls) revealed by `@media print` CSS and triggered by a per-tab Print button
calling `window.print()`; the signal-flow chain is derived client-side by a pure,
unit-tested function. No new dependencies, no schema changes, no new API endpoints.

## Technical Context

**Language/Version**: Frontend TypeScript 5 / React 18 (Vite). Backend Go 1.25 — untouched
by this slice.

**Primary Dependencies**: React Router, TanStack Query, Tailwind CSS (has a built-in
`print:` variant), lucide-react icons. **No new dependencies** (no react-to-print, no
graph/PDF libraries).

**Storage**: N/A — purely presentational; reads existing API responses, writes nothing
(FR-010).

**Testing**: Vitest unit tests for the signal-flow chain builder (`lib/signalFlow.ts`).
Print output is CSS-driven and verified manually via quickstart.md (browser print
preview). No Go tests — no backend changes.

**Target Platform**: Modern desktop browsers (Chromium/Firefox print preview; both repeat
`<thead>` per page and honor `break-inside: avoid`).

**Project Type**: Web application (existing monorepo; only `frontend/` changes).

**Performance Goals**: Print sheets render synchronously from data already in the Query
cache; no additional network requests beyond what the tabs already make.

**Constraints**: Sheets must be legible on A4 and US Letter; dark text on light background
regardless of the dark on-screen theme (FR-005); only the active tab's content may print
(FR-004) — guaranteed structurally because `TabPanel` unmounts inactive panels, so the
active tab's sheet is the only one in the DOM (this also makes browser-menu Ctrl+P
behave identically to the Print button).

**Scale/Scope**: Typical events: ≤ 48 input channels, ≤ 24 outputs, ≤ 60 fixtures — a few
printed pages at most.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — PASS. No model changes. The signal-flow view renders
  the already-first-class chain (mic item → cable → stagebox port / multi channel → mixer
  channel) exactly as stored; it adds no free-text shadow data.
- **II. Extensibility by Design** — PASS. Sheets and the flow view display vocabulary
  values (labels from reference data, legacy values as-is) without hard-coding any
  vocabulary; nothing new is enum-coded.
- **III. Full-Stack Monorepo Architecture** — PASS. Changes live entirely under
  `frontend/src/`; REST API and migrations untouched. (The tracked
  `backend/internal/` vs `backend/{api,db}` layout deviation is not exercised by this
  slice; it remains scheduled for Slice 6.)
- **IV. Inventory-Driven Rental Workflow** — PASS (not affected). Rental order, export,
  and LL.xlsx are untouched.
- **V. Pragmatic Simplicity** — PASS. `window.print()` + print CSS instead of a PDF
  library or print npm package; text/table flow view instead of a graph library; chain
  derivation is one pure function; React built-in state only.

**Post-design re-check (Phase 1)**: still PASS — design introduces one pure lib module,
five presentational components, and CSS; no new abstractions, endpoints, or dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/005-print-signal-flow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view-model only; no schema changes)
├── quickstart.md        # Phase 1 output (manual print verification)
├── contracts/
│   └── print-signal-flow-ui.md   # UI contract: sheet columns, print behavior, flow rows
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/
│   └── signalFlow.ts                    # NEW: pure chain builder (unit-tested)
├── lib/__tests__/
│   └── signalFlow.test.ts               # NEW: Vitest coverage for the chain builder
├── components/print/
│   ├── PrintButton.tsx                  # NEW: per-tab button → window.print()
│   ├── PrintSheet.tsx                   # NEW: print-only wrapper + event header
│   ├── InputPatchSheet.tsx              # NEW: static input patch table (FR-001)
│   ├── OutputPatchSheet.tsx             # NEW: static output patch table (FR-002)
│   └── LightingRigSheet.tsx             # NEW: static rig table (FR-003)
├── components/event/
│   ├── AudioInputsTab.tsx               # MODIFIED: + PrintButton + InputPatchSheet
│   ├── AudioOutputsTab.tsx              # MODIFIED: + PrintButton + OutputPatchSheet
│   ├── LightingTab.tsx                  # MODIFIED: + PrintButton + LightingRigSheet
│   └── SignalFlowTab.tsx                # NEW: read-only flow view (screen + print)
├── components/Layout.tsx                # MODIFIED: print:hidden chrome, print:ml-0 main
├── pages/EventDetail.tsx                # MODIFIED: + "Signal Flow" tab
└── index.css                            # MODIFIED: @media print base rules (@page,
                                         #   white background, black text)

backend/ — no changes
```

**Structure Decision**: Follows the existing layout. Print components are grouped under
`frontend/src/components/print/` (five closely related presentational files); the
signal-flow tab joins its siblings in `components/event/`; the chain builder is a pure
module in `lib/` so Vitest can test it without rendering.

## Complexity Tracking

No constitution violations — table intentionally left empty.
