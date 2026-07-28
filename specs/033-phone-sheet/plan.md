# Implementation Plan: The sheet, and the edge the thumb is on

**Branch**: `033-phone-sheet` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/033-phone-sheet/spec.md`

## Summary

Wave 6a builds the two primitives the phone's other three phases stand on, and
converts the six overlays that have been standing in for them.

**The shell.** `ui/Sheet` — bottom-anchored, `rounded-t-xl`, `max-h-[85svh]`,
the body the only thing that scrolls, `Escape` and scrim to close, the safe-area
inset added under whatever the last row is. Six props, and an opinion about
nothing inside it.

**The anchor.** `ui/Drawer` reads `useIsMobile()` and returns a `Sheet`, passing
its props through. Six drawers acquire a phone form from one branch — Rig,
Buses, Universes, Categories, Import, and the catalog's manage drawer — none of
which is touched.

**The hardening.** `ui/Dialog` gains `Escape` and internal scroll, both by
addition, both things `Drawer` already does. It stays centred at every width:
*an overlay with fields is a `Sheet`; an overlay that is a sentence and two
buttons is a `Dialog`.*

**The conversions.** Three phone edit sheets, the section switcher, the
inventory category filter, and `MobileNav`'s inline sheet. M12 rides along —
18 `FieldLabel`s become the drawer's own `MicroLabel` via one new `FieldStack`
width. M7 rides along — the capability badge, its reserved hue and its sixth
micro-label definition are deleted.

**The viewport.** `viewport-fit=cover`, without which every
`env(safe-area-inset-*)` in the tree has been `0` on iOS since Slice 21, plus
`interactive-widget=resizes-content` for the engine that honours it. That makes
`pb-20` a live guess rather than a dormant one, so M10 closes with it.

No endpoint, no migration, no backend file, no new dependency, and one stated
desktop delta.

## Technical Context

**Language/Version**: TypeScript 5 / React 18. No Go in this slice.

**Primary Dependencies**: React, react-router-dom, TanStack React Query,
Tailwind, lucide-react. **Nothing added** — the phase's whole surface is
composition of what is there.

**Storage**: None. No schema, no query, no payload. See
[data-model.md](data-model.md).

**Testing**: Vitest with `renderToStaticMarkup` from `react-dom/server`, the
idiom `OverviewBands.test.tsx` established — no DOM, no React Testing Library
(constitution, Testing (FE)). `Sheet` is a pure presentational component and the
claims worth pinning are structural: what is a sibling of what.

**Target Platform**: The same single binary serving the same SPA. The delta is
entirely inside `useIsMobile()` branches, plus one meta tag in `index.html`.

**Project Type**: Web application — `backend/` (Go) + `frontend/` (React/TS +
Vite). Only the second is touched.

**Performance Goals**: None. Nothing renders more or fetches more; one component
renders instead of another.

**Constraints**: The desktop must not move, which is asserted rather than
observed ([research.md](research.md) R8). The sheet must express the canvas
inspector's scrim exception now, or 6d reopens the file. Nothing may introduce a
value off [tokens.md](../../design/tokens.md)'s two ladders.

**Scale/Scope**: One new component, one new six-line hook, one new width in an
existing map, two shared components changed by addition, six call sites
converted, one type narrowed, one meta tag, four `design/` documents and one
specimen page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see
below.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | **Not engaged.** No entity, no relationship, no field. The slice is presentation over data that already exists, and adds no free text to anything. |
| **II · Extensibility by Design** | **Pass.** Nothing branches on a vocabulary value, and one such branch is *deleted*: `MobileCapability` is a hard-coded nine-entry table grading sections by name, which is the closest thing in the frontend to logic branching on a domain name. Removing it moves the codebase toward this principle, not away. |
| **III · Full-Stack Monorepo Architecture** | **Pass.** No route, no handler, no migration, no package. `ui/Sheet` lives in `components/ui/` beside its siblings; the hook in `hooks/`, where `useIsMobile` and `useCurrentUser` already are. |
| **IV · Inventory-Driven Rental Workflow** | **Not engaged.** No aggregation, no export, no catalog change. The inventory page's phone filter changes shape and shows the same categories. |
| **V · Pragmatic Simplicity** | **Pass, and it is the principle this phase is mostly about.** Three judgements, each recorded in research: the `Escape` effect becomes a hook at its *third* caller, not its second (R5); the label wrapper reuses `FieldStack` with one added width rather than becoming a second component that renders a micro-label above a control (R4); and `Drawer` branches once rather than six call sites asking the same question (R1). No new dependency, no state library — the sheet's only state is its caller's `open`. |

**Gate result: pass.** No entries in Complexity Tracking.

One thing worth naming under Governance rather than as a violation: **this phase
deletes more shared surface than it adds.** `MobileCapability`, the capability
badge and its two class maps, `MobileNav`'s inline overlay and five `Dialog`
call sites go; one component, one hook and one map entry arrive.

## Project Structure

### Documentation (this feature)

```text
specs/033-phone-sheet/
├── mockup.html                    # approved, revision 1 — the visual source of truth
├── spec.md
├── plan.md                        # this file
├── research.md                    # Phase 0 — R1–R8
├── data-model.md                  # Phase 1 — why there is no model
├── quickstart.md                  # Phase 1 — including the handset pass
├── contracts/
│   └── overlay-components.md      # Phase 1 — Sheet, and the two siblings' deltas
├── checklists/
│   └── requirements.md
└── tasks.md                       # Phase 2 (/speckit-tasks)
```

### Source code — the closed list of files this phase may touch

A diff naming a file outside this list fails review ([research.md](research.md)
R8.2).

```text
frontend/
├── index.html                              # + 2 viewport keys
└── src/
    ├── hooks/
    │   └── useEscapeToClose.ts             # new — 6 lines, 3 callers
    ├── components/
    │   ├── Layout.tsx                      # phone header h-14; body padding derived
    │   ├── ui/
    │   │   ├── Sheet.tsx                   # new — the shell
    │   │   ├── Sheet.test.tsx              # new — structural claims
    │   │   ├── Drawer.tsx                  # + phone branch; desktop return verbatim
    │   │   ├── Dialog.tsx                  # + Escape, + internal scroll
    │   │   └── GearList.tsx                # FieldStack: + width 'full'
    │   └── mobile/
    │       ├── MobileNav.tsx               # h-14; inline sheet → Sheet
    │       ├── SectionSwitcher.tsx         # → Sheet; badge deleted
    │       ├── MobileChannelEditSheet.tsx  # → Sheet; FieldStack; footer
    │       ├── MobileOutputEditSheet.tsx   # → Sheet; FieldStack; footer
    │       └── MobileFixtureEditSheet.tsx  # → Sheet; FieldStack; footer
    ├── types/mobile.ts                     # MobileCapability deleted
    └── pages/Inventories.tsx               # phone category filter → Sheet

