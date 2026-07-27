# Feature Specification: Lighting becomes a sheet

**Feature Branch**: `main` — Waves 0–2 of the design convergence were committed
directly to `main` and this wave continues on it. No feature branch was cut.

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Let's handle wave 3. Use the speckit flow with
commits between each step. Before writing the spec, create a mockup of the
redesign for me to approve" — the four calls in [mockup.html](mockup.html) §08
approved, then two rounds of correction:

1. Overlapping addresses are an error *except* where fixtures deliberately share
   one, as dimmers and environment lighting do; occupancy must handle gaps,
   sharing and out-of-bounds addresses simultaneously; the DMX chain column is
   deleted outright, stored column included.
2. "Auto-assign needs to respect the sharing of addresses. Fixtures that share
   before should still share after. And fixtures that does not share before
   should not share after. While we're at it, the auto-assign could have a
   sibling: *optimize channels*. It should compact and remove gaps. Each universe
   should be isolated. While auto-assigning or optimizing channels, a fixture
   should not be able to jump between universes (since universes often correlate
   with physical separation, like different trusses)."

## Context

This is **Wave 3** of the convergence recorded in [design/audit.md](../../design/audit.md),
and it closes findings **A6**, **A7** and **A8** on the Lighting tab. The audit
singles it out:

> The big one, and the one worth doing properly … Worth its own spec. It is a
> workflow change, not a restyle, and it is where a technician will feel the
> design language most.

The Lighting tab is the last surface in the application that is a **form
pretending to be a list**. Thirteen columns, twenty-four live `Input` and
`Select` controls on screen at once, and no read state at all: every value sits
inside a bordered control, so the eye parses chrome before it reaches data. Rows
are navigation-tier (`px-3 py-3`, `text-sm`, zebra-striped) at roughly 90 px
each, so a screen holds about seven fixtures of a rig that routinely has forty to
two hundred.

Two consequences follow from that, and only the first is cosmetic.

**A rig cannot be scanned.** The one question a lighting sheet exists to answer —
*where does each fixture sit in the DMX map?* — requires reading three numbers
per row out of three separate input boxes, none of which line up with the row
above.

**Nothing knows what the DMX map looks like.** Auto-assign packs each universe
from address 1 in rig order, so its own output is always clean. But a single
hand-edited address afterwards puts two moving heads on the same channels, and
the application says nothing — not in the sheet, not on save, not on print. The
first thing that notices is a technician standing in the room with two fixtures
answering to one fader. Duplicate console IDs are already flagged; overlapping
DMX addresses, which are strictly worse, are not.

### Sharing an address is not a clash

Two fixtures on the same channels is usually a mistake and sometimes the entire
point. Twenty identical LED pars washing a room are patched to one address so one
fader drives all twenty; several loads on one dimmer channel are the same
arrangement. A tool that called that an error would be wrong about the most
ordinary thing in architectural and environment lighting.

So the rig's DMX map has **four** conditions to tell apart, and a single universe
can be in all four at once:

| Condition | What it is | How it reads |
|---|---|---|
| **Shared** | Two or more fixtures with *identical* spans — same universe, same start, same channel count | Legitimate. Counted, never warned about. |
| **Clash** | Spans that intersect without being identical | An error. |
| **Out of bounds** | A span running past channel 512 | An error. |
| **Unaddressed** | No start address at all | Not yet done, not wrong. |

Everything else about a universe's occupancy follows from getting those four
right: how many channels are actually taken, where the **gaps** between them are,
and whether the next batch of fixtures will fit in one of those gaps.

### The map is also something you can act on

Recognising a shared group is only half of it. The rig's one existing bulk
operation, **auto-assign DMX**, packs each universe sequentially — which takes
twenty pars patched to one address and spreads them across twenty consecutive
blocks, silently undoing the thing the planner set up. Blessing sharing in the
sheet while destroying it on the button beside it would be a trap of our own
making.

So both bulk operations work on **groups, not fixtures**, and the rule cuts both
ways: *fixtures that shared before still share after, and fixtures that did not
share before must not share after.*

There are two operations, and the difference between them is whose ordering wins:

| | Orders by | Uses | Unaddressed fixtures |
|---|---|---|---|
| **Auto-assign DMX** | the rig's own order | "renumber the whole thing from scratch" | get an address |
| **Optimise channels** | each group's current address | "keep my order, just close the gaps" | left alone |

Both are **isolated per universe**. A universe is not an arbitrary bucket — it
usually corresponds to a physical run of cable to a particular truss or a
particular corner of a room — so no operation may move a fixture from one to
another, and a universe that cannot fit is left exactly as it was rather than
taking the rest of the rig down with it.

