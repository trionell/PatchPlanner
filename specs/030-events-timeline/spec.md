# Feature Specification: The Events timeline, and events that have length

**Feature Branch**: `030-events-timeline`

**Created**: 2026-07-28

**Status**: Draft

**Input**: Approved mockup `specs/030-events-timeline/mockup.html` (revision 3), plus the
three decisions taken during its review: the view toggle defaults to **All**, the row
**unfold** stays, the **year track** stays; the month cap is removed; `events.date` is
**renamed** to `start_date`; rental pricing by duration is **out of scope**.

## Why this slice exists

Two problems, and the second was found while drawing the fix for the first.

**The Events page is a grid of identical boxes in creation order.** It is the last surface
that never converged (design/audit.md A6 exempted it under P1, correctly, as a list of
genuinely independent objects — which settled the *frame* and never asked what the page is
*for*). Finding one show among a hundred is what the page is for, and creation order
answers neither *which is next* nor *where is last year's file for this festival*.

**An event is assumed to be one day.** There is one `date` column. A festival that runs
Friday to Sunday and rigs on Thursday is entered as Friday and remembered in the notes
field, where nothing derives from it. This produces a live defect: an event is treated as
past the moment its single date is behind today, so a multi-day show **disappears from the
dashboard on its second morning** — while the user is standing in the venue working it.

Giving events length also makes two events able to collide on days no stored value
currently mentions, so the timeline has to say when they do.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record what an event actually occupies (Priority: P1)

A user planning a festival records four dates: when they load in, the first show day, the
last show day, and when they load out. A user planning an evening gig records one date and
leaves the rest empty, and the event means exactly what it meant before.

**Why this priority**: Every other story in this slice reads these values. It is also the
story that repairs the disappearing-event defect, which is a correctness bug independent of
any redesign.

**Independent Test**: Create an event with only a first day and confirm it behaves exactly
as events behave today. Create a second event with all four dates, reopen it, and confirm
the values persisted and the derived spans are stated back correctly.

**Acceptance Scenarios**:

1. **Given** a new event form, **When** the user enters only a first day and saves, **Then**
   the event is a one-day event whose load-in, last day and load-out all resolve to that day.
2. **Given** a new event form, **When** the user enters load-in 2026-09-17, first day
   2026-09-18, last day 2026-09-20 and load-out 2026-09-21, **Then** the form states
   `5 days on site` and `3 show days` before saving, and both survive a reload.
3. **Given** an event being edited, **When** the user enters a last day earlier than the
   first day, **Then** the save is rejected with a message naming which two dates are in the
   wrong order, and no value is stored.
4. **Given** an existing event created before this feature, **When** any surface displays it,
   **Then** it renders identically to how it rendered before, with no empty date labels and
   no `—` where a date used to be.
5. **Given** a three-day event whose middle day is today, **When** the user opens the
   dashboard, **Then** the event is presented as the current show — not as past, and not
   absent.

---

### User Story 2 - Find any show on a timeline (Priority: P2)

A user opens Events and sees every show they have, oldest at the top and newest at the
bottom, grouped by year and month, with today marked. They can narrow to what is coming or
what is done, and search by name, venue or notes.

**Why this priority**: This is the page redesign, and it is the reason the slice exists. It
depends on Story 1 only for how a multi-day row is drawn; it is otherwise independent.

**Independent Test**: With a mixed set of past, future, running and undated events, confirm
the ordering, the grouping, the today marker, the toggle and the search each behave as
specified without opening any event.

**Acceptance Scenarios**:

1. **Given** events across several years, **When** the user opens Events, **Then** rows are
   ordered oldest-first by first day, grouped under year and month headings, with undated
   events last under their own heading.
2. **Given** a mix of past and future events, **When** the page opens, **Then** the view is
   All, a today marker separates past from future, and the view is positioned at that marker.
3. **Given** the All view, **When** the user selects Upcoming or Past, **Then** only events
   in that tense are listed, and the counts stated by the page agree with what is listed.
4. **Given** any view, **When** the user types into search, **Then** only events whose name,
   venue or notes match remain, and an unmatched search states that nothing matched and what
   search covers.
5. **Given** an event that is neither past nor undated and is the soonest, **When** the page
   renders, **Then** exactly one row is marked as the next show.
6. **Given** an event spanning more than one day, **When** the page renders, **Then** its row
   states the range and is visibly distinguishable from a one-day row by more than colour.
