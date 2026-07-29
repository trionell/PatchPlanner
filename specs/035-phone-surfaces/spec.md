# Feature Specification: The nine surfaces

**Feature Branch**: `035-phone-surfaces`

**Created**: 2026-07-29

**Status**: Draft

**Input**: Wave 6c of the design convergence — the nine event sections in the phone's
panel frame. Closes audit findings **M4**, **M5**, **M9** and **M11**, and collects the
fixed-height shell 6b built and reverted. Approved mockup at
`specs/035-phone-surfaces/mockup.html`, revision 2.

---

## Context

Wave 6 is the phone. 6a (Slice 33) built the overlay — `ui/Sheet`, and the drawer's
phone anchoring — and deliberately touched no surface. 6b (Slice 34) built the frame
every surface sits in — bar, rows, strip — and put nine lists in it, four of which were
on pages rather than in the event.

**6c is the last conversion phase.** After it the phone is not a subset of the
application: every event section has a phone composition of its own rather than the
desktop's composition at 375 px or a capability withheld because nobody built it. One
phase and one finding are left — **6d**, the Flow canvas (`M6`).

Almost every value is already written down. `patterns.md` §7b draws the panel, §7d gives
the sheet its three jobs, §7f says what a canvas does in the hand, §7g says what stays a
desk job **and in what words**, §7h says a phone prints. `tokens.md` §7 states the
geometry. The mockup exists for the two places where that was not true — Overview and
Settings, which have no phone form at all — and the review settled everything it asked:

| | Settled |
|---|---|
| Do Equipment and Rental gain editing on the phone? | **Yes.** `patterns.md` §7g wins over Slice 21 FR-012 — see *Requirement conflict* below. |
| Overview's countdown, spanning two columns | **Spans.** One figure is about *now* and the other four are quantities; a grid says so by spanning rather than by inventing a colour. |
| A signal-flow row that wraps, against §7c | **Wraps.** The chain is the content, not a summary of it. |
| A **Print** action no finding asked for | **Added.** A print sheet reachable only through a browser's share menu does not satisfy §7h. |
| *(added at review)* Which event am I holding? | **The name goes in the shell's header** — the one thing visible in all nine sections that never scrolls. |

### The requirement conflict, and how it resolves

Slice 21 FR-012 made Equipment and Rental *"a read-only lookup on mobile for every
role"*, and both files still carry that sentence in a comment. `patterns.md` §7g says
the opposite in a list that names them — *"equipment lines, rental quantities"* — and
names **exactly one** desk job, which is neither of them.

§7g wins: it is the newer decision, it is the more specific one, and FR-012 was written
in the slice that introduced the phone at all, before anything on the phone could edit.
Slice 21 FR-012 is **superseded** by this specification and the comments quoting it are
removed with the code they justify.

### Three findings this slice adds

- **F1 — there is a fifth status rail.** 6b converted four into the shared
  `event/StatusStrip` shell and wrote *four* into both `audit.md` and `components.md` §5.
  `SignalFlowStatusRail` hand-builds the same tinted `border-t` div, with its own copy of
  the two-state tint expression and its own deliberately-below-`xs` control. It was
  missed because it is the one rail whose surface was not one of 6b's nine lists — so
  **`M1` is still standing on exactly one surface**, and it is the surface nobody counted.
- **F2 — the bar's overflow was specified and never built.** `patterns.md` §7b says
  *"what does not fit at 375 px goes into the overflow the same way the nav's fourth slot
  works; it does not silently vanish."* Nothing implements it, because in 6b nothing
  overflowed. In 6c five surfaces acquire controls and the busiest bar would carry
  **350 px of controls in 317 px**.
- **F3 — a constant is named after something that was deleted.**
  `MOBILE_SECTION_CAPABILITIES` has carried no capability since 6a removed the badge
  (`M7`). Its own comment records that the name was kept so a rename would not be mixed
  into a deletion; that reason has expired.

### And the shell 6b handed here by name