The target shape is the one three tabs already use: a work panel with a bar, a
sheet that is read until a row is clicked, a row editor beneath the open row, and
a strip that closes the panel from inside and states whether the plan holds. See
[design/patterns.md](../../design/patterns.md) §1 and §2. The full drawing, with
the current tab reproduced beside it at real sizes, is in
[mockup.html](mockup.html); its §06 ledger accounts for each of the thirteen
columns individually.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the rig (Priority: P1)

A lighting planner opens the Lighting tab on an event with forty fixtures. They
see a dense sheet — one line per fixture, its console ID, name, model, mode,
universe, address span, channel count, truss and power — with nothing to parse
but the values. They read down the address column, which is in tabular figures
and zero-padded, and follow the DMX map without touching anything. They spot a
fixture whose mode is wrong, click its row, and an editor opens directly beneath
it holding every field the fixture has. They fix the mode, press `⌘↵`, and the
editor moves to the next row.

**Why this priority**: This is the whole of finding A8, and it is what makes
every other story worth having. A strip that reports an address clash is of
limited use above a table where the clash cannot be seen.

**Independent Test**: Open the Lighting tab on an event with fixtures, read every
value a row carries without clicking anything, then open one row and change every
field. Delivers the entire redesign on its own; the remaining stories add
capability to a surface that already works.

**Acceptance Scenarios**:

1. **Given** an event with fixtures, **When** the planner opens the Lighting tab,
   **Then** the fixtures render as one panel — bar, sheet, strip — and no closed
   row contains a text box, a select or a delete button.
2. **Given** the sheet, **When** the planner reads a row, **Then** it shows the
   console ID, the fixture's name with its catalog model beside it, the mode, the
   universe, the address span, the channel count, the truss with its offset, the
   power connection with its connector, and the note — nine columns.
3. **Given** the sheet, **When** the planner clicks any row, **Then** an editor
   opens in a row directly beneath it spanning every column, the row above takes
   the open tint and loses its bottom border, and the two read as one block.
4. **Given** an open editor, **When** the planner clicks a different row,
   **Then** the first row's changes are saved and the second row's editor opens —
   one row edits at a time.
5. **Given** an open editor, **When** the planner presses `Esc`, **Then** the
   changes are discarded; **When** they press `⌘↵`/`Ctrl↵`, **Then** the changes
   are saved and the next row's editor opens.
6. **Given** an open editor on a fixture whose catalog model defines DMX modes,
   **When** the planner picks a mode, **Then** the mode name and its channel
   count are both copied onto the fixture, and a later edit to the catalog mode
   never rewrites the fixture.
7. **Given** an open editor on a fixture hung on a truss, **When** the planner
   reads the Truss field, **Then** it shows the truss and offset as text with a
   hand-off control to the Stage Plots tab — the truss is not editable here,
   because it is decided by placing the fixture on a truss in the plot.
8. **Given** the panel's bar, **When** the planner types into the search box,
   **Then** the sheet shows only fixtures matching on console ID, name, model,
   mode, truss or note.
9. **Given** a contributor with a read-only role, **When** they open the tab,
   **Then** rows do not open, and the add, delete and bulk-operation controls are
   absent rather than disabled.
10. **Given** any fixture, **When** the planner reads the sheet, **Then** there
    is no DMX chain column — it is gone from the interface, the API and the
    database (see Assumptions).

---

### User Story 2 - Tell a shared address from a clash (Priority: P2)

The planner has twenty identical pars washing the back wall, all patched to
universe 3 address 1. The sheet marks them as sharing — quietly, in the address
cell, with the size of the group — and the strip counts them as information, not
as a problem. Elsewhere they have hand-edited an address after an auto-assign and
put a 15-channel head half over another one. *That* is red in the cell, red in
the strip, named in full, and filterable. A third fixture starts at 505 with 16
channels and runs off the end of the universe; it is red for that reason and says
so. Two more have no address at all, which is neither of those things.

**Why this priority**: The four conditions are what make the tab worth
rebuilding, and getting them apart is the whole difficulty. A tool that calls a
deliberate environment-lighting group an error is worse than one that says
nothing, because it trains the planner to ignore the strip.

**Independent Test**: Build one universe holding all four conditions at once —
a shared group, a partial overlap, a span past 512, and unaddressed fixtures —
and confirm each is reported as itself, with the others unaffected.

**Acceptance Scenarios**:

1. **Given** two or more fixtures with identical spans — same universe, same
   start address, same channel count — **When** the sheet renders, **Then** they
   are marked as sharing, with the size of the group, and no error is reported
   for them anywhere.
2. **Given** two fixtures in one universe whose spans intersect without being
   identical, **When** the sheet renders, **Then** both address cells are marked
   as an error and the strip names both fixtures and their spans.
3. **Given** a fixture whose span runs past channel 512, **When** the sheet
   renders, **Then** it is marked as an error distinct in wording from an
   overlap, stating that it runs off the end of the universe.