7. **Given** an event whose on-site span differs from its show span, **When** the page
   renders, **Then** the row additionally states the on-site range; otherwise it does not.

---

### User Story 3 - See whether a show needs work without opening it (Priority: P3)

A user clicks a row and it opens in place, showing the shape of that show's rig, its key
counts, and each area's readiness verdict, then closes again or leads into the event.

**Why this priority**: It is what makes the page worth visiting rather than passing
through, but the page is complete and useful without it.

**Independent Test**: Click a row, confirm the summary appears with values that match the
event's own tabs, click another row and confirm the first closes.

**Acceptance Scenarios**:

1. **Given** the timeline, **When** the user opens a row, **Then** a summary appears directly
   beneath that row and no other row's summary is open.
2. **Given** an open row, **When** the user compares its counts and verdicts with the event's
   own tabs, **Then** they agree.
3. **Given** an open row for an event with no lighting, **When** the summary renders,
   **Then** no fixtures figure is drawn rather than a figure of zero.
4. **Given** an open row, **When** the user chooses to open the show, **Then** they arrive at
   that event.
5. **Given** a closed row, **When** it has never been opened, **Then** no data beyond the
   event list has been requested for it.

---

### User Story 4 - See a whole year at a glance (Priority: P3)

A user looks at one strip above the list and sees every event in a year placed on a
calendar scale, how long each one is, where today falls, and where two of them collide.

**Why this priority**: It answers a question about the year rather than about an event, and
nothing else in the application answers it. It is not required for the page to function.

**Independent Test**: With events of varying lengths across one year, confirm each is drawn
once, in the right place, at the right relative width, with collisions visibly separated.

**Acceptance Scenarios**:

1. **Given** a year with events, **When** the track renders, **Then** every event in that
   year is drawn exactly once — none aggregated, none omitted, no maximum.
2. **Given** two events occupying the same days, **When** the track renders, **Then** they are
   drawn on separate rows within the track rather than on top of each other.
3. **Given** the track, **When** the user points at a mark, **Then** its dates and name are
   available without navigating.
4. **Given** an active search, **When** the track renders, **Then** it shows only matching
   events.
5. **Given** the track, **When** the user selects a mark, **Then** the list moves to that
   event.
6. **Given** a year with no adjacent year containing events, **When** the track renders,
   **Then** the step control toward the empty side is not offered.

---

### User Story 5 - Be told when two shows collide (Priority: P2)

A user scanning the timeline sees that two of their events share days — including the case
where the shows themselves do not overlap but the load-in for one lands on the other.

**Why this priority**: It is the payoff for recording load-in, and it is information that
is currently impossible to obtain from the tool at all. It ranks above the unfold because
it prevents a real scheduling mistake.

**Independent Test**: Create two events with intersecting show days, and two whose show
days do not intersect but whose on-site spans do; confirm each pair is marked, marked
differently, and that neither was blocked at save time.

**Acceptance Scenarios**:

1. **Given** two events whose show spans intersect, **When** the timeline renders, **Then**
   both rows are joined visually and both state that they overlap.
2. **Given** two events whose show spans do not intersect but whose on-site spans do,
   **When** the timeline renders, **Then** both rows are joined visually and both state that
   it is an on-site clash.
3. **Given** two events that do not share any on-site day, **When** the timeline renders,
   **Then** neither is marked.
4. **Given** an event being saved that would collide with an existing one, **When** the user
   saves, **Then** the save succeeds and nothing warns, refuses, or asks for confirmation.
5. **Given** colliding events, **When** the page states its totals, **Then** it states how
   many colliding pairs exist.
6. **Given** a colliding event on which the user is not the owner, **When** the timeline
   renders, **Then** it is marked exactly as an owned event is, alongside its role.

---

### Edge Cases

- **An event with no dates at all.** Listed last, under its own heading, with a dash where a
  date would be. It is never the next show, never running, never past, and never collides.
- **A span that crosses a month or a year.** Files under its first show day. The row states
  the months instead of the weekdays when the span crosses a month.
- **Load-in on the same day as the first show.** No on-site range is stated: there is nothing
  to say.
- **Today is the load-in day.** The event counts as current, not upcoming.
- **A one-day event.** Draws the same mark shape it always did, and the summary states its
  length as one day rather than omitting the figure — one day is declared, not undeclared.
- **Three or more events on the same days.** All are joined and marked; the track gives each
  its own row.
- **An event whose end is before its start**, arriving from any source. Rejected with a
  message naming the offending pair; nothing partial is stored.