A panel that *fills the body* — scrolling only its rows, so the bar and the strip stay
on screen — is what a strip is for, and it needs the shell to be a fixed-height column.
6b built it and took it out in the same slice: a column makes every child a flex item,
and **a flex item whose root is a scroll container has an automatic minimum size of
zero**, so the three phone surfaces that were not panels were compressed below their
content and clipped, with no scrollbar anywhere. Those three are **Overview**, **event
Settings** and **`/my-defaults`** — and this slice is what makes them panels.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app stops saying "you may not" when it means "nobody built it" (Priority: P1)

A contributor is standing at a rack during load-in with 18 SM58s instead of the 14 the
plan says. On a phone today the Equipment tab shows the line and no way to change it,
and every downstream check reads as a refusal. After this slice they tap the line, a
bottom sheet opens with **Quantity** and **Note**, and saving updates the plan. The same
holds for a rental quantity. On a stage plot they can tap a riser and rename it, and the
panel says in one sentence why they cannot *move* it.

**Why this priority**: It is the whole of `M4` and the wave's stated principle (P9) — a
capability is a role question, and a viewport is not a role. It is also the finding a
user meets most often, because it fires on three of the nine sections.

**Independent Test**: Sign in as a contributor at 375 px, edit an equipment line, a
rental line and a plot element's name, and confirm each change is visible on the desktop.
Sign in as a viewer and confirm every row still opens and reads.

**Acceptance Scenarios**:

1. **Given** an owner or contributor on a phone, **When** they tap an owned equipment
   line, **Then** a sheet opens with the same fields the desktop row editor has, and
   **Save** commits.
2. **Given** a rented equipment line, **When** they tap it, **Then** the sheet states
   that the line belongs to the rental order and offers to open it — the behaviour the
   desktop row already has.
3. **Given** a **viewer** on a phone, **When** they tap any row on any list,
   **Then** the row responds and opens a sheet showing every field read-only —
   because a phone row is a truncation and a viewer who cannot tap cannot read the plan.
4. **Given** a viewer, **When** the sheet is open, **Then** it has no confirm control and
   no delete control, and no request is ever attempted.
5. **Given** any role on a phone, **When** they open Stage Plots, **Then** the panel
   states *"Placing elements is a desk job — open this plot on a computer. Tap anything
   on it to read or edit what it is."*, and the sentence does not change with role.
6. **Given** a plot element, **When** it is tapped, **Then** the inspector's fields open
   in a sheet and commit per field, and position and size are absent from it.
7. **Given** the whole tree, **When** searched, **Then** `!isMobile` appears in **no**
   permission expression.

---

### User Story 2 - A stagebox that arrives on site is declared on site (Priority: P1)

A stagebox nobody planned for turns up on the truck. The technician opens Audio Inputs
on a phone, taps the bar's overflow, taps **Open Rig**, and adds it — then patches a
channel to it from the edit sheet's *Stagebox* select, which until now could only ever
offer what some desktop session had declared earlier.

**Why this priority**: It is `M5`, and it is the case the phone exists for. It is also
the cheapest finding in the wave — the three drawers have had a phone form since 6a and
have never been rendered.

**Independent Test**: At 375 px on Audio Inputs, add a stagebox through the Rig sheet,
then confirm it is selectable when editing a channel and present on the desktop.

**Acceptance Scenarios**:

1. **Given** a phone on Audio Inputs, **When** the overflow is opened, **Then** it offers
   **Open Rig**, **Groups & DCAs** and **Print patch sheet**.
2. **Given** a phone on Audio Outputs, **Then** the overflow offers **Open Rig** and
   **Print**; on Lighting, **Universes** and **Print**.
3. **Given** the Rig sheet, **Then** it renders the same component tree the desktop
   drawer renders — micro-label section headings, gear cards, 10 px mono spec lines — at
   phone geometry, with no drawer file edited.
4. **Given** a stagebox added from the phone, **When** a channel is edited,
   **Then** the new stagebox is offered by the *Stagebox* select.
5. **Given** a viewer, **Then** the drawer entries are absent from the overflow, exactly
   as the desktop withholds the drawer buttons — the phone matches the role answer the
   desktop already gives rather than inventing its own.

---

### User Story 3 - Which event am I holding? (Priority: P1)

