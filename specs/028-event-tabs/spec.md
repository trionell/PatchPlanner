# Feature Specification: Four tabs, one shape

**Feature Branch**: `wave-4-5-convergence`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Let's go to wave 4-5 and work on that on a new
branch. Start with making mockups of each page/tab that will be edited" — the
four calls in [mockup.html](mockup.html) §07 answered, three approved as drawn
and the fourth revised:

> "Wave 4 decision 4: Change it so that editing the overview happens in a drawer
> and the overview tab just shows the information. It would be nice with some fun
> statistic presented in a fun way alongside the existing information."

## Context

This is **Wave 4** of the convergence recorded in
[design/audit.md](../../design/audit.md). It closes findings **A6** and **A7** on
the four event tabs they still name — `RentalTab`, `EquipmentTab`,
`SignalFlowTab`, `OverviewTab` — and takes A4 on those surfaces with them.

Wave 3 built the template and proved it on the hardest surface in the
application. These four are the same conversion, and the audit is right that
they are much smaller: **none of them has a derivation to build**. Everything
they need to show is already computed somewhere in the browser today; it is
computed in the wrong place, rendered at the wrong density, or not rendered at
all.

Between them the four tabs render **five `Card` headers**, four navigation-tier
`ui/Table`s at `px-3 py-3`, and **two permanently-expanded add-forms** sitting
above the data they add to, with a visible *Edit* and a visible trash icon on
every editable row.

### The three sheets

Rental Order, Equipment and Signal Flow become the work panel:
`PatchPanel` → `SheetTable` → `RowEditor` → status strip. Each conversion has
exactly one idea in it that is not mechanical:

| Tab | The idea |
|---|---|
| **Rental order** | Almost every number on it is **derived** from the patch and the rig. The only thing a person types is a manual line. Today that asymmetry is invisible; the editor is where it gets said. |
| **Equipment** | Owned gear and rented extras are two cards because they come from two endpoints — a reason the planner does not have. One sheet, with a `Source` column. |
| **Signal flow** | Every value is derived, so it is **the one sheet with no row editor**. What it has instead is somewhere to go. |

### The fourth tab is not a sheet

Overview is four text inputs and a notes box, and it is the tab you land on. You
arrive at your own event and are shown a form for the three facts you are least
likely to have forgotten.

Meanwhile it is the only screen positioned to answer *how is this show doing*,
and it answers none of it. Eight tabs each hold one shard of the answer and no
screen holds the answer.

So editing moves into a drawer and **the tab becomes the event, stated**: a band
of five large numbers, the rig drawn as the flow canvas one row high, and the
readiness verdict from every work panel collected onto one screen.

### One correction to the mockup

The mockup promised a new endpoint, `GET /events/{id}/summary`, to feed
Overview's numbers. **That was wrong, and this spec does not build it.**

The reasoning is Slice 27's R3 again, and it points the other way this time.
Overview's numbers are not counts a database can produce: *2 gaps* is
`buildInputChannelFlows` walking the cable graph, *addressed* is `dmxMap`
partitioning identical spans, *128 cables picked* is the patch capacity
derivation. Computing them in Go would put four derivations in two languages and
let the Overview's verdict disagree with the strip on the tab it links to — which
is precisely the failure `design/principles.md` P6 exists to prevent.

So the summary is a **pure function over payloads the app already fetches**
(`lib/eventSummary.ts`), the three queries it reads are the ones the audio,
lighting and rental tabs already cache under the same keys, and opening Overview
warms the cache for the tabs you are about to open rather than duplicating them.

**Wave 4 is frontend-only.** No endpoint, no migration, no schema change.

### One thing Wave 3 shipped that does not work

`RowEditor`'s `handoff` slot was built in Wave 3 so Lighting could send you to the
stage plot with the fixture selected. `LightingSheet` accepts `onOpenPlot` and
renders the button when it is passed — and `LightingTab` never passes it, because
**there is no way for a tab to switch tabs**. `EventDetail`'s desktop `Tabs` is
uncontrolled (`defaultValue="overview"`), so the selected tab is state no child
can reach.

Wave 4 needs that hand-off three times, so it makes the tab selection addressable.

## User Scenarios

### US1 — The rental order is read, not filled in (Priority: P1)

A production manager checking an order before it goes to the renter opens the tab
and sees every line at once: what is on it, how many, whether the renter has them,
what it costs. Nothing on the screen is a control until they click a row, and the
only row they *can* meaningfully change is one they added by hand.