4. **Given** a fixture with no start address, **When** the sheet renders,
   **Then** it counts as unaddressed, takes no part in overlap or sharing
   detection, and its address cell reads as an empty value rather than blank.
5. **Given** one universe holding a shared group, a partial overlap, an
   out-of-bounds span and unaddressed fixtures **at the same time**, **When**
   the strip and the drawer render, **Then** all four are reported correctly and
   independently — none masks another.
6. **Given** three fixtures where two share a span and the third partly overlaps
   both, **When** the sheet renders, **Then** the two are still shown as sharing
   *and* all three are reported in the clash — sharing and clashing are not
   mutually exclusive for a given fixture.
7. **Given** a rig with both errors and unaddressed fixtures, **When** the strip
   renders, **Then** it shows the error state — the states are ordered by how
   much attention they need: errors, then unaddressed, then clean.
8. **Given** any state, **When** the strip renders, **Then** it states the
   fixture count, each universe's occupancy out of 512, the number of shared
   groups, and the number of duplicate console IDs where any exist.
9. **Given** the strip is reporting errors or unaddressed fixtures, **When** the
   planner uses its filter control, **Then** the sheet shows only those rows, and
   the control offers the way back to all rows.
10. **Given** any error, duplicate console ID or unaddressed fixture, **When**
    the planner saves any row, **Then** the save succeeds — a rig legitimately
    passes through a broken state while it is being renumbered, so all of these
    are reported and none is blocked.
11. **Given** a fixture with a channel count of zero, or a universe below 1,
    **When** the map is derived, **Then** nothing crashes and no false error is
    reported.

---

### User Story 3 - Add one fixture or twelve with the same form (Priority: P2)

The planner needs twelve more wash lights. They press **+ Fixtures**. An editor
opens at the foot of the sheet — the same construction the row editor uses —
with a quantity field showing 1. They set it to 12, pick the model, give a name
stem, set the mode, universe and power, and the button reads *Add 12 fixtures*.
The editor tells them the batch needs 192 channels and that universe 2's largest
free run is 240, so it will fit. Next time they need a single haze machine, they
use the same form and leave the quantity at 1.

**Why this priority**: Adding is how a rig comes into existence, and it is
currently two separate dialogs holding two copies of the same model picker, mode
picker and channel count. That duplication has already caused drift: the
single-add dialog silently lacks the universe and power fields the bulk one has,
so every hand-added fixture starts on universe 1 with a Schuko whether that is
right or not.

**Independent Test**: Add one fixture and twelve fixtures through the same form;
confirm both land in the rig with the fields the form offered, and that no dialog
is involved in either case.

**Acceptance Scenarios**:

1. **Given** the panel's bar, **When** the planner presses the add control,
   **Then** an editor opens at the foot of the sheet in the same construction as
   the row editor, with quantity defaulting to 1.
2. **Given** the add editor, **When** the planner sets a quantity above 1,
   **Then** the confirm control states how many fixtures it will add.
3. **Given** the add editor with a name stem and a quantity above 1, **When** the
   planner confirms, **Then** that many fixtures are created, named from the stem
   and numbered from 1, with consecutive console IDs from the given start.
4. **Given** the add editor, **When** the planner picks a catalog model that
   defines modes, **Then** the mode picker offers them and picking one sets the
   channel count, exactly as in the row editor.
5. **Given** the add editor with no model picked, **When** the planner confirms,
   **Then** a custom fixture is created from the name alone — a fixture need not
   come from the catalog.
6. **Given** the add editor, **When** the planner cancels or presses `Esc`,
   **Then** nothing is created and the editor closes.
7. **Given** the add editor with a quantity, channel count and universe set,
   **When** the planner reads it, **Then** it states the batch's channel demand
   against that universe's **largest free run**, not merely its total free
   channels — 496 free in gaps of four does not fit a 16-channel fixture.

---

### User Story 4 - Renumber a rig without destroying what was built (Priority: P2)

The planner has twenty pars sharing one address in universe 3, a truss on
universe 1 they numbered by hand, and universe 2 half-empty with gaps left by
fixtures they deleted. They run **Auto-assign DMX**: every universe is repacked
from address 1 in rig order, and the twenty pars come back still sharing one
address — as one block of seven channels, not twenty. Nothing has moved between
universes.

Later they want to keep the order they chose but reclaim the gaps, so they run
**Optimise channels** instead. Each universe's fixtures keep their relative
order and slide down to close every gap; a fixture that was running off the end
of universe 2 is pulled back inside it. The shared group is still shared, and
two fixtures that were separate are still separate.

Universe 1 turns out to need more than 512 channels. It is left exactly as it
was and named; universes 2 and 3 are done anyway.