Someone with three shows in the same week opens the app on site, scrolls a 40-channel
patch, and glances at the top of the screen to confirm which event they are in.

**Why this priority**: Raised at the design review from lived use. It is the smallest
change in the slice and it fires on every screen of every session; and it *hands back*
about 48 px to all nine sections rather than costing anything.

**Independent Test**: Open an event at 375 px, scroll any section to the bottom, and read
the event's name from the header.

**Acceptance Scenarios**:

1. **Given** any event section on a phone, **Then** the shell's header shows the event's
   name in place of the words *Event Detail*.
2. **Given** a name longer than the slot, **Then** it truncates rather than wrapping or
   resizing the header.
3. **Given** any scroll position in any section, **Then** the name is still on screen.
4. **Given** a page that is not an event, **Then** the header shows the page title it
   shows today.
5. **Given** an event section, **Then** `← Events` is a 44 px target beside the section
   switcher and the separate header block is gone.

---

### User Story 4 - How is this show doing, in one hand (Priority: P2)

A production manager on the way to the venue opens Overview on a phone. Today they get
the desktop card at 375 px: the five-figure band wraps into a ragged stack and the rig
ribbon runs off the right edge with nothing to scroll it. After this slice they get the
countdown at a glance, the four quantities beside it, both rig ribbons as drawings they
can pan, and **five rows that each state one area's verdict and open that section**.

**Why this priority**: Half of `M9`, and the surface with the most design work. It is
P2 rather than P1 only because nothing else in the slice depends on it except the shell.

**Independent Test**: Open Overview at 375 px on an event with a gap in the patch and an
over-stock rental line, and confirm every figure and verdict matches the desktop's.

**Acceptance Scenarios**:

1. **Given** Overview on a phone, **Then** the five figures render at the desktop's own
   type size, as a two-column grid with the load-in countdown spanning both columns.
2. **Given** the figure tiles, **Then** none of them draws a border, a radius or a ground
   of its own — they are separated by the same hairlines the rows use.
3. **Given** a rig ribbon wider than the panel, **Then** it scrolls horizontally within
   its own row and nothing on it is re-sized, and the page does not scroll sideways.
4. **Given** five readiness verdicts, **Then** each is a row at least 44 px tall carrying
   the area, its figure, its verdict pill and the verdict's tone as a leading edge, and
   tapping it opens that section.
5. **Given** any verdict, **Then** it is the same word and tone the desktop shows,
   derived by the same function.
6. **Given** Overview, **Then** its strip states how many areas need attention and names
   them, and offers no filter.
7. **Given** Overview, **Then** the venue and the dates open the rows region as one line,
   and the event's name is **not** repeated there.

---

### User Story 5 - The planning vocabulary, on the device it is corrected on (Priority: P2)

A show's *Source kinds* list is missing an entry, noticed while patching on site. The
user opens Settings on the phone, picks the vocabulary from the bar, adds the value, and
carries on. The same panel is *My Defaults*, reached from the bottom nav's **More**.

**Why this priority**: The other half of `M9`, and one branch serving two surfaces — both
of them on 6b's list of three that blocked the fixed-height shell.

**Independent Test**: At 375 px, switch vocabularies, add a value, rename one, and try to
delete a value that is in use.

**Acceptance Scenarios**:

1. **Given** Settings on a phone, **Then** the nine vocabularies are a bar control naming
   the current one, opening a sheet that lists all nine with their value counts.
2. **Given** a vocabulary name longer than the control, **Then** it truncates.
3. **Given** a vocabulary's values, **Then** each row shows the label, the stored value
   and how many plan rows use it.
4. **Given** a vocabulary that no column reads, **Then** its rows say `not stored` rather
   than showing a blank count.
5. **Given** the panel, **Then** its strip states the vocabulary count and what this copy
   is, and offers no filter.
6. **Given** `/my-defaults` at 375 px, **Then** it is the same panel, and usage counts are
   absent there exactly as they are on the desktop.

---

### User Story 6 - The signal chain, in the frame, with a verdict (Priority: P2)

A technician tracing a dead channel opens Signal Flow on a phone. Today it is a stack of
free-standing cards with nothing at the foot. After this slice it is one panel, inputs
and outputs under their own headings, each row carrying the full chain — and a strip that
says `1 gap · ch 9 Bass DI has no source` and filters to it.