**Why this priority**: it is the tab with the most rows in a real event (50–300)
and the one whose output leaves the building.

**Acceptance**:
1. With 40 lines and no interaction, the sheet shows every line's item, quantities,
   stock position, price and subtotal, with no `input` or `select` on screen.
2. A line whose planned quantity exceeds the renter's stock is legible as such
   without reading the row.
3. Clicking a line opens an editor stating which part of its quantity came from the
   plan and offering only the manual part.
4. The order's totals are visible without scrolling to the bottom of 300 rows.

### US2 — Equipment is one list (Priority: P1)

A technician planning what is coming to the gig sees one list of lines with a
column saying where each comes from — their own case, or the rental order — and
adds to either through one editor.

**Acceptance**:
1. Owned gear and rented extras appear in one sheet under one set of column heads.
2. Each line states its source, and an owned line over its owned quantity is
   legible as such.
3. Adding a line asks its source first, and the item picker follows that choice.
4. A rented line offers a way to see itself on the rental order, and the matching
   rental line offers the reverse.

### US3 — The signal chain reads hop by hop (Priority: P2)

A technician chasing a dead line at load-in reads the chain from source to console,
on screen or on paper, with the hops lining up between rows.

**Acceptance**:
1. Input and output flows appear in one panel on one scroll, each under its own
   labelled band.
2. Chains are set in a fixed-pitch face, so the same hop in two rows occupies the
   same width.
3. The count of channels with gaps closes the panel rather than floating above it.
4. Clicking a row opens that channel on the tab where it can be changed.
5. Printing the tab still produces both halves.

### US4 — Overview states the event (Priority: P1)

Someone opening an event they have not touched for a fortnight sees what it is,
when it is, what shape it is, and where the plan stands — without opening a tab.

**Acceptance**:
1. The tab contains no form control.
2. It shows, at a glance: days to load-in, channels in and out, fixtures, cables
   picked, rental total.
3. It shows a per-area verdict — audio, lighting, rental, equipment — matching what
   each tab's own status strip says.
4. Each verdict and each number leads to the tab that derives it.
5. Editing name, venue, date and notes happens in a drawer, and a viewer has no way
   to open it.

### US5 — The summary is one derivation (Priority: P1)

**Acceptance**:
1. Every number Overview shows is produced by a pure function over the API payloads,
   with no DOM and no network of its own.
2. The gap count equals the number Signal Flow's own strip shows for the same event.
3. The addressing verdict equals the one Lighting's strip shows.
4. The rental figures equal the ones the Rental panel's strip shows.

### US6 — Nothing else moves (Priority: P3)

**Acceptance**:
1. The audio tabs, Stage Plots, Lighting and every `event/graph/` component render
   identically.
2. `components/ui/` changes in exactly one place — `Tabs` — and only by addition.
3. The phone view of all four tabs is unchanged.
4. The signal-flow print sheet is unchanged.

---

## Requirements

### The rental panel (US1)

- **FR-001**: The Rental Order tab MUST render as one `PatchPanel`, replacing the
  `Card`/`CardHeader`/`CardContent` stack.
- **FR-002**: The bar MUST read, left to right: title `Rental order`, search,
  the exports, `flex-1`, `+ Manual line`.
- **FR-003**: Exports MUST be `Button size="xs" variant="outline"`: `Export .xlsx`,
  `Export PDF`, and `Export LL.xlsx` only when the event's inventory has
  `sourceFormat === 'll'`.
- **FR-004**: There MUST be no Print button — this tab has no print sheet, and the
  PDF export is its paper.
- **FR-005**: The sheet MUST have nine columns: `Item`, `Description`, `Audio`,
  `Light`, `Qty`, `Stock`, `Price`, `Subtotal`, `Note`.
- **FR-006**: No closed row may contain a form control or a button.
- **FR-007**: Search MUST filter on item name and description, case-insensitively.
- **FR-008**: A quantity cell whose value includes a manual part MUST carry a badge
  reading `+N`, styled as the shared-address badge from Slice 27
  (`font-mono text-[10px] text-zinc-400 bg-zinc-800 rounded-sm px-1`), with a
  `title` naming both parts.
- **FR-009**: The `Stock` cell MUST show the available quantity, and MUST render
  `text-red-400` with an explanatory `title` when the line's total exceeds it.