**Why this priority**: Without this, the previous story is a trap. Recognising a
shared group in the sheet and then dissolving it on the button beside it is worse
than never recognising it, because the planner has been given a reason to trust
something that is about to be undone. The gap-reclaiming sibling is the operation
a planner actually reaches for mid-build, when the rig's order is already right.

**Independent Test**: Build a rig with a shared group, hand-set addresses, gaps
and two universes; run each operation in turn and confirm sharing, separation and
universe membership all survive, and that the gaps close only under the second.

**Acceptance Scenarios**:

1. **Given** a rig containing a shared group, **When** the planner runs
   auto-assign, **Then** every member of that group still holds the same address
   as every other member.
2. **Given** a rig containing fixtures that do not share, **When** the planner
   runs either operation, **Then** none of them ends up sharing an address.
3. **Given** a shared group of twenty fixtures of seven channels each, **When**
   either operation runs, **Then** the group consumes **seven** channels of the
   universe, not one hundred and forty.
4. **Given** fixtures spread across several universes, **When** either operation
   runs, **Then** every fixture is still in the universe it started in.
5. **Given** a universe whose fixtures need more than 512 channels, **When**
   either operation runs, **Then** that universe is left completely unchanged and
   named to the planner, and every other universe is still processed.
6. **Given** a rig with gaps between addressed fixtures, **When** the planner
   runs optimise, **Then** each universe's fixtures keep their relative order and
   the gaps are closed from address 1.
7. **Given** a rig with unaddressed fixtures, **When** the planner runs
   auto-assign, **Then** those fixtures are given addresses; **When** they run
   optimise instead, **Then** those fixtures are left unaddressed.
8. **Given** a fixture whose span ran past 512, **When** either operation runs
   and the universe fits, **Then** the fixture is brought back inside the
   universe.
9. **Given** a rig with clashing fixtures, **When** either operation runs,
   **Then** the clashes are resolved, because every group receives a block of its
   own.
10. **Given** either operation, **When** the planner triggers it, **Then** they
    are told what it will change before it runs, and it does not run unless they
    confirm.
11. **Given** either operation has run, **When** the planner reads the result,
    **Then** it states which universes were changed and which were skipped, and
    why.

---

### User Story 5 - Find out how full a universe is before filling it (Priority: P3)

The planner opens **Universes** from the bar. A drawer shows each universe in the
rig with its occupancy as a number and a meter, its fixture count, the free
channels, the largest free run and where it starts, and any errors within it.
Below that, the models in the rig with their mode, per-fixture channel count and
total. Both bulk operations live here, in the section they act on, each stating
what it does.

**Why this priority**: It is the least of the five in isolation, but it is what
makes the 512-channel ceiling something you can see before you hit it rather than
an error message afterwards. It also takes the extra buttons out of a bar that
should carry one primary action.

**Independent Test**: Open the drawer on a rig spanning two universes with gaps
in both; confirm each universe's occupancy, free run and error count match the
sheet.

**Acceptance Scenarios**:

1. **Given** a rig using more than one universe, **When** the planner opens the
   drawer, **Then** each universe in use is listed with its occupancy out of 512,
   a meter, its fixture count, its free channels, its largest free run and where
   that run starts.
2. **Given** a universe with gaps between addressed fixtures, **When** it
   renders, **Then** the free channels it reports are the real total including
   those gaps, and the largest free run is stated separately.
3. **Given** a universe containing errors or shared groups, **When** it renders,
   **Then** it says how many and of what kind.
4. **Given** a universe with no fixtures addressed in it, **When** it renders,
   **Then** its meter draws nothing rather than appearing empty or full.
5. **Given** the drawer, **When** the planner reads the two bulk operations,
   **Then** each states in one line what it does and how it differs from the
   other.
6. **Given** the drawer, **When** the planner reads the models section, **Then**
   each catalog model in the rig is listed once with its quantity, its mode's
   channel count and its total channel demand.
7. **Given** the panel's bar after this story, **When** the planner reads it,
   **Then** it holds the title, search, the drawer control, then print and one
   primary action — the canonical order with no extra buttons.

---

### Edge Cases

**The map**

- **A rig with no fixtures.** The sheet renders its header and one sentence
  saying so, with the add control still in the bar; the strip states zero
  fixtures and reports no problems.
- **A search matching nothing.** One sentence naming the search term, as the
  audio sheets do — the strip continues to describe the whole rig, not the
  filtered view.
- **Twenty fixtures sharing one address.** One shared group of twenty; the
  universe's occupancy counts those channels **once**.
- **Two fixtures with the same start address but different channel counts.**
  A clash, not a shared group — the shorter fixture's channels are a subset of
  the longer one's, which is not what patching two fixtures together means.
- **A shared group where one member is then re-addressed.** The group shrinks to
  the remaining members; a group of two that loses one stops being a group.