**Why this priority**: It closes `F1` and the last standing instance of `M1`, on the one
surface that exists to answer *where does this signal go*.

**Independent Test**: At 375 px on an event with one unsourced channel, confirm the panel,
the two runs, the strip's sentence, and that tapping the strip shows only the gap.

**Acceptance Scenarios**:

1. **Given** Signal Flow on a phone, **Then** it is one bordered panel with a bar, rows
   and a strip.
2. **Given** an input and an output run, **Then** each sits under a micro-label heading
   with its count.
3. **Given** a chain longer than the row, **Then** the chain line **wraps** rather than
   truncating, and the row grows.
4. **Given** a channel with no source, **Then** its chain line says so in the error tone.
5. **Given** the strip, **Then** it reports gaps, input and output counts and the first
   gap in words, and tapping it filters the list to the gaps.
6. **Given** the desktop at any width above the breakpoint, **Then** Signal Flow's rail
   renders exactly the markup it renders today.

---

### User Story 7 - The verdict does not scroll away (Priority: P3)

A technician scrolls a 40-row rental order on a phone. Today the strip that says whether
the order can be sent is at the bottom of the content, six screens down. After this slice
the rows scroll inside the panel and the bar and the strip stay on screen.

**Why this priority**: 6b's deferred item, and it cannot land until every phone surface
is a panel or a canvas — which is what stories 4 and 5 finish.

**Independent Test**: At 375 × 667 on a list of 40 rows, scroll to the middle and confirm
the bar, the strip and the bottom nav are all still visible.

**Acceptance Scenarios**:

1. **Given** any phone surface, **Then** the shell is one fixed-height column and the
   only thing that scrolls is the panel's rows region.
2. **Given** a surface whose content is taller than the viewport, **Then** it scrolls —
   it is never compressed below its content or clipped without a scrollbar.
3. **Given** the bottom nav, **Then** it is a sibling in the column rather than an overlay,
   the body's derived bottom padding is gone, and the safe-area inset is still added to
   the nav's own height.
4. **Given** a list at 375 × 667, **Then** it shows **no fewer rows than it does today**.

---

### User Story 8 - A print from a phone is a page (Priority: P3)

A technician on site prints the input patch sheet for the stage crew. Today the phone
branch renders `print:hidden` and nothing else, so the page is blank.

**Why this priority**: `M11`. Small, isolated, and the last thing the phone cannot do
that the desktop can.

**Independent Test**: At 375 px, print each of Audio Inputs, Audio Outputs and Lighting,
and compare the output with the same print at desktop width.

**Acceptance Scenarios**:

1. **Given** any of the three tabs on a phone, **When** printed, **Then** the print sheet
   is produced and it is identical to the desktop's.
2. **Given** a printed page, **Then** the panel, the bar, the strip, the switcher and the
   nav appear nowhere on it.
3. **Given** the bar's overflow, **Then** it offers **Print** on every surface that has a
   print sheet, and the rental exports on Rental.

---

### Edge Cases

- **A bar with one overflow action.** It renders as that action's own 44 px target rather
  than a `⋯` that opens a sheet with one row in it. Signal Flow's Print is the case.
- **A bar with no overflow actions.** No `⋯` target at all — the same rule that already
  hides a search control that filters nothing.
- **A viewer and the overflow.** Actions a viewer cannot perform are absent, not disabled
  — and *which* those are is the desktop's existing answer, not a new one. The desktop
  passes no `onOpenRig` for a viewer, so a viewer's overflow on Audio Inputs holds
  **Print alone**. The phone does not re-open a role question (P9); it only stops
  answering a reach question as if it were one.
- **The third rental export.** *Export price list* is offered only for a catalog imported
  from a price list, exactly as on the desktop.
- **An event that fails to load.** The header shows the page title it shows today rather
  than an empty name or a flash of *Event Detail*.
- **An event with no plan at all.** Overview's figures show the undeclared dash rather
  than a zero, and the readiness rows show the neutral verdicts the desktop shows.