- **FR-010**: An over-stock line MUST NOT tint its whole row.
- **FR-011**: A discontinued line MUST carry a `Pill` reading `discontinued` beside
  its name.
- **FR-012**: Empty values MUST render `—` in `text-zinc-600`.
- **FR-013**: The totals row MUST be removed from the table body.

### The rental editor (US1)

- **FR-014**: Clicking a row MUST open a `RowEditor` beneath it, spanning every
  column; one row edits at a time.
- **FR-015**: The editor MUST show, as a read-only field labelled `From the plan`,
  the derived audio and lighting quantities — total minus manual.
- **FR-016**: The editor's editable fields MUST be `Manual audio`, `Manual light`
  and `Note`.
- **FR-017**: The editor MUST offer a hand-off to the Equipment tab
  (`handoff={{ label: 'Equipment', text: 'See on Equipment', … }}`).
- **FR-018**: `Delete` MUST be offered only on a line that has a manual part, and
  MUST remove the manual part rather than the line.
- **FR-019**: `+ Manual line` MUST open an add editor at the foot of the sheet with
  an item picker over the event's inventory, both quantities and a note.
- **FR-020**: A read-only role MUST get no `+ Manual line`, and rows MUST NOT open.

### The rental strip (US1)

- **FR-021**: The panel MUST close with a status strip built like
  `LightingStatusRail` — top border only, ground *and* rule tinted.
- **FR-022**: The strip MUST have three states: `over stock` (red), `discontinued`
  present but no over-stock (amber), and clean (`in stock`, emerald).
- **FR-023**: In every state the strip MUST state: line count, total pieces, total
  ex VAT, manual line count, and discontinued count.
- **FR-024**: In the two problem states it MUST name the first problem and offer a
  filter control reading `Show only problems` / `Show all`.
- **FR-025**: The export report's unplaced lines MUST render as an inline amber
  block above the sheet, listing every dropped line and its reason.
- **FR-026**: An export failure MUST render as an inline red block above the sheet.

### The equipment panel (US2)

- **FR-027**: The Equipment tab MUST render as one `PatchPanel`, replacing two
  `Card`s.
- **FR-028**: The bar MUST read: title `Equipment`, search, `flex-1`, `+ Line`.
- **FR-029**: The sheet MUST have six columns: `Item`, `Source`, `Type`, `Qty`,
  `Have`, `Note`.
- **FR-030**: `Source` MUST be a `Pill` reading `owned` or `rented`.
- **FR-031**: Rows MUST be sorted owned first, then rented, then by item name.
- **FR-032**: For an owned line, `Qty` is the planned quantity and `Have` is the
  quantity owned; `Have` MUST render `text-red-400` when the plan exceeds it.
- **FR-033**: For a rented line, `Qty` is the sum of the manual audio and lighting
  quantities, carrying a badge reading `2a`, `1l` or `8a·4l`, and `Have` is `—`.
- **FR-034**: The editor's **first** field MUST be `Source`, and changing it MUST
  swap the item picker between the owned catalog and the event inventory.
- **FR-035**: On an existing row `Source` MUST render read-only: moving a line
  between the two would be a delete on one endpoint and a create on another, which
  is a different operation than editing.
- **FR-036**: An owned line's editor MUST offer `Qty`; a rented line's MUST offer
  `Audio` and `Light`.
- **FR-037**: A rented line's editor MUST offer a hand-off to the Rental Order tab.
- **FR-038**: The strip MUST state line count, owned count, rented count, and — in
  the error state — the first over-owned line, with a filter control.
- **FR-039**: When the owned-gear catalog is empty the sheet MUST say so
  actionably: *"Your owned-gear catalog is empty — add items on the Inventory page
  first."*
- **FR-040**: A read-only role MUST get no `+ Line`, and rows MUST NOT open.

### The signal flow panel (US3)

- **FR-041**: The Signal Flow tab MUST render as one `PatchPanel` inside its
  existing `PrintSheet`, replacing two `Card`s.
- **FR-042**: The bar MUST read: title `Signal flow`, search, `flex-1`, `Print`.
- **FR-043**: There MUST be no view toggle. Both halves stay on one scroll because
  the tab prints, and a toggle would print half the document.
- **FR-044**: The two halves MUST be separated by a labelled band — a full-width
  row on the inset ground carrying a `MicroLabel`, a count, and a hint.
