# Feature Specification: Lighting becomes a sheet

**Feature Branch**: `main` — Waves 0–2 of the design convergence were committed
directly to `main` and this wave continues on it. No feature branch was cut.

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Let's handle wave 3. Use the speckit flow with
commits between each step. Before writing the spec, create a mockup of the
redesign for me to approve" — followed by "all four approved" against the four
calls put in [mockup.html](mockup.html) §08.

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

**Nothing notices an address clash.** Auto-assign packs each universe from
address 1 in rig order, so its own output is always clean. But a single
hand-edited address afterwards puts two moving heads on the same channels, and
the application says nothing — not in the sheet, not on save, not on print. The
first thing that notices is a technician standing in the room with two fixtures
answering to one fader. Duplicate console IDs are already flagged; overlapping
DMX addresses, which are strictly worse, are not.

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
   **Then** rows do not open, and the add, delete and auto-assign controls are
   absent rather than disabled.

---

### User Story 2 - See that two fixtures share addresses (Priority: P2)

The planner has hand-edited a few addresses after an auto-assign. The strip at
the foot of the panel is red and says `1 overlap`, names the two fixtures
involved, and offers to filter the sheet to just the clashes. In the sheet, the
offending address cell is red. They open the row, change the address, and the
strip turns amber — there are still two fixtures with no address at all — then
green once those are assigned.

**Why this priority**: It is the one genuinely new capability in this wave, and
the reason the audit calls it a workflow change. It is P2 rather than P1 only
because the sheet has to exist for it to sit under.

**Independent Test**: Give two fixtures in one universe overlapping address
spans; confirm the strip counts the overlap, names both fixtures, marks both
address cells, and that filtering to clashes shows exactly those two rows.

**Acceptance Scenarios**:

1. **Given** two fixtures in the same universe whose address spans intersect,
   **When** the sheet renders, **Then** both address cells are marked and the
   strip reports the overlap, naming the two fixtures and their spans.
2. **Given** a fixture whose address span would run past channel 512, **When**
   the sheet renders, **Then** it is reported in the same way as an overlap.
3. **Given** fixtures with no start address, **When** the sheet renders, **Then**
   they are counted as *unaddressed*, never as overlapping, and their address
   cell reads as an empty value rather than sitting blank.
4. **Given** a rig with both an overlap and unaddressed fixtures, **When** the
   strip renders, **Then** it shows the overlap state — the three states are
   ordered by how much attention they need: clashes, then unaddressed, then
   clean.
5. **Given** the strip is reporting clashes or unaddressed fixtures, **When** the
   planner uses its filter control, **Then** the sheet shows only those rows, and
   the control offers the way back to all rows.
6. **Given** any state, **When** the strip renders, **Then** it states the
   fixture count and each universe's occupancy out of 512.
7. **Given** an overlap or a duplicate console ID exists, **When** the planner
   saves any row, **Then** the save succeeds — a rig legitimately passes through
   a broken state while it is being renumbered, so these are reported and never
   blocked.
8. **Given** a fixture with a channel count of zero or a universe below 1,
   **When** occupancy and overlap are derived, **Then** the derivation neither
   crashes nor reports a false clash.

---

### User Story 3 - Add one fixture or twelve with the same form (Priority: P2)

The planner needs twelve more wash lights. They press **+ Fixtures**. An editor
opens at the foot of the sheet — the same construction the row editor uses —
with a quantity field showing 1. They set it to 12, pick the model, give a name
stem, set the mode, universe and power, and the button reads *Add 12 fixtures*.
Next time they need a single haze machine, they use the same form and leave the
quantity at 1.

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
7. **Given** the add editor with a quantity and channel count set, **When** the
   planner reads it, **Then** it states how many channels the batch needs and how
   many the chosen universe has free.

---

### User Story 4 - Find out how full a universe is before filling it (Priority: P3)

The planner opens **Universes** from the bar. A drawer shows each universe in the
rig with its occupancy as a number and a meter, its fixture count, its free
channels and its next free address; below that, the models in the rig with their
mode, per-fixture channel count and total. Auto-assign DMX is here, in the
section it acts on, with a footer stating what it does to addresses set by hand.

**Why this priority**: It is the least of the four in isolation, but it is what
makes the 512-channel ceiling something you can see before you hit it rather than
an error message afterwards. It also takes the fourth button out of a bar that
should carry one primary action.

**Independent Test**: Open the drawer on a rig spanning two universes; confirm
each universe's occupancy matches the strip, and that auto-assign run from the
drawer produces the addresses it always did.