- **A fixture whose span starts inside another's and ends outside it.** A clash,
  reported once for the pair rather than once per overlapping channel.
- **A span starting at 505 with 16 channels.** Out of bounds, reported as running
  off the end of the universe. The fixture is not truncated, not moved, and not
  refused.
- **A start address of 512 with 1 channel.** Legal, occupies the last channel,
  and is not out of bounds.
- **A universe with a single fixture occupying all 512 channels.** Occupancy
  reads full, the meter is full, and nothing warns — a full universe is legal.

**The bulk operations**

- **A rig where every fixture shares one address.** Both operations leave one
  block at address 1 and the universe nearly empty.
- **A shared group whose members sit in different universes.** They are not one
  group — sharing is per universe by definition — so each universe's members are
  grouped among themselves.
- **A group whose members are not adjacent in rig order.** Auto-assign places the
  group at the position of its first member and does not reorder the rest around
  it.
- **Optimise on a universe with no gaps.** Nothing changes, and the operation
  says so rather than reporting success on work it did not do.
- **Optimise on a universe with only unaddressed fixtures.** Nothing changes.
- **A universe that exactly fills 512 channels.** Both operations succeed; it is
  the 513th channel that fails.
- **A fixture with a channel count of zero.** Treated as one channel, as
  auto-assign already does.
- **A fixture with a universe below 1.** Treated as universe 1. This is the one
  case where a fixture's universe changes, and it is the normalisation of an
  impossible value rather than a jump between two real universes.
- **A read-only role.** Neither operation is offered at all.

**The rest**

- **A fixture with no catalog model.** Its name is whatever was typed; the model
  column is empty rather than showing a dash where a model name would go.
- **A fixture whose model was deleted from the inventory.** The row still
  renders, using the name stored on the fixture.
- **A mode picked, then the channel count edited by hand.** The hand-edited count
  wins and the mode name is left alone — the fixture is a copy of the mode, not a
  reference to it.
- **Two fixtures with the same console ID.** Flagged as today, never blocking.
- **Deleting the fixture whose editor is open.** The editor closes with it, with
  no frame showing an editor for a row that no longer exists.
- **A phone.** The tab keeps the list-and-sheet editor it already has, unchanged.
- **Print.** The lighting rig print sheet is untouched.

## Requirements *(mandatory)*

### Functional Requirements

#### The panel and the sheet

- **FR-001**: The Lighting tab MUST render as one work panel — a bar, the sheet,
  and a status strip closing it from inside — replacing the card-header-plus-table
  arrangement, per [design/patterns.md](../../design/patterns.md) §1.
- **FR-002**: The sheet MUST use the work-surface density tier throughout: sheet
  rows, micro-label column headings on an inset ground, and work-tier controls
  inside the editor.
- **FR-003**: A closed row MUST contain no form control of any kind — no input,
  no select, no delete button.
- **FR-004**: The sheet MUST carry exactly these nine columns, in order: console
  ID, fixture, mode, universe, address, channels, truss, power, notes.
- **FR-005**: The fixture column MUST show the fixture's own name as the primary
  value and its catalog model beside it as a secondary equipment identifier.
- **FR-006**: Universe, address and channel count MUST render as numeric cells in
  tabular figures so a column of them lines up; the address MUST render as a
  zero-padded span (first–last).
- **FR-007**: The power column MUST state the connection and its connector, and
  where a fixture is chained MUST name the fixture it is chained from rather than
  a database identifier.
- **FR-008**: The truss column MUST remain read-only, showing the truss and its
  offset where the fixture is hung on one.
- **FR-009**: Rows MUST be ordered by the fixture's position in the rig, and that
  position MUST NOT occupy a column of its own.
- **FR-010**: The row-ordinal column MUST be removed from the sheet.
- **FR-011**: Values with nothing in them MUST render an em-dash in the faint
  ink, never a blank cell.

#### The row editor

- **FR-012**: Clicking a row MUST open an editor in a row directly beneath it
  spanning every column, using the same construction the audio sheets use.
- **FR-013**: At most one row MUST be open at a time; opening another MUST save
  the first.
- **FR-014**: `Esc` MUST discard the draft, and `⌘↵`/`Ctrl↵` MUST save and open
  the next row.
- **FR-015**: The editor MUST hold every editable field the fixture has: console
  ID, name, catalog model, mode, channel count, universe, start address, power
  connection, power connector, rig order and notes.
- **FR-016**: Where the fixture's catalog model defines DMX modes, the editor
  MUST offer them, and picking one MUST copy both the mode name and its channel
  count onto the fixture. A later change to the catalog mode MUST NOT alter an
  existing fixture.