design/
├── patterns.md                             # §7d's footer settles
├── tokens.md                               # §7 fixed geometry: the sheet's own values
├── components.md                           # §5: ui/Sheet stops being a gap
├── audit.md                                # M7, M8, M10, M12 → Part 1b
└── design-language.html                    # §8's sheet specimen redrawn

ROADMAP.md                                  # + Slice 33
```

**Structure Decision**: Web application, existing directories only. `Sheet` goes
in `components/ui/` and not `components/mobile/` — `ui/Drawer` imports it, and a
`ui/` component reaching into `mobile/` is the layering inversion
[components.md](../../design/components.md) §5 exists to prevent, and the one A1
corrected when `MICRO_LABEL` left `graph/tokens.ts`.

## Delivery order

Each step is a commit, and each leaves the tree green. The order is chosen so
that **nothing renders differently until step 3**, and so a regression after it
is attributable to one step.

1. **The primitives.** `useEscapeToClose`, `ui/Sheet` and `Sheet.test.tsx`,
   `FieldStack`'s `full` width. Nothing imports any of them yet; the tree is
   green and the interface is byte-identical.
2. **The siblings.** `Dialog` gains `Escape` and internal scroll; `Drawer` gains
   its phone branch with its desktop return moved verbatim. Six drawers acquire
   a phone form here, and this is the step whose diff is read against
   [research.md](research.md) R8.
3. **The three edit sheets.** Container, label voice, footer and delete
   placement together — one file at a time, because they are three surfaces and
   a regression in one should not be hidden by the other two.
4. **The three list sheets.** `SectionSwitcher` (with M7's deletions and the
   type narrowing), the inventory category filter, and `MobileNav`'s inline
   sheet. `components/mobile/` reaches zero `<Dialog` here.
5. **The bottom edge.** `index.html`'s viewport keys, `MobileNav`'s `h-14`,
   `Layout`'s derived padding and phone header height. Last, because it is the
   only step whose effect is invisible in this toolchain — it must not be able
   to mask a regression from steps 3 and 4.
6. **The documents.** `design/` ×5 and `ROADMAP.md`, in one commit, per
   [audit.md](../../design/audit.md) Part 3.

Steps 1 and 2 are independently reviewable and cannot change the phone's
appearance; step 3 is where the phone's forms change; step 5 is the one needing
a handset.

## Phase 0 — Research

Eight questions, in [research.md](research.md). Two are calls no document had
already made — **R3**, which of the three viewport-height units a sheet takes
and why `dvh` is the wrong one, and **R6**, what can actually be done about the
keyboard, which turned up the `viewport-fit` defect. The other six confirm
decisions `design/` had already reasoned to: whether `Drawer` branches (R1),
what withholding the scrim structurally means (R2), where the label wrapper
comes from (R4), whether the `Escape` effect becomes a hook (R5), whether M10 is
in scope (R7), and what proves the desktop did not move (R8).

R7 is the one that changed the spec: FR-072 as first written covered half of
M10, and closing half a finding inside the file holding the other half is the
failure `audit.md` Part 3 names. The spec now carries FR-072–FR-074.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — there is no data model, and the document says
  so explicitly rather than being omitted. What stands in its place is the
  component contract.
- [contracts/overlay-components.md](contracts/overlay-components.md) — `Sheet`'s
  API and rendered structure, `Drawer`'s and `Dialog`'s deltas, the three
  tenancy contracts, and the invariants a reviewer can check by reading a diff.
- [quickstart.md](quickstart.md) — how to see each of the six conversions, plus
  the handset pass that FR-070 and FR-071 cannot get from a gate.

### Constitution re-check, post-design

Unchanged: **pass**. Design added no dependency, no package, no route, no
migration and no state library. Two things are worth restating after design:

**Principle V, on the component boundary.** `Sheet` ends up with six props
because it refuses three jobs' worth of opinions — no `variant`, no `size`, no
`onSave`, no field layout. The three tenants supply their own contents at their
own tier, which is what [patterns.md](../../design/patterns.md) §7d already
required and what makes `Drawer`'s branch a pass-through rather than a
translation.

**Principle II, on what leaves.** Deleting `MobileCapability` removes the one
table in the frontend that grades a domain surface by a hard-coded name. Nothing
replaces it, and the section list is shorter for it.

## Complexity Tracking

No violations. Nothing to record.