**Acceptance Scenarios**:

1. **Given** a rig using more than one universe, **When** the planner opens the
   drawer, **Then** each universe in use is listed with its occupancy out of 512,
   a meter, its fixture count, its free channels and its next free address.
2. **Given** a universe with no fixtures addressed in it, **When** it renders,
   **Then** its meter draws nothing rather than appearing empty or full.
3. **Given** the drawer, **When** the planner runs auto-assign, **Then** the
   addresses are assigned exactly as they are today, the drawer and the sheet
   both reflect the result, and a failure states which universe overflowed.
4. **Given** the drawer, **When** the planner reads the models section, **Then**
   each catalog model in the rig is listed once with its quantity, its mode's
   channel count and its total channel demand.
5. **Given** the panel's bar after this story, **When** the planner reads it,
   **Then** it holds the title, search, the drawer control, then print and one
   primary action — the canonical order with no extra buttons.

---

### Edge Cases

- **A rig with no fixtures.** The sheet renders its header and one sentence
  saying so, with the add control still in the bar; the strip states zero
  fixtures and reports no problems.
- **A search matching nothing.** One sentence naming the search term, as the
  audio sheets do — the strip continues to describe the whole rig, not the
  filtered view.
- **A fixture with no catalog model.** Its name is whatever was typed; the model
  column is empty rather than showing a dash where a model name would go.
- **A fixture whose model was deleted from the inventory.** The row still
  renders, using the name stored on the fixture.
- **A mode picked, then the channel count edited by hand.** The hand-edited count
  wins and the mode name is left alone — the fixture is a copy of the mode, not a
  reference to it.
- **Two fixtures with the same console ID.** Flagged as today, never blocking.
- **An address span partly past 512.** Reported; the fixture is not silently
  truncated or moved.
- **A universe with a single fixture occupying all 512 channels.** Occupancy
  reads full, the meter is full, and nothing warns — a full universe is legal.
- **Deleting the fixture whose editor is open.** The editor closes with it, with
  no frame showing an editor for a row that no longer exists.
- **A read-only role.** Rows do not open, add/delete/auto-assign are absent, and
  the read-only banner states the role once.
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
- **FR-010**: The sheet MUST NOT show the row-ordinal column or the DMX chain
  column that exist today (see Assumptions).
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

#### The status strip

- **FR-019**: A strip MUST close the panel, stating in every state the fixture
  count and each universe's occupancy out of 512.
- **FR-020**: The strip MUST have three states in this order of precedence:
  **clashes**, **unaddressed**, **clean** — tinting both the ground and the
  bounding rule, per [design/tokens.md](../../design/tokens.md) §5.
- **FR-021**: A **clash** MUST be either two fixtures in one universe whose
  address spans intersect, or one fixture whose span runs past channel 512. The
  strip MUST name the first clash in full and count the rest.
- **FR-022**: A fixture with no start address MUST count as **unaddressed** and
  MUST NOT participate in overlap detection.
- **FR-023**: The strip MUST count duplicate console IDs where any exist.
- **FR-024**: The strip MUST offer a control filtering the sheet to the rows it
  is reporting, and the way back to all rows.
- **FR-025**: A fixture's address cell MUST be marked in the sheet when that
  fixture is part of a clash.
- **FR-026**: No clash, duplicate console ID or unaddressed fixture may block a
  save. All three are reported and never prevented.
- **FR-027**: Universe occupancy MUST count each channel once, so an overlap does
  not make a universe appear fuller than it is.

#### Adding

- **FR-028**: One add control MUST open one editor at the foot of the sheet, in
  the same construction as the row editor, replacing both the Add Fixture and
  Bulk Add dialogs.
- **FR-029**: The add editor MUST carry a quantity defaulting to 1, and its
  confirm control MUST state how many fixtures it will add.
- **FR-030**: The add editor MUST offer, for any quantity: model, name, starting
  console ID, mode, channel count, universe, power connection and power
  connector.
- **FR-031**: With a quantity above 1 and a name given, the created fixtures MUST
  be named from that stem and numbered from 1, with consecutive console IDs from
  the given start.
- **FR-032**: The add editor MUST create a custom fixture when no catalog model
  is picked.
- **FR-033**: The add editor MUST state the batch's channel demand against the
  chosen universe's free channels.

#### The drawer

- **FR-034**: A drawer MUST list every universe in use with its occupancy out of
  512, a meter, its fixture count, its free channels and its next free address.
- **FR-035**: The meter MUST draw nothing for a universe with nothing addressed
  in it — an undeclared or empty count must never appear full or empty.