- **A rig ribbon with one node.** It does not scroll and draws no affordance suggesting
  it does.
- **A stage plot with no plots.** The withheld-gesture sentence is still shown, because
  it describes the surface rather than its contents.
- **A vocabulary with no values.** The empty line names the vocabulary rather than saying
  the surface is empty.
- **A filter that empties a list.** Already handled by 6b's `filtered` prop, and every new
  list in this slice passes it.
- **A failed save from a sheet.** The sheet stays open with every value intact and the
  error inline above the fields — a phone edit happens in a loading bay on a bad
  connection.
- **A very long event name.** Truncates in the header; the avatar and brand mark do not
  move.

---

## Requirements *(mandatory)*

### Functional Requirements

**A viewport is not a permission (M4)**

- **FR-001**: `!isMobile` MUST NOT appear in any permission expression anywhere in the
  frontend.
- **FR-002**: Equipment lines MUST be creatable, editable and deletable from a phone by
  any role that may do so on the desktop.
- **FR-003**: Rental manual quantities and notes MUST be editable from a phone by any role
  that may do so on the desktop, and manual lines addable.
- **FR-004**: A plot element's own properties MUST be editable from a phone by any role
  that may do so on the desktop, committing per field.
- **FR-005**: Placing, dragging, resizing and creating plot elements MUST remain absent on
  a phone, withheld by gesture rather than by role.
- **FR-006**: A surface that withholds a gesture MUST say so in one sentence in the panel,
  naming the reason and what is still available. It MUST NOT be a banner, a dialog or a
  disabled control, and it MUST NOT vary with role.
- **FR-007**: Every list row on a phone MUST respond to a tap for every role. A role that
  may not edit MUST get the same sheet with no confirm control, no destructive control and
  no request attempted.

**The rig, in the hand (M5)**

- **FR-008**: The Rig, Buses and Universes drawers MUST be reachable from their tabs'
  phone branches.
- **FR-009**: They MUST render the existing drawer components unmodified, at phone
  geometry, through the phone form those components already have.
- **FR-010**: Gear declared from a phone MUST be immediately selectable in that surface's
  edit sheets.

**The two surfaces with no phone form (M9)**

- **FR-011**: Overview MUST have a phone composition: five figures at the desktop's type
  size as a two-column grid with the countdown spanning; both rig ribbons as horizontally
  scrolling drawings; five readiness rows of at least 44 px that state and route; the
  venue and dates as one line; the inventory row; the meta footer.
- **FR-012**: No figure tile MUST draw a border, a radius or a ground of its own.
- **FR-013**: Overview MUST NOT repeat the event's name (FR-021 puts it in the header).
- **FR-014**: Event Settings and `/my-defaults` MUST have a phone composition in which the
  vocabulary rail is a bar control opening a sheet listing all vocabularies with counts.
- **FR-015**: A vocabulary value's row MUST carry its label, its stored value and its usage
  count, and MUST say `not stored` where the desktop does.
- **FR-016**: Every number and verdict on a phone MUST be derived by the function that
  derives it for the desktop. Nothing is computed twice.

**The bar (F2)**

- **FR-017**: The phone panel MUST offer an overflow for controls that do not fit its bar.
- **FR-018**: A control that changes *what you are looking at* MUST stay visible in the
  bar; a control that does a thing and is finished MUST go in the overflow.
- **FR-019**: An overflow holding exactly one action MUST render as that action's own
  44 px target; an overflow holding none MUST render nothing.
- **FR-020**: The overflow's sheet MUST be built by the panel, not by its callers, so that
  every surface's overflow is the same shape.

**The event's name**

- **FR-021**: The phone shell's header MUST show the event's name on every event section,
  truncating, and MUST show today's page title everywhere else.
- **FR-022**: The name MUST come from data the application has already fetched — no new
  request, no new endpoint.
- **FR-023**: `← Events` MUST be a 44 px target beside the section switcher, and the
  separate phone header block MUST be removed.

**The shell**

- **FR-024**: The phone shell MUST be one fixed-height column in which the panel fills the
  body and only the rows region scrolls.
- **FR-025**: Every scrolling child of that column MUST declare a zero minimum size, so no
  surface can be compressed below its content and clipped.