- **FR-017**: The editor MUST show the truss as a read-only value with a hand-off
  control that opens the Stage Plots tab, since the truss is set by placing the
  fixture there.
- **FR-018**: Delete MUST live in the editor, kept apart from the confirm
  control, and MUST confirm before removing the fixture.

#### The DMX map — the four conditions

- **FR-019**: A fixture's **span** MUST be derived from its universe, start
  address and channel count. A fixture with no start address has no span.
- **FR-020**: Two or more fixtures whose spans are **identical** — same universe,
  same start address, same channel count — MUST be treated as a **shared group**.
  A shared group MUST NOT be reported as an error anywhere, and MUST be counted
  and shown as what it is.
- **FR-021**: Two fixtures in one universe whose spans **intersect without being
  identical** MUST be reported as a **clash**.
- **FR-022**: A span whose last channel exceeds 512 MUST be reported as **out of
  bounds**, in wording distinct from a clash.
- **FR-023**: A fixture with no start address MUST count as **unaddressed** and
  MUST take no part in shared, clash or out-of-bounds detection.
- **FR-024**: The four conditions MUST be independent: a single universe may hold
  all four at once, and one fixture may be both a member of a shared group and
  party to a clash with a third fixture. Reporting one MUST NOT suppress another.
- **FR-025**: A clash MUST be reported once per pair of fixtures, not once per
  overlapping channel.

#### Universe occupancy

- **FR-026**: For each universe in use, the derivation MUST produce: the channels
  occupied, the channels free, the **free runs** (the gaps between occupied
  channels, each with a start and a length), the largest free run, the fixture
  count, the shared groups, and the errors within it.
- **FR-027**: Occupancy MUST count each channel **once**, so neither a shared
  group nor a clash makes a universe appear fuller than it is.
- **FR-028**: A span that runs past 512 MUST contribute only its channels within
  1–512 to occupancy, and MUST still be reported as out of bounds.
- **FR-029**: Free channels MUST be the true total including interior gaps, and
  the largest free run MUST be reported separately from it — the two answer
  different questions and only the second one answers "will this batch fit?"
- **FR-030**: The next free address for a batch of *N* channels MUST be the start
  of the first free run of at least *N* channels, not merely one past the highest
  occupied channel.

#### The bulk operations

- **FR-031**: Both bulk operations MUST act on **groups**, where a group is the
  set of fixtures sharing an identical span, and a fixture that shares with
  nobody is a group of one.
- **FR-032**: Every member of a group MUST receive the same start address, so
  **fixtures that shared before still share after**.
- **FR-033**: Distinct groups MUST receive disjoint blocks of channels, so
  **fixtures that did not share before do not share after**.
- **FR-034**: A group MUST consume its channel count **once**, not once per
  member.
- **FR-035**: No bulk operation may move a fixture from one universe to another.
  Universes correlate with physical separation — a cable run to a particular
  truss — so universe membership is an input to these operations and never an
  output.
- **FR-036**: Each universe MUST be processed independently. A universe whose
  groups need more than 512 channels MUST be left **entirely unchanged**, and
  MUST NOT prevent any other universe from being processed.
- **FR-037**: Both operations MUST report which universes were changed and which
  were skipped, and why.
- **FR-038**: **Auto-assign DMX** MUST order each universe's groups by the rig's
  own order — the position of each group's first member — and pack them from
  address 1. It MUST give an address to fixtures that have none.
- **FR-039**: **Optimise channels** MUST order each universe's groups by their
  current start address, breaking ties by rig order, and pack them from address 1
  so that every gap is closed. It MUST leave fixtures that have no address
  unaddressed.
- **FR-040**: Both operations MUST resolve clashes and pull out-of-bounds spans
  back inside the universe, as a consequence of every group receiving a block of
  its own.
- **FR-041**: Both operations MUST state what they will change and MUST NOT run
  without confirmation — each rewrites addresses a planner may have set by hand.
- **FR-042**: Optimise MUST report honestly when a universe already has no gaps,
  rather than claiming work it did not do.

#### The status strip

- **FR-043**: A strip MUST close the panel, stating in every state the fixture
  count, each universe's occupancy out of 512, and the number of shared groups.
- **FR-044**: The strip MUST have three states in this order of precedence:
  **errors** (clashes and out-of-bounds spans), **unaddressed**, **clean** —
  tinting both the ground and the bounding rule, per
  [design/tokens.md](../../design/tokens.md) §5.
- **FR-045**: The strip MUST name the first error in full — the fixtures, their
  spans and their universe — and count the rest.
- **FR-046**: The strip MUST count duplicate console IDs where any exist.
- **FR-047**: The strip MUST offer a control filtering the sheet to the rows it
  is reporting, and the way back to all rows.
- **FR-048**: A fixture's address cell MUST be marked in the sheet when that
  fixture is party to an error, and marked differently — quietly, as information
  rather than as a warning — when it is a member of a shared group, stating the
  size of that group.