- **FR-045**: The input table MUST have columns `Ch`, `Name`, `Buses`,
  `Signal chain`; the output table `Out`, `Name`, `Signal chain`.
- **FR-046**: Bus and DCA chips MUST be `Pill`, not `Badge`, reading their tint from
  `lib/vocabularyTint` and the bus's own colour exactly as today.
- **FR-047**: A chain MUST be set `font-mono text-[11px] text-zinc-300` with
  `tabular-nums`.
- **FR-048**: The arrow between hops MUST be `text-zinc-600` — quieter than the hops
  it separates.
- **FR-049**: A missing link MUST render `text-amber-400` **with** an
  `AlertTriangle`, never colour alone.
- **FR-050**: A hop through the console's own socket MUST render `text-amber-300`,
  the one hop that is not a billable cable.
- **FR-051**: Search MUST filter both halves on channel name, channel number and
  any hop label, and MUST show each band's filtered count.
- **FR-052**: Clicking an input row MUST open the Audio Inputs tab with that channel
  selected; an output row, the Audio Outputs tab.
- **FR-053**: The panel MUST close with a status strip stating gaps, input count,
  output count and hop count, naming the first gap, with a filter control.
- **FR-054**: The gap sentence currently rendered above the first table MUST be
  removed.
- **FR-055**: The tab MUST remain viewable and printable by every role.

### Overview (US4)

- **FR-056**: The Overview tab MUST contain no form control.
- **FR-057**: It MUST render as **one** card: heading, notes, numbers band, ribbons,
  readiness, inventory, footer — divided by rules, never by gaps.
- **FR-058**: The heading MUST show the event name, and beneath it venue and date
  written out (`Slottsparken, Malmö · Saturday 14 August 2026`).
- **FR-059**: Notes MUST render as a quoted block, and MUST be absent entirely when
  there are none.
- **FR-060**: The numbers band MUST show five figures in `font-mono tabular-nums` at
  `text-[26px]` on the inset ground: days to load-in, channels in / out, fixtures,
  cables picked, rental total ex VAT.
- **FR-061**: Each figure MUST carry a `MicroLabel` beneath it and MUST link to the
  tab that derives it.
- **FR-062**: A figure with no data yet MUST render `—`, never `0` — an event with
  no patch has not got zero channels, it has no patch.
- **FR-063**: The days figure MUST read `—` when the event has no date, and MUST say
  `today`, `tomorrow` or a past-tense form rather than a negative number.
- **FR-064**: The audio ribbon MUST draw the patch as a row of nodes — sources,
  stageboxes, console, output devices, speakers — using the canvas's own node
  treatment, with the console at `border-amber-500/55`.
- **FR-065**: The lighting ribbon MUST draw fixtures, universes and trusses, with a
  `Meter` of DMX occupancy across all universes in use.
- **FR-066**: A ribbon node with a count of zero MUST be omitted, not drawn as `0`.
- **FR-067**: The readiness row MUST show one `Pill` per area — audio, lighting,
  rental, equipment, plots — each carrying the same words and tint the owning tab's
  own strip uses, and each linking to that tab.
- **FR-068**: The inventory row MUST state the bound inventory, its source file and
  its item count, with `Manage` for an owner and `Browse` otherwise — the behaviour
  `EventInventoryCard` has today.
- **FR-069**: The footer MUST state when the event was created, how many people have
  access, and the reader's own role.
- **FR-070**: `MiniStat` and its `rounded-lg` MUST be deleted.

### The event details drawer (US4)

- **FR-071**: `Edit details` MUST open a `ui/Drawer` titled *Event details*.
- **FR-072**: The drawer MUST hold Name, Venue, Date and Notes at navigation-tier
  sizing (`size="md"`), with `Save` and `Cancel`.
- **FR-073**: Saving MUST close the drawer; cancelling MUST discard the draft.
- **FR-074**: Save MUST be refused while the name is empty.
- **FR-075**: A read-only role MUST get no `Edit details` button — the caller passes
  no handler — and the rest of the tab MUST be identical for them.
- **FR-076**: The drawer's footer MUST state that renaming an event never changes
  its patch, its rig or its rental order.

### The summary derivation (US5)

- **FR-077**: `lib/eventSummary.ts` MUST export a pure function taking the audio
  patch, the lighting rig, the rental summary, the owned-equipment lines, the stage
  plots and the event, and returning one summary object.