- **FR-026**: The bottom nav MUST become a sibling in the column; the body's derived bottom
  padding is removed and the safe-area inset stays added to the nav's own height.
- **FR-027**: A list at 375 × 667 MUST show no fewer rows than it does today.

**Signal Flow (F1)**

- **FR-028**: `SignalFlowStatusRail` MUST use the shared status-strip shell, so it acquires
  the phone form the other four already have.
- **FR-029**: Signal Flow's phone branch MUST be a panel with two runs under micro-label
  headings and the rail as its strip.
- **FR-030**: A signal chain MUST wrap rather than truncate. This is a stated exception to
  the phone row's truncation rule, recorded in the design language in the same commit.

**Printing (M11)**

- **FR-031**: Audio Inputs, Audio Outputs and Lighting MUST render their print sheets in
  the phone branch, producing output identical to the desktop's.
- **FR-032**: No panel chrome MUST appear on a printed page.
- **FR-033**: Every surface with a print sheet MUST offer **Print**, and Rental MUST offer
  its exports, through the overflow.

**Not taking the desktop with it**

- **FR-034**: No desktop composition may change. The two shared components this slice
  touches MUST render byte-identical desktop markup before and after, asserted by rendering
  every state and diffing.
- **FR-035**: The change MUST be frontend-only — no endpoint, no migration, no field.
- **FR-036**: No value outside the two density tiers may be introduced in
  `components/mobile/` or in any phone branch.
- **FR-037**: Every design document this slice contradicts MUST be updated in the same
  commit: the four findings struck, *four rails* corrected to *five*, §7b's overflow rule
  written down, and §7b's *"the page scrolls, not the panel"* removed.

### Key Entities

No new entity. Two derived read projections are added in `lib/`:

- **A readiness row** — an area, its figure, its verdict and its tone, assembled from the
  event summary that already produces all four for the desktop.
- **An overflow action** — a label, an icon, a handler and whether it is available.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can declare a stagebox that arrives on site and patch a channel
  to it without touching a computer.
- **SC-002**: A contributor can correct an equipment quantity on a phone in under 15
  seconds from opening the section.
- **SC-003**: A viewer can read every field of every row on every section from a phone —
  today they can read only what fits on two truncated lines.
- **SC-004**: Nothing on any phone section tells a user they may not do something when the
  truth is that nobody has built it. Verified by search: zero permission expressions
  mention the viewport.
- **SC-005**: A user with more than one show open in a week can identify which event they
  are in from any screen, at any scroll position, without scrolling.
- **SC-006**: Every phone section states whether its part of the plan holds, and the
  statement is on screen at every scroll position.
- **SC-007**: Every figure and verdict on Overview matches the desktop's for the same
  event, for every event.
- **SC-008**: Printing from a phone produces the same page as printing from a desk.
- **SC-009**: No list shows fewer rows at 375 × 667 than it does before this slice.
- **SC-010**: The desktop is unchanged — no desktop surface renders different markup for
  any state.

---

## Assumptions

- **`patterns.md` §7g supersedes Slice 21 FR-012** for Equipment and Rental. Recorded
  above; the affected comments are deleted with the code they justify.
- **The Flow canvas stays desktop-only.** That is `M6` and 6d. This slice settles the two
  things 6d needs first: what a phone bar does when it runs out of room, and what an
  inspector in a sheet is.
- **Adding a plot element from a phone is out of scope**, because creating an element is
  placing one.
- **The signed-out start page stays exempt**, per `audit.md` Part 2b.
- **The event name in the header applies to the phone only.** The desktop already prints
  it on the page and has a sidebar in the slot.
- The 375 × 667 handset remains the reference viewport, and `(max-width: 767px)` remains
  the single definition of reach.
- Every query this slice reads is already cached under an existing key by the surface that
  owns it, so no surface pays a request for another's data.

---

## Out of Scope

- The Flow canvas on a phone (`M6`, wave 6d).
- Creating or positioning stage-plot elements from a phone.
- Sorting or bulk edit on any phone list — the desktop does not have them either.
- Any backend change.
- The signed-out start page.
