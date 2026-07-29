# Implementation Plan: The nine surfaces

**Branch**: `035-phone-surfaces` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/035-phone-surfaces/spec.md`

## Summary

Wave 6c of the design convergence, and the last conversion phase. Put the nine event
sections in 6b's panel frame: give **Overview** and **Settings** a phone composition
(`M9`), make the **Rig, Buses and Universes** drawers reachable (`M5`), stop `&&`-ing a
viewport into a role on **Equipment, Rental and Stage Plots** (`M4`), and render the
**print sheets** in the phone branch (`M11`).

Three findings the mockup added land with them: **`SignalFlowStatusRail` is a fifth status
rail** outside the shared shell (F1), **the bar's overflow** was specified in 6b and never
built (F2), and a constant is named after something 6a deleted (F3). Two more things arrive
with them: the **fixed-height shell** 6b built, reverted and named 6c's, and the **event's
name in the header**, raised at the design review.

Frontend only: no endpoint, no migration, no field. Three new components, one new panel
prop, one new inspector prop, and eleven surfaces.

## Technical Context

**Language/Version**: TypeScript 5, React 18

**Primary Dependencies**: Vite, Tailwind CSS (default type scale — `tailwind.config.ts`
extends only `colors.zinc.850`), `tailwind-merge` via `cn()`, TanStack React Query,
`react-router-dom` (`useMatch`, a new call site in `Layout`), `lucide-react`

**Storage**: N/A — no schema change, no query change. One existing cache key gains a second
reader (`['event', id]` in `Layout`), which React Query serves from the same entry

**Testing**: Vitest with `renderToStaticMarkup` from `react-dom/server`. No DOM, no React
Testing Library (constitution; precedent `Sheet.test.tsx`, `MobilePanel.test.tsx`,
`OverviewBands.test.tsx`)

**Target Platform**: Browser. The branch is `useIsMobile()` — `(max-width: 767px)`

**Project Type**: Web application (Go backend + React frontend); **frontend only** this
slice

**Performance Goals**: No new render work on the desktop. On a phone, one additional
derivation per surface — Overview's readiness lines, from an `EventSummary` the desktop
already computes. No new request: every query this slice reads is already cached under its
existing key by the surface that owns it

**Constraints**: Every tappable control ≥ 44 px. The panel bar has **317 px** at 375. A list
at 375 × 667 must show **no fewer rows than it does today**. No value outside the two
density tiers in any phone branch. **No desktop composition may change**

**Scale/Scope**: 9 event sections, 3 new components, 2 new props, ~20 changed files plus
`design/`

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | No model change. The one type addition (`ReadinessLine`) is a derived read projection in `lib/`, assembled from `EventSummary` fields that already exist — not a stored field, and not a second derivation (data-model §2). |
| **II · Extensibility by Design** | `overflow` is a typed list the panel renders, so a tenth surface with a tenth action needs no panel change. `StagePlotInspector`'s `spatial` defaults to `true`, so the desktop is not a caller of the new behaviour. No logic branches on a category, a section name or a role string. |
| **III · Full-Stack Monorepo** | Frontend only, asserted rather than assumed: `git diff -- backend/ frontend/src/api/` must be empty (quickstart, *Scope assertions*). |
| **IV · Inventory-Driven Rental Workflow** | The rental order becomes editable from a phone rather than changing what it is. All three exports keep their desktop rules, including that the price-list export is offered **only** for a catalog imported from one. |
| **V · Pragmatic Simplicity** | Four calls, all recorded in research. **(a)** Two edit sheets rather than one configurable form (R6) — `components.md` §5's existing rule, and these two are further apart than the three that already follow it. **(b)** `MobileOverviewPanel` has **one** caller, which normally argues for inlining; the countervailing rule is that a 120-line phone composition inside a desktop tab is how a phone value gets copied onto a desk (R2). **(c)** `StagePlotInspector` gets a boolean, not a fork (R7). **(d)** `overflow` is a typed list while `actions` stays a node — the opposite call in the same component, because one has a fixed shape and the other does not (R1). |

**Violations**: none. Complexity Tracking is empty.

### One superseded requirement, recorded rather than resolved silently

Slice 21 **FR-012** made Equipment and Rental *"a read-only lookup on mobile for every
role"*. `patterns.md` §7g says the opposite in a list that names them, and names exactly one
desk job, which is neither. §7g wins — it is newer and more specific — and the decision was
put to the user at the design review and confirmed. FR-012 is superseded by this
specification, and the comments quoting it are deleted with the code they justify.

## Project Structure

### Documentation (this feature)

```text
specs/035-phone-surfaces/
├── mockup.html               # revision 2 — the approved visual source of truth
├── spec.md
├── plan.md                   # this file
├── research.md               # R1–R13
├── data-model.md
├── quickstart.md
├── contracts/
│   └── phone-surfaces.md
├── checklists/
│   └── requirements.md
└── tasks.md                  # /speckit-tasks output
```

### Source code

```text
frontend/src/
├── components/
│   ├── Layout.tsx                        ~ the column; the event's name in the header
│   ├── VocabularyPanel.tsx               ~ a phone branch — serves Settings AND /my-defaults
│   ├── mobile/
│   │   ├── MobileOverviewPanel.tsx       + Overview's phone composition          M9
│   │   ├── MobileEquipmentEditSheet.tsx  + quantity, note                        M4
│   │   ├── MobileRentalEditSheet.tsx     + manual audio, manual light, note      M4
│   │   ├── MobileEntityList.tsx          ~ the row is tappable for every role     M4
│   │   ├── MobileNav.tsx                 ~ static, a sibling in the column
│   │   └── index.ts                      ~ exports
│   ├── ui/
│   │   ├── MobilePanel.tsx               ~ + overflow; the column's classes       F2
│   │   └── MobilePanel.test.tsx          ~ + the overflow's three cases
│   └── event/
│       ├── OverviewTab.tsx               ~ a phone branch                         M9
│       ├── SettingsTab.tsx               — untouched: the branch is in VocabularyPanel
│       ├── AudioInputsTab.tsx            ~ drawers, overflow, print sheet      M5 M11
│       ├── AudioOutputsTab.tsx           ~ drawers, overflow, print sheet      M5 M11
│       ├── LightingTab.tsx               ~ drawers, overflow, print sheet      M5 M11
│       ├── SignalFlowTab.tsx             ~ cards → panel, two runs, the strip      F1
│       ├── SignalFlowStatusRail.tsx      ~ onto the StatusStrip shell              F1
│       ├── StatusStrip.tsx               ~ desktopExtras' comment stops deferring
│       ├── EquipmentTab.tsx              ~ editable = !readOnly                    M4
│       ├── RentalTab.tsx                 ~ editable = !readOnly; exports           M4
│       ├── StagePlotTab.tsx              ~ a panel, the sentence, the sheet        M4
│       └── StagePlotInspector.tsx        ~ + spatial?: boolean
├── pages/
│   └── EventDetail.tsx                   ~ the header block goes; back joins the switcher
├── lib/
│   └── eventSummary.ts                   ~ + readinessLines()
└── types/
    └── mobile.ts                         ~ MOBILE_SECTION_CAPABILITIES → MOBILE_SECTIONS  F3