- **FR-078**: It MUST NOT import React, fetch anything, or read the DOM.
- **FR-079**: Gaps MUST be counted by calling `buildInputChannelFlows` and
  `buildOutputChannelFlows` — the same functions Signal Flow calls.
- **FR-080**: The addressing verdict MUST come from `dmxMap` and `dmxStatusState` —
  the same functions Lighting calls.
- **FR-081**: Missing inputs MUST produce `undefined` figures rather than zeroes, so
  a query still in flight is distinguishable from an empty plan (FR-062).
- **FR-082**: Every branch of the function MUST be unit-tested without rendering.

### Tab selection becomes addressable (US3, US2, US1)

- **FR-083**: `ui/Tabs` MUST accept optional `value` and `onValueChange`, becoming
  controlled when both are given and keeping its current uncontrolled behaviour
  otherwise.
- **FR-084**: `EventDetail` MUST drive the desktop tabs from a `?tab=` search
  param, defaulting to `overview` for an absent or unknown value.
- **FR-085**: A hand-off MUST set that param, so the destination is reachable by
  link, by history and by a browser back button.
- **FR-086**: The existing mobile `?section=` param MUST keep working unchanged.
- **FR-087**: `LightingTab` MUST wire the `onOpenPlot` hand-off Wave 3 left
  dangling, so Lighting's editor gains its `Hang in plot` button.

### Boundaries (US6)

- **FR-088**: `components/ui/` MUST change in exactly one file, `Tabs.tsx`, and
  only by addition — asserted by a diff, not by inspection.
- **FR-089**: `components/event/graph/`, the audio tabs, `StagePlotTab` and
  `LightingSheet` MUST be otherwise untouched.
- **FR-090**: The `isMobile` branch of all four tabs MUST render as it does today.
- **FR-091**: `components/print/` MUST be unchanged.
- **FR-092**: No backend file, migration or API route may change.

---

## Assumptions

- **A rented extra and a manual rental line are the same record.** They are: both
  are rows of `event_manual_rentals`, reached from two tabs. Wave 4 makes that
  visible rather than changing it.
- **`quantity_audio` includes the manual part.** Confirmed against
  `EventRental`: the derived total is `quantity_audio - manual_quantity_audio`.
- **Cable length is not modelled.** "412 m of cable" would mean parsing `XLR 10 m`
  out of an item's name, which is exactly the derived-from-a-name violation P6
  names. The band states **cables picked**, which is a real count.
- **An event's member count is available.** `EventMembersDialog` already lists them;
  Overview reads the same query.
- **Nine tabs, no reordering.** Overview keeps its position and its name.

## Out of Scope

- **Sorting a sheet by a column**, on any of the three. None of them is sortable
  today.
- **Filtering the rental order by department.** The strip's problem filter is the
  only filter.
- **Grouping the equipment sheet by type.**
- **Bulk operations of any kind.** No wave-4 tab gains one.
- **Editing a derived rental quantity.** It comes from the plan; the plan is where
  it changes.
- **Moving an equipment line between owned and rented** (FR-035).
- **A rental print sheet.** The PDF export is the paper.
- **Anything on the phone.** Mobile keeps its `CondensedListRow` branches.

## Success Criteria

- **SC-001**: The four tabs render **one** bordered frame between them, from five —
  three `PatchPanel`s and Overview's single `Card`, where there were five stacked
  `Card` → `CardHeader` → `CardContent` blocks.
- **SC-002**: Zero permanently-open add forms, from two.
- **SC-003**: Zero form controls in any closed sheet row, from ten visible with five
  lines of data on Equipment.
- **SC-004**: A rental order of 40 lines shows at least 28 on a 900 px viewport,
  from 7.
- **SC-005**: Signal-flow chains are fixed-pitch, so hop *n* of two rows starts at
  the same x.
- **SC-006**: Overview shows at least 20 facts about the event, from 7.
- **SC-007**: Overview contains no `input`, `select` or `textarea`.
- **SC-008**: Every figure and verdict on Overview equals the number the owning
  tab's own strip states for the same event — asserted by unit tests over one
  fixture set.
- **SC-009**: `git diff --stat -- frontend/src/components/ui` touches one file.
- **SC-010**: `git diff --stat -- frontend/src/components/print backend` is empty.
- **SC-011**: `tsc -b`, `eslint`, `vitest`, `go vet`, `go test` all pass.
- **SC-012**: `grep -c rounded-lg` on the four tabs returns zero, from four.