- **An unmatched search.** States that nothing matched, and what search covers, without
  losing the search text.
- **No events at all.** States what to do and offers the control that does it, without a
  track, a toggle or a search to operate on nothing.
- **A user who cannot create events.** Sees the page in full, including every event they can
  read, with no create control present.
- **Reduced-motion preference.** Every transition on this page is suppressed; nothing is
  lost but the transition.

## Requirements *(mandatory)*

### Functional Requirements

**Event dates**

- **FR-001**: An event MUST carry four optional dates — load-in, first show day, last show
  day, load-out — of which any may be absent.
- **FR-002**: An absent date MUST derive from its neighbour: load-in from the first day, last
  day from the first day, load-out from the last day. An event with only a first day is
  therefore one day long and occupies the site for one day.
- **FR-003**: The system MUST reject any event whose dates are not in the order load-in ≤
  first day ≤ last day ≤ load-out, and the rejection MUST name which two dates are wrong.
  Nothing partial may be stored.
- **FR-004**: Every existing event MUST retain its meaning without alteration: its single
  date becomes its first show day and every other date derives from it.
- **FR-005**: The stored name of an event's first date MUST be `start_date`, and the value
  the API exchanges MUST be named `startDate`. The rename MUST be delivered as its own
  commit, separately from the addition of the other three dates.
- **FR-006**: Both the create form and the edit form MUST present the four dates as one
  object, with each empty field stating in place what it defaults to, and MUST state the two
  derived durations — days on site and show days — before the user saves.

**Consequences of length**

- **FR-007**: An event MUST be treated as past only when its last on-site day is before
  today; as current when today falls anywhere within its on-site span; and as upcoming
  otherwise.
- **FR-008**: Where the application presents "the show you are on", a current event MUST take
  precedence over the soonest upcoming one.
- **FR-009**: A countdown described to the user as counting to load-in MUST count to the
  load-in date.
- **FR-010**: An event that is currently happening MUST state which day of how many it is on;
  on its load-in day it MUST state that instead.
- **FR-011**: Every surface that presents an event's date MUST present its full show range,
  from one shared derivation, so that no two surfaces can disagree about it.

**The timeline**

- **FR-012**: Events MUST be presented as one bordered surface containing a bar, the list,
  and a closing strip — not as a grid of separate cards.
- **FR-013**: The bar MUST carry, in order: the surface title, a three-way tense filter, a
  search field, and the single primary action.
- **FR-014**: The tense filter MUST default to All and MUST offer Upcoming and Past.
- **FR-015**: Search MUST match on name, venue and notes, and MUST apply to everything the
  page draws, including the year track.
- **FR-016**: Rows MUST be ordered by first show day, oldest first, grouped under year and
  then month headings, with undated events last under their own heading.
- **FR-017**: A marker MUST separate past from future, MUST be labelled in words as well as
  by colour, and MUST be where the page is positioned when it opens.
- **FR-018**: Exactly one row MUST be marked as the next show, and it MUST be the same event
  the dashboard presents as next.
- **FR-019**: A past row MUST remain present and legible, distinguished from a future row
  without being removed.
- **FR-020**: A row MUST state its dates, name, venue, its role when the user is not the
  owner, and how far away it is. It MUST NOT state its notes.
- **FR-021**: A multi-day row MUST be distinguishable from a one-day row by shape, not by
  colour alone.
- **FR-022**: A row whose on-site span differs from its show span MUST additionally state the
  on-site range; a row where they are the same MUST NOT.

**Opening a row**

- **FR-023**: Selecting a row MUST open a summary directly beneath it, and at most one may be
  open at a time.
- **FR-024**: The summary MUST present the event's rig as the application draws it elsewhere,
  its key counts including its length, each area's readiness verdict, its notes, and a way
  into the event.
- **FR-025**: The summary's counts and verdicts MUST be the same derivations the event's own
  tabs use, so they cannot disagree with them.
- **FR-026**: A count that has never been declared MUST be shown as undeclared, never as zero.
- **FR-027**: No data beyond the event list may be requested for a row that has not been
  opened, and no new server endpoint may be introduced to serve the summary.

**The year track**

- **FR-028**: The track MUST draw every event of the selected year individually, positioned
  on a calendar scale and sized by its on-site span. No event may be aggregated, capped or
  omitted.
- **FR-029**: Events occupying the same days MUST be drawn on separate rows within the track.
- **FR-030**: Each mark MUST make its dates and name available without navigation, and MUST be
  large enough to select even for a one-day event.
