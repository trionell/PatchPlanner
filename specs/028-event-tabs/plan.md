# Implementation Plan: Four tabs, one shape

**Branch**: `wave-4-5-convergence` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

## Summary

Four event tabs converge on the work panel Wave 3 proved on Lighting. Three
become sheets; the fourth stops being a form and becomes the screen that says what
the event amounts to.

Six pieces, in the order that makes each reviewable on its own:

1. **The summary, as a pure function** (`lib/eventSummary.ts`). Every figure and
   every verdict Overview shows, derived by *calling* the functions the owning tabs
   call. Nothing renders; everything is unit-tested, including the claim that its
   verdicts equal the strips'.
2. **The hand-off** (`ui/Tabs`, `EventDetail`). Tab selection moves into `?tab=`,
   `Tabs` gains an optional controlled mode, and Lighting's dangling `onOpenPlot`
   gets wired — a Wave 3 loose end, fixed here because this is where the mechanism
   arrives.
3. **Rental order** — the biggest sheet, so its editor settles the questions the
   other two inherit.
4. **Equipment** — two cards and two forms into one sheet with a `Source` column.
5. **Signal flow** — one panel, two bands, chains in mono.
6. **Overview** — consumes 1 and 2, so it is last.

**No backend, no migration, no endpoint.** The one change to `components/ui/` is
`Tabs`, additive, and it is the wave's only shared-component risk.

### The plan's one substantive decision

**The event summary is a derivation, not a query** — argued in
[research.md](./research.md) R1. The mockup proposed an endpoint and the spec
withdrew it: *2 gaps* is `buildInputChannelFlows` walking the cable graph,
*addressed* is `dmxMap` partitioning identical spans, and a Go copy of either
would let Overview's verdict disagree with the strip on the tab it links to. So
the summary calls those functions, once, in the browser, and SC-008 asserts the
agreement rather than hoping for it.

The cost is four extra queries on Overview, cached under the keys the audio,
lighting and stage-plot tabs already use — so opening Overview *warms* the tab you
are about to open.

## Technical Context

**Language/Version**: TypeScript 5, React 18. No Go in this slice.

**Primary Dependencies**: React 18, TanStack React Query, Tailwind 3.4, Vite 6,
`lucide-react`, `react-router-dom`. **No new dependency.**

**Storage**: none touched. No migration.

**Testing**: Vitest for `eventSummary` — the whole of the difficulty is there and
none of it needs a DOM. `tsc -b`, `eslint`, `vitest` as gates; `go vet`/`go test`
run to prove the untouched backend still builds. The visual and gesture claims are
in [quickstart.md](./quickstart.md), because no unit test can make them.

**Target Platform**: desktop browsers. The phone branches of all four tabs are
untouched.

**Project Type**: web — `frontend/` only this time.

**Performance**: `eventSummary` is O(channels + cables + fixtures) and memoised
per query result. A 32-channel, 64-fixture event is nothing. No sheet is
virtualised, as none of the existing ones is.

**Constraints**: `PatchPanel`, `SheetTable`, `RowEditor`, `Drawer` and `GearList`
are shared with four other surfaces; any change to them is a change to those.
Only `Tabs` may change, and only by addition (FR-088).

**Scale/Scope**: 1 new pure module + its tests, ~8 new components, 4 tabs
rewritten, 1 shared component widened, 1 page rewired.

## Constitution Check

| Principle | How this slice honours it |
|---|---|
| **I · Derived, not stored** | The entire wave adds no field. `EventSummary` is computed from payloads; the rental order's totals move from a table row into a strip *computed the same way*. |
| **II · Vocabularies are data** | `Source`, bus and output-type chips read `lib/vocabularyTint`; nothing maps a name to a hue. |
| **III · One event, one plan** | Untouched — no cross-event surface here. |
| **IV · Explicit over implicit** | `undefined` vs `0` in the summary is the whole of FR-062: *not known yet* and *counted, and zero* are different facts and render differently. |
| **V · Fix, don't abstract** | `ChainCell` is **not** reused on Signal Flow (R8): it renders a different hop model, and converting one model into the other for presentation would be the abstraction. The values are shared; the component is not. |

## Phases

Each phase is one commit, and each leaves the application working.

### Phase 1 · The summary derivation

`lib/eventSummary.ts` + `lib/eventSummary.test.ts`. Nothing imports it yet.

Ends when `vitest` covers every row of quickstart's table, including SC-008.

### Phase 2 · The hand-off

`ui/Tabs` gains `value`/`onValueChange`. `EventDetail` drives desktop tabs from
`?tab=`. `LightingTab` passes `onOpenPlot`.

Ends with Lighting's `Hang in plot` button rendering for the first time, and every
tab reachable by URL. Nothing else changes appearance.

### Phase 3 · Rental order

`RentalTab` rewritten as a panel; new `RentalSheet`, `RentalStatusRail`.

Ends with the manual form and the totals row gone, the editor open under its row,
and the three exports in the bar.

### Phase 4 · Equipment

`EquipmentTab` rewritten; new `EquipmentSheet`, `EquipmentStatusRail`.

Ends with two cards as one sheet and the hand-off working both ways — Phase 3
built the other end.

### Phase 5 · Signal flow

`SignalFlowTab` rewritten; new `SignalFlowStatusRail`, a `ChainLine` local to the
tab, and the band.

Ends with both halves in one panel, chains in mono, and print unchanged.

### Phase 6 · Overview

`OverviewTab` rewritten; new `EventDetailsDrawer`, `NumbersBand`, `RigRibbon`,
`ReadinessRow`. `EventInventoryCard` folded into a row. `MiniStat` deleted.

Ends with the tab carrying no form control.

### Phase 7 · Gates and documentation

Run every gate in quickstart. Update `design/audit.md` (A6 and A7 narrowed again,
A4 on these four surfaces), `ROADMAP.md`, `PROJECT.md`. Republish the mockup if it
has drifted.

## Risks

| Risk | Mitigation |
|---|---|
| `Tabs` is shared with `Inventories` | The change is additive and `Inventories` passes neither prop; asserted by rendering it in pass 8's sweep and by the diff gate. |
| Overview's four extra queries feel slow on a cold load | They are the queries the next tab needs anyway. If it bites, the ribbons and band can be split behind their own suspense without changing the derivation. |
| The rental editor's "manual part" semantics | The riskiest logic in the wave: `quantity_audio` includes the manual part, so the derived figure is a subtraction and an off-by-one is invisible. Covered by pass 2, which walks a real line through add → edit → delete. |
| Deleting a manual part reads as deleting the line | The button says `Delete`, the confirm names what survives, and the row stays visible with its planned quantity. |

## What this plan does **not** do

- No endpoint, no migration, no schema change.
- No sorting, filtering or grouping beyond the strips' problem filter.
- No bulk operation on any of the four tabs.
- No change to what a hand-off carries beyond the tab itself (R3): the destination
  opens, but the row is not selected there. Recorded as a known gap.
- Nothing on the phone.