design/
├── audit.md              ~ M4, M5, M9, M11 struck; "four rails" → five
├── patterns.md           ~ §7b's overflow rule; §7b's "the page scrolls" removed; §7c's exception
├── components.md         ~ §5: five rails; the overflow; the three new components
├── tokens.md             ~ §7: the wrap exception, named
└── design-language.html  ~ §8: the overflow sheet, the readiness row
```

**Structure Decision**: The existing web-application layout, frontend only. Phone
compositions live in `components/mobile/` because `components.md` §5 defines that directory
as *reached only from inside a `useIsMobile()` branch* — which is what keeps a phone value
from being copied onto a desk.

Two phone branches deliberately live **inside shared components** — `VocabularyPanel`, and
`StatusStrip` via the rails — rather than at their call sites. That is `ui/Drawer`'s
precedent, which gave six drawers a phone form in 6a and five strips one in 6b without a
caller being edited, and it is why `SettingsTab.tsx` appears above as untouched while its
surface changes completely.

## Phasing

The user stories are independently testable, but two ordering constraints are real rather
than preferences:

1. **US7 (the shell) cannot land before US4 and US5.** The column's failure mode is caused
   by surfaces that are not panels, and Overview and Settings are the last two.
2. **US2, US6 and US8 depend on the overflow (F2)**, which is not a story of its own because
   it delivers no user value alone. It is the first task after the shared plumbing.

```
  MobilePanel.overflow (F2) ──┬─→ US2  the drawers          M5
                              ├─→ US6  signal flow          F1
                              └─→ US8  print                M11

  US1  a viewport is not a permission   M4   ─── independent
  US3  the event's name                      ─── independent
  US4  Overview                         M9  ──┬─→ US7  the shell
  US5  Settings and My Defaults         M9  ──┘
```

## Delta from Wave 6b

Three things 6b left behind, and what happens to each:

| 6b left | 6c does |
|---|---|
| *"The page scrolls, not the panel"* — the column built and reverted in one slice | Builds it, with **both** halves of the flex minimum-size rule stated (research R11), and the three offending surfaces converted first |
| `StatusStrip.desktopExtras`, whose comment reads *"Open Rig, whose drawer is not mounted on a phone (M5)"* | The drawer is mounted; **Open Rig goes to the overflow**, not into the strip, because on a phone the strip is already the filter control. The prop stays, with an honest comment instead of a deferred one |
| *"four status rails"*, in `audit.md` and `components.md` | Five (F1) |

## Out of Scope

- The Flow canvas on a phone (`M6`, wave 6d). This slice settles the two things 6d needs
  first: what a bar does when it runs out of room, and what an inspector in a sheet is.
- Creating or positioning stage-plot elements from a phone — creating an element is placing
  one.
- Sorting or bulk edit on any phone list; the desktop does not have them either.
- Any backend change.
- The signed-out start page (`audit.md` Part 2b).

## Complexity Tracking

Empty — the Constitution Check records no violations.
