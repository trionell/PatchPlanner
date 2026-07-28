# Implementation Plan: The phone's panel

**Branch**: `034-phone-panel` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/034-phone-panel/spec.md`

## Summary

Wave 6b of the design convergence. Build `ui/MobilePanel` — the phone's frame: a bar
that wraps, a rows region that scrolls, and a strip that closes it — then put all nine
phone lists inside one. Rewrite `CondensedListRow` so a row is a row rather than a card,
at the navigation tier's type and at the height it already has. Give the four existing
status rails a phone form in which **the strip itself is the control**.

Frontend only: no endpoint, no migration, no field. One new component, one rewritten
one, four two-line rail branches, one lib extraction at its second caller, and nine call
sites.

Three documentation defects found during the mockup review land in the same slice as the
code they describe: the section switcher's drawn counts (**F1**), four phone lists in no
wave phase (**F2**), and a row whose stated padding cannot produce its stated height
(**F3**).

## Technical Context

**Language/Version**: TypeScript 5, React 18

**Primary Dependencies**: Vite, Tailwind CSS (default type scale — `tailwind.config.ts`
extends only `colors.zinc.850`), `tailwind-merge` via `cn()`, TanStack React Query
(untouched here — no server state changes), `lucide-react`

**Storage**: N/A — no schema change, no query change

**Testing**: Vitest with `renderToStaticMarkup` from `react-dom/server`. No DOM, no React
Testing Library (constitution; precedent `Sheet.test.tsx`, `OverviewBands.test.tsx`)

**Target Platform**: Browser. The branch is `useIsMobile()` — `(max-width: 767px)`

**Project Type**: Web application (Go backend + React frontend); **frontend only** this
slice

**Performance Goals**: No new render work on the desktop. On a phone, one additional
derivation per surface — the status the strip states, which the desktop already computes
for the same data

**Constraints**: Every tappable control ≥ 44 px. A list at 375 × 667 must show **no fewer
rows than it does today** (eight). No value outside the two density tiers may remain in
`components/mobile/`

**Scale/Scope**: 9 phone lists, 6 surface files, 1 new component, ~11 changed files plus
`design/`

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | No model change. The one type addition (`hasGap` on the two mobile list items) is a derived read projection in `lib/`, not a stored field. |
| **II · Extensibility by Design** | `MobilePanel` takes `actions` as a node precisely so 6c and 6d can add Print, the Rig button and the `Sheet \| Flow` toggle without changing its signature (research R1). |
| **III · Full-Stack Monorepo** | Frontend only, asserted rather than assumed: `git diff -- backend/ frontend/src/api/` must be empty (research R10). |
| **IV · Inventory-Driven Rental Workflow** | Untouched. The rental tab's phone branch swaps a hand-built total row for the rail that already states the same total. |
| **V · Pragmatic Simplicity** | Three calls, all recorded. **(a)** One row component, not two — a second differing only in whether it draws its own border is `A1`'s synonym failure. **(b)** The status derivation is extracted **at its second caller**, not before (research R6), and only for the two rails that lack a lib function; the other two already have one. **(c)** `MobilePanel` gets five props and an `actions` node rather than a prop per surface control — the `<EntityList fields={…}>` failure `ui/GearList` exists to avoid. |

**Violations**: none. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/034-phone-panel/
├── mockup.html          # revision 2 — the approved visual source of truth
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mobile-panel.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source code

```text
frontend/src/
├── components/
│   ├── ui/
│   │   └── MobilePanel.tsx          # NEW — the frame
│   ├── mobile/
│   │   ├── CondensedListRow.tsx     # the row stops being a card
│   │   └── MobileEntityList.tsx     # becomes a panel
│   └── event/
│       ├── PatchStatusRail.tsx      # phone form + strip-as-control
│       ├── LightingStatusRail.tsx   #   "
│       ├── EquipmentStatusRail.tsx  #   "
│       ├── RentalStatusRail.tsx     #   "
│       ├── InputSheet.tsx           # loses its inline PatchStatus to lib
│       ├── OutputSheet.tsx          #   "
│       ├── AudioInputsTab.tsx       # phone branch: title + strip + filter
│       ├── AudioOutputsTab.tsx      #   "
│       ├── LightingTab.tsx          #   "
│       ├── EquipmentTab.tsx         # phone branch: panel + strip
│       └── RentalTab.tsx            # phone branch: panel + strip, total row deleted
├── lib/
│   ├── patchCapacity.ts             # gains inputPatchStatus / outputPatchStatus
│   ├── mobileChannelList.ts         # gains hasGap
│   └── mobileOutputList.ts          # gains hasGap
└── pages/
    ├── Dashboard.tsx                # 1 list → panel
    ├── Events.tsx                   # 1 list → panel, headings inside the frame
    └── Inventories.tsx              # 2 lists → panels

design/
├── tokens.md            # §7: the row states a height (F3); bar target at 44
├── patterns.md          # §7b: search behaviour, strip-as-control
├── components.md        # §5: the MobilePanel gap closes
├── audit.md             # M1–M3 → Part 1b; F2 recorded; wave table updated
└── design-language.html # §8: bar redrawn at 44; switcher counts removed (F1)

ROADMAP.md               # Slice 34
```

**Structure Decision**: The existing monorepo layout, frontend only. `MobilePanel` goes
in `components/ui/` rather than `components/mobile/` because it is reached from pages as
well as event tabs and is not audio-specific — the same placement `ui/Sheet` got in 6a,
and for the same reason (`components.md` §6).

## Implementation order

Four phases, matching the spec's four stories. Each is independently shippable and each
ends green.

| Phase | Story | Delivers |
|---|---|---|
| 1 | US1 + US2 | `MobilePanel`, the rewritten row, and the three `MobileEntityList` surfaces. Closes `M1` and `M2`; the reading half of `M3` on three surfaces. |
| 2 | US3 | The four rails' phone form and the strip-as-control. Closes `M3`. |
| 3 | US4 | The remaining six lists. `M1` everywhere; the rental total row deleted. |
| 4 | — | `design/`, `audit.md`, `ROADMAP.md`, and the three findings recorded. |

US1 and US2 are one phase because they are one edit: a row cannot lose its card without a
frame to be inside, and a frame full of card-shaped rows is the finding unclosed.

## Declared deltas

Stated here, before the change, so anything else found afterwards is a finding rather
than a surprise (research R10).

1. **`InputSheet` and `OutputSheet` lose their inline `PatchStatus` construction** to
   `lib/patchCapacity.ts`. A refactor with no rendered difference; its test is that the
   sheets' existing tests still pass.
2. **The four status rails gain a phone branch.** Their desktop return must be
   byte-identical, verified through `twMerge` rather than read.

Nothing else on the desktop changes. `git diff --stat -- backend/ frontend/src/api/`
must be empty.

## Out of scope, by finding

Named so the boundary with 6c and 6d is checkable rather than remembered:

| | Stays open |
|---|---|
| `M4` | `!isMobile` used as a permission, in Equipment, Rental and Stage Plots — and `MobileEntityList`'s `onClick={readOnly ? undefined : …}`, which is the sharper half of the same finding |
| `M5` | The rig, buses and universes drawers are not mounted in any phone branch |
| `M6` | The canvases |
| `M9` | Overview and Settings have no phone branch |
| `M11` | A phone branch that renders `print:hidden` and nothing else |

## Complexity Tracking

None. No violation to justify.