- **FR-031**: The track MUST mark today, and MUST mark it in more than one way.
- **FR-032**: Selecting a mark MUST move the list to that event.
- **FR-033**: The track MUST offer a step to another year only when that year contains events.

**Collisions**

- **FR-034**: Collisions MUST be derived from the on-site spans and never stored.
- **FR-035**: A collision MUST be named as an overlap when the show spans intersect, and as an
  on-site clash when only the on-site spans do.
- **FR-036**: Colliding rows MUST be joined visually and MUST each state the collision in
  words as well as by colour.
- **FR-037**: A collision MUST never block, warn on, or require confirmation of a save, and
  MUST never be presented in the colour reserved for destructive and over-capacity states.
- **FR-038**: The closing strip MUST state how many colliding pairs there are, alongside the
  totals for the whole account.
- **FR-039**: A collision MUST be presented identically regardless of the user's role in
  either event.

**Presentation rules**

- **FR-040**: This surface MUST follow the navigation density tier and the project's design
  language as recorded in `design/`.
- **FR-041**: The opening of a row MAY animate; the animation MUST be suppressed under a
  reduced-motion preference. No other motion may be introduced, and the signal-flow pulse
  MUST NOT appear on this page.
- **FR-042**: A user who cannot create events MUST see no create control, rather than a
  disabled one. All events they can read MUST remain visible to them.
- **FR-043**: On small screens the list MUST retain its existing row treatment, and MUST gain
  the month headings, the today marker, the date range, the current-show statement and the
  collision wording. The track, the date gutter and the summary are not presented there.
- **FR-044**: `design/` MUST be updated in this slice to record the new surface pattern, the
  newly sanctioned motion, and the colour rule for a collision.

### Key Entities

- **Event**: gains three optional dates around the one it already had — a load-in date before
  the first show day, a last show day, and a load-out date after it. Any absent date derives
  from its neighbour. Nothing about a collision is stored on an event; a collision is a
  relationship computed between events on demand.
- **On-site span**: the derived period from load-in to load-out. It is what determines whether
  an event is past, current or upcoming, and what two events are compared on to find a
  collision.
- **Show span**: the derived period from first to last show day. It is what identifies an
  event to a reader and what distinguishes an overlap from an on-site clash.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A multi-day event remains presented as the current show on every day it runs,
  including its load-in day and its last day — the defect this slice repairs is verifiable by
  putting the clock inside the span.
- **SC-002**: A user can locate a named past event from a list of forty without using search,
  by scrolling to its month — a task that currently requires reading every card.
- **SC-003**: At least twice as many events are visible on one screen as before, with the
  month and year of each visible without hovering or opening anything.
- **SC-004**: A user can tell whether a show still needs work — routed, addressed, within
  budget — without leaving the list.
- **SC-005**: Two events that share on-site days are identified as such the first time the
  list is drawn, with no action from the user, including when their show days do not touch.
- **SC-006**: Every event that existed before this change is displayed and edited without
  alteration, and no stored value is lost or reinterpreted.
- **SC-007**: Opening the page requests no more data per event than it does today; the extra
  detail for one event is requested only when that event is opened.
- **SC-008**: Every count, verdict and date the page states matches what the event's own tabs
  state for the same event.

## Assumptions

- **Dates are whole days, without times or time zones.** Every date in the system is a
  calendar day, as it is today. A show that runs past midnight is one show day.
- **Load-out defaults to the last show day, not the morning after.** Striking on the night is
  the common case; a user who leaves the next day says so.
- **The year track's scale is the calendar year**, not the range of the user's events, so two
  years can be compared by eye.
- **A one-day minimum size for a mark on the track** is acceptable as the single place the
  track is not to scale, since the alternative is a mark too small to select.
- **The dashboard keeps its own list.** It answers *what is next*; this page answers *where is
  that show*. The overlap is intentional and the dashboard's dated rows are unchanged by this
  slice apart from date formatting and the current-show precedence.
- **Rental pricing does not change.** The order continues to quote a five-day hire as it
  quotes a one-day hire. This is a pricing model rather than a date field, is now visibly
  wrong rather than merely unknown, and is specified as the next slice.
- **No crew or personnel model is introduced.** A collision is between two events, not between
  two commitments of a person. The application has no record of who is working which show and
  this slice does not invent one.
- **The existing event list endpoint already returns everything the timeline needs** apart
  from the new dates; no new endpoint is required by any part of this slice.