- **FR-049**: No error, duplicate console ID or unaddressed fixture may block a
  save. All are reported and none is prevented.

#### Adding

- **FR-050**: One add control MUST open one editor at the foot of the sheet, in
  the same construction as the row editor, replacing both the Add Fixture and
  Bulk Add dialogs.
- **FR-051**: The add editor MUST carry a quantity defaulting to 1, and its
  confirm control MUST state how many fixtures it will add.
- **FR-052**: The add editor MUST offer, for any quantity: model, name, starting
  console ID, mode, channel count, universe, power connection and power
  connector.
- **FR-053**: With a quantity above 1 and a name given, the created fixtures MUST
  be named from that stem and numbered from 1, with consecutive console IDs from
  the given start.
- **FR-054**: The add editor MUST create a custom fixture when no catalog model
  is picked.
- **FR-055**: The add editor MUST state the batch's channel demand against the
  chosen universe's largest free run (FR-029).

#### The drawer

- **FR-056**: A drawer MUST list every universe in use with the values FR-026
  derives: occupancy out of 512, a meter, fixture count, free channels, largest
  free run and where it starts, its shared groups, and its errors by kind.
- **FR-057**: The meter MUST draw nothing for a universe with nothing addressed
  in it — an undeclared or empty count must never appear full or empty.
- **FR-058**: The drawer MUST list the catalog models in the rig, each once, with
  quantity, per-fixture channel count and total channel demand.
- **FR-059**: Both bulk operations MUST live in the drawer, each stating in one
  line what it does and how it differs from the other.
- **FR-060**: After this feature the panel's bar MUST hold, in order: the title,
  search, the drawer control, then print and one primary action.

#### Removing the DMX chain

- **FR-061**: The DMX chain column MUST be removed from the sheet.
- **FR-062**: `dmx_chain_parent_id` MUST be removed from the database by a
  migration, from the fixture's domain struct, from every query that reads or
  writes it, from the API's JSON, and from the frontend's fixture type.
- **FR-063**: The migration MUST be reversible, and the down migration MUST
  restore the column as nullable — restoring the schema, not the data, which
  never had any.
- **FR-064**: No other schema change is permitted by this feature. In particular,
  sharing MUST NOT become a stored relationship.

#### Search, roles and boundaries

- **FR-065**: The bar MUST carry a search box filtering on console ID, name,
  model, mode, truss and note.
- **FR-066**: Every control a read-only role cannot use MUST be absent, not
  disabled.
- **FR-067**: The phone view MUST be unchanged, except for the removal required
  by FR-062.
- **FR-068**: The lighting rig print sheet MUST be unchanged.
- **FR-069**: Every derivation this feature introduces — the four conditions, the
  occupancy model, and the packing both operations share — MUST be expressed as
  pure functions, testable without rendering anything and without a database.

### Key Entities

- **Lighting fixture** — one fixture in the rig, as it exists today, minus
  `dmx_chain_parent_id`.
- **Span** *(derived)* — a fixture's occupied channels: its universe, its start
  address, and its channel count. A fixture with no start address has no span.
- **Shared group** *(derived)* — two or more fixtures with identical spans.
  Legitimate; counted, never warned about. Not stored — a group exists because
  its members' addresses agree, and stops existing when they stop agreeing. It is
  also the unit both bulk operations move.
- **Clash** *(derived)* — a pair of spans in one universe that intersect without
  being identical.
- **Out-of-bounds span** *(derived)* — a span whose last channel exceeds 512.
- **Universe map** *(derived)* — per universe: channels occupied, channels free,
  the free runs with their starts and lengths, the largest free run, the fixture
  count, the shared groups, and the errors within it.
- **Catalog model and its DMX modes** — as they exist today; a mode is copied
  onto a fixture at the moment it is picked, never referenced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A planner can read a fixture's console ID, name, model, mode,
  universe, address span, channel count, truss and power **without clicking
  anything**.
- **SC-002**: At least **25 fixtures** are visible at once in a 900 px-tall
  viewport, against 7 today.
- **SC-003**: A rig of 40 fixtures fits its nine columns without horizontal
  scrolling at 1440 px.
- **SC-004**: Two fixtures sharing DMX addresses **by accident** are identified —
  by name, span and universe — without opening a row, in a situation where the
  application today says nothing at all.
- **SC-005**: Twenty fixtures sharing an address **on purpose** produce **zero**
  warnings, and the universe holding them reports their channels once.
- **SC-006**: A universe holding a shared group, a clash, an out-of-bounds span
  and unaddressed fixtures simultaneously reports all four correctly — verified
  by a test over that exact rig.