- **FR-036**: The drawer MUST list the catalog models in the rig, each once, with
  quantity, per-fixture channel count and total channel demand.
- **FR-037**: Auto-assign DMX MUST move into the drawer, act exactly as it does
  today, and state in the drawer's footer that it overwrites addresses set by
  hand.
- **FR-038**: An auto-assign failure MUST state which universe overflowed, in the
  place the failure is explicable.
- **FR-039**: After this feature the panel's bar MUST hold, in order: the title,
  search, the drawer control, then print and one primary action.

#### Search, roles and boundaries

- **FR-040**: The bar MUST carry a search box filtering on console ID, name,
  model, mode, truss and note.
- **FR-041**: Every control a read-only role cannot use MUST be absent, not
  disabled.
- **FR-042**: The phone view MUST be unchanged.
- **FR-043**: The lighting rig print sheet MUST be unchanged.
- **FR-044**: No database migration and no change to the fixture's stored fields
  is permitted by this feature. Overlap, occupancy and duplicate detection MUST
  be derived from data already fetched.
- **FR-045**: Any derivation this feature introduces MUST be a pure function
  outside the components, so it is testable without rendering.

### Key Entities

- **Lighting fixture** — one fixture in the rig, as it exists today. Nothing is
  added to it or removed from it.
- **Address span** *(derived)* — a fixture's occupied channels: its universe, its
  start address, and its channel count. A fixture with no start address has no
  span.
- **Clash** *(derived)* — two spans in one universe that intersect, or one span
  running past 512.
- **Universe occupancy** *(derived)* — per universe: the channels occupied
  counting each once, the fixture count, the free channels, and the next free
  address.
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
- **SC-004**: Two fixtures sharing DMX addresses are identified — by name, span
  and universe — **without opening a row**, in a situation where the application
  today says nothing at all.
- **SC-005**: Adding twelve identical fixtures and adding one use the **same
  form**, and the number of dialogs on the tab goes from 2 to 0.
- **SC-006**: Every value editable on the tab today remains editable, and every
  value visible today remains visible or is accounted for in the ledger at
  [mockup.html](mockup.html) §06.
- **SC-007**: A planner can tell whether a universe has room for a batch of
  fixtures **before** creating them.
- **SC-008**: The tab's toolbar carries one primary action, against four
  same-weight buttons today.
- **SC-009**: The typecheck, lint and test gates pass, and the derivations
  introduced are covered by unit tests that render nothing.

## Assumptions

- **The four calls in the mockup are approved and are treated as decided**:
  the DMX chain column is deleted; the two add dialogs become one editor;
  auto-assign moves into a Universes drawer; overlaps are flagged and never
  blocking.
- **The DMX chain column is dead data.** It renders `dmx_chain_parent_id`, a raw
  row identifier, which nothing in the application writes and nothing edits. It
  is removed from the interface. The stored field is left alone — this feature
  changes no schema — so if DMX chaining is later specified as real planning
  data, it starts from an untouched column and gets the treatment power chains
  get.
- **512 channels per universe** is the DMX universe size, matching the constant
  the auto-assign endpoint already enforces.
- **A universe "in use"** is one that at least one fixture is assigned to.
  Universes are not declared anywhere; they exist because fixtures point at them.
- **Auto-assign's behaviour is unchanged.** It packs each universe from address 1
  in rig order and fails the whole rig if any universe would overflow. Whether
  that all-or-nothing failure is right is a separate question, deliberately not
  reopened here.
- **The name stem and an optional model on a batch add** may require the bulk-add
  endpoint to carry a fixture name and to accept a batch with no catalog model.
  That is the one backend change this feature may need; it adds fields to an
  existing request and no table changes. The plan decides whether to extend the
  endpoint or to compose the batch from single creates.
- **Search matches the same way the audio tabs' search does**, so a planner who
  has used one has used the other.
- **Two hundred fixtures** is the upper bound worth designing for; the sheet is
  not virtualised, as the audio sheets are not.

## Out of Scope

- DMX chaining as a modelled relationship (see Assumptions).
- Changing what auto-assign does, including its all-or-nothing failure.
- Power chain validation — how much load a chain carries, and whether it is
  legal. The power column states what is declared; it does not judge it.
- A flow or plot view of the lighting rig. Lighting has one view, and this
  feature does not add a second, so the panel's bar carries no view toggle.
- The phone view, and the print sheet.
- The remaining waves: `RentalTab`, `EquipmentTab`, `OverviewTab`,
  `SignalFlowTab` (Wave 4) and the pages (Wave 5).