- **SC-007**: A shared group of twenty fixtures survives both bulk operations
  intact, occupying one block of channels rather than twenty — where today
  auto-assign spreads it across twenty.
- **SC-008**: No fixture changes universe under either bulk operation, over a rig
  spanning at least three universes.
- **SC-009**: A universe too full to pack leaves its own fixtures untouched and
  does not stop the other universes being packed — where today one full universe
  fails the whole rig.
- **SC-010**: Running optimise on a rig with gaps reduces each universe's highest
  occupied channel while leaving the relative order of its fixtures unchanged.
- **SC-011**: A planner can tell whether a batch of *N* channels will fit in a
  universe **before** creating it, in a universe whose free channels are split
  across gaps.
- **SC-012**: Adding twelve identical fixtures and adding one use the **same
  form**, and the number of dialogs on the tab goes from 2 to 0.
- **SC-013**: Every value editable on the tab today remains editable, and every
  value visible today remains visible or is accounted for in the ledger at
  [mockup.html](mockup.html) §06.
- **SC-014**: The tab's toolbar carries one primary action, against four
  same-weight buttons today.
- **SC-015**: The word `dmx_chain_parent_id` does not appear anywhere in the
  repository outside historical migration files.
- **SC-016**: The typecheck, lint, Go vet and test gates pass, and the four
  conditions, the occupancy model and the shared packing are covered by unit
  tests that render nothing.

## Assumptions

- **The four calls in the mockup are approved and are treated as decided**: the
  DMX chain column goes; the two add dialogs become one editor; the bulk
  operations move into a Universes drawer; errors are flagged and never blocking.
- **Sharing is recognised by identical spans, not by a stored marker.** Same
  universe, same start, same channel count. This was chosen over a stored group
  because a group is *already* fully described by the addresses of its members: a
  planner who patches twenty pars to one address has said everything there is to
  say, and a second place to also say it is a second thing to keep in sync. It
  also means the bulk operations preserve sharing by construction rather than by
  consulting a flag that could be stale.
- **Same start address but a different channel count is a clash, not sharing.**
  This is the strict reading. If it proves too strict in the field, relaxing it
  to "same start address" is a change to one pure function and nothing else,
  which is part of why the derivation lives outside the components.
- **Optimise packs from address 1.** A deliberate leading offset — starting a
  universe at 100 to leave room for something else — is not preserved, because
  "close the gaps" means all of them. If that turns out to be wrong, preserving
  the first group's address is a one-line change to the same pure function.
- **512 channels per universe**, matching the constant the auto-assign endpoint
  already enforces.
- **A universe "in use"** is one that at least one fixture is assigned to.
  Universes are not declared anywhere; they exist because fixtures point at them.
- **A fixture with a universe below 1 is treated as universe 1**, as auto-assign
  already does. It is the only case where a fixture's universe changes, and it is
  the normalisation of an impossible value rather than a jump between two real
  universes.
- **`dmx_chain_parent_id` is dead data.** The database defines it, the queries
  carry it, the API returns it and the sheet prints it as a raw row id. Nothing
  has ever written a non-null value: no endpoint sets it, no interface offers it,
  and the one test that mentions it sets it by hand to prove the column
  round-trips. It is deleted rather than left, on the reporter's decision.
- **The name stem and an optional model on a batch add** may require the bulk-add
  endpoint to carry a fixture name and to accept a batch with no catalog model.
  The plan decides whether to extend the endpoint or to compose the batch from
  single creates.
- **Search matches the same way the audio tabs' search does**, so a planner who
  has used one has used the other.
- **Two hundred fixtures** is the upper bound worth designing for; the sheet is
  not virtualised, as the audio sheets are not.

## Out of Scope

- **Running a bulk operation on one universe alone.** Both act on the whole rig,
  and because a universe that cannot fit is left untouched, nothing is blocked by
  the absence of a per-universe control. A button on each universe's card in the
  drawer is a small addition once the derivation is per-universe, and is the
  obvious next convenience.
- **Undoing a bulk operation.** Both state what they will do and ask before doing
  it; neither can be reversed afterwards, which is the behaviour auto-assign has
  today.
- **Reordering the rig.** Auto-assign reads the rig's order; it does not change
  it. Dragging fixtures into a different order is not part of this feature.
- DMX chaining as a modelled relationship. The column is deleted, so a future
  slice that wants it starts from a clean design rather than from a dead field.
- Power chain validation — how much load a chain carries, and whether it is
  legal. The power column states what is declared; it does not judge it.
- A flow or plot view of the lighting rig. Lighting has one view, and this
  feature does not add a second, so the panel's bar carries no view toggle.
- The phone view, and the print sheet.
- The remaining waves: `RentalTab`, `EquipmentTab`, `OverviewTab`,
  `SignalFlowTab` (Wave 4) and the pages (Wave 5).
