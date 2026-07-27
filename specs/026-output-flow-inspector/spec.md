# Feature Specification: An inspector for the audio outputs flow graph

**Feature Branch**: `026-output-flow-inspector`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "In the audio outputs flow graph there are no inspector panels. I want an inspector panel there as well. Just like in audio inputs. We can start with an inspector pane for the output (console rail) since they map to the rows in the sheet. I want to be able to edit the outputs in both sheet and flow view. Reuse the same styling as in audio inputs"

## Context

The two audio tabs are meant to be the same surface read in two directions, and
each offers the same two views — a Sheet and a Flow graph. On the **inputs** side
those two views are equally capable: a source can be edited from the sheet's
inline row editor *or* from the flow graph's inspector rail, whichever the
planner is already looking at.

On the **outputs** side the Flow view is read-only in practice. Selecting a box
there marks it with an amber border and does nothing else, because that graph has
no inspector at all. Every output field — its name, type, width, tape colour,
desk and notes — can be changed only by switching back to the Sheet, finding the
row, and opening it. A planner who is in the Flow view because that is where the
routing is visible has to leave it to rename the bus they are looking at.

This slice gives the outputs Flow view the inspector its sibling already has,
starting with the entity that maps one-to-one onto the sheet's rows: the output
itself.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit an output without leaving the Flow view (Priority: P1)

A planner is in the outputs Flow view, tracing where a monitor send lands. They
see the bus is still called "Out 4". They click its row in the desk's bus list; an
inspector rail opens on the right holding that output's name, type, width, tape
colour, desk and notes. They rename it "Wedge SL", change its type to `monitor`
and give it a green tape — without switching views. The graph updates as they go:
the row's label changes, and the run's colour follows the new tape.

**Why this priority**: This is the request. It is also the whole of the value —
the outputs Flow view goes from a picture you can only look at to a view you can
work in, and it closes the last gap between the two tabs' Flow views.

**Independent Test**: Open an event's Audio Outputs tab, switch to Flow, click an
output row in a desk's bus list, change every field in the rail, then switch to
the Sheet and confirm the row shows the same values. Delivers the whole feature on
its own.

**Acceptance Scenarios**:

1. **Given** an event with a desk carrying output rows, **When** the planner
   clicks an output's row label in the desk's bus list, **Then** an inspector rail
   opens showing that output, headed by its number and name.
2. **Given** the rail is open on an output, **When** the planner edits its name,
   type, width, tape colour, desk or notes, **Then** the change is saved and the
   canvas reflects it immediately — the row's label, and the colour of every run
   the output feeds.
3. **Given** the rail is open on an output, **When** the planner reads it,
   **Then** it states where that output lands (the destinations its runs reach), or
   says plainly that it is not patched.
4. **Given** the rail is open on an output, **When** the planner chooses
   Duplicate, **Then** a copy of that output is added to the same desk with the
   next free output number, and the rail follows to the copy.
5. **Given** the rail is open on an output, **When** the planner chooses Delete
   and confirms, **Then** the output and any cable leaving it are removed and the
   rail closes.
6. **Given** an event with outputs belonging to no desk, **When** the planner
   clicks one of those rows in the "No desk" box, **Then** the rail opens on it
   exactly as it does for a desk's own output.
7. **Given** the rail is open on an output, **When** the planner clicks that
   output's **port dot** rather than its row label, **Then** a cable connection
   starts as it always has, and the rail is left alone.

---

### User Story 2 - The rail is never blank for a box you can select (Priority: P2)

The planner clicks a stagebox on the outputs canvas. The rail opens showing the
stagebox's name and a note that rig gear is declared in the Rig drawer — the same
thing the inputs rail says when a non-source box is selected. Clicking a stage
multi, an output device or a desk's local jack panel does the same.

**Why this priority**: Without it, selecting a box behaves differently depending
on which box you picked — the rail appears for an output and nothing appears for a
stagebox, which reads as a bug rather than as a boundary. It is also what makes
the two canvases behave identically, which is the thing the previous two slices
were spent on.

**Independent Test**: Click each kind of box on the outputs canvas in turn and
confirm the rail opens every time, naming what was clicked, with no editable
fields for gear.

**Acceptance Scenarios**:

1. **Given** the outputs Flow view, **When** the planner selects a stagebox,
   stage multi, output device or a desk's local jack panel, **Then** the rail opens
   naming that box and pointing at the Rig drawer for its fields.
2. **Given** the rail is open on any box, **When** the planner closes it, **Then**
   the rail disappears, the box is no longer marked, and the canvas reclaims the
   width.
3. **Given** the rail is open, **When** the planner reads its legend, **Then** the
   line styles shown are the ones this canvas actually draws — and the legend does
   not mention phantom power, which no output carries.

---

### User Story 3 - One rail, not two look-alikes (Priority: P3)

The planner cannot tell the outputs rail from the inputs rail except by what it
holds. Its frame, its label-beside-field rows, its bordered notes and its legend
are the same ones, because they are literally the same components.

**Why this priority**: It is the difference between the two rails looking alike
today and staying alike. The two flow canvases each held their own copy of the box,
the port and the row, and the field test could tell them apart — that duplication
is what the previous slice had to undo. Building a second rail by copying the first
would recreate exactly that.

**Independent Test**: Change a shared rail value (say the label column's width) in
one place and confirm both inspectors move together.

**Acceptance Scenarios**:

1. **Given** both tabs' Flow views, **When** the two rails are compared side by
   side, **Then** frame, spacing, label column, note boxes and typography are
   identical.
2. **Given** the shared rail components, **When** one of their style values is
   changed, **Then** both inspectors change with it.

---

### Edge Cases

- **An output on a desk that is then deleted** — the output survives with no desk
  and moves to the "No desk" box; the rail follows it there and still edits it.
- **The selected output is deleted from the Sheet in another tab, or by Delete in
  the rail itself** — the rail closes rather than showing a stale copy of a row
  that no longer exists.
- **An event with one desk** — the Desk field is absent, exactly as the sheet's
  Desk column is, because there is nothing to choose between.
- **An output with no desk while the event has none either** — the rail still
  opens, and the Desk field offers "no desk" plus nothing else.
- **A stereo output** — it draws two port dots (L and R), one per row; both belong
  to the same output, so clicking either row's label opens the same rail.
- **A very narrow window** — the rail takes a fixed width from the canvas, the
  same as on the inputs side; the canvas scrolls rather than the rail shrinking.
- **A read-only role** — every field renders disabled and Duplicate/Delete are
  absent; reading the patch is never restricted.
- **Search is active** — a row dimmed by search is still selectable, because a
  dimmed row is a row that exists.

## Requirements *(mandatory)*

### Functional Requirements

**The output inspector (US1)**

- **FR-001**: The outputs Flow view MUST offer an inspector rail beside the
  canvas, opening when something is selected and closing when nothing is.
- **FR-002**: Selecting an output row in a desk's bus list, or in the box holding
  outputs with no desk, MUST open the rail on that output.
- **FR-003**: The rail MUST hold every field the sheet's inline output editor
  holds: output number, name, type, width, tape colour, desk (only when the event
  has more than one) and notes.
- **FR-004**: Edits made in the rail MUST persist to the same output the sheet
  edits, so the two views never disagree about a row.
- **FR-005**: An edit MUST be reflected on the canvas without a reload — the row's
  label, and the colour of every run that output feeds.
- **FR-006**: The rail MUST state where the output lands, naming the destinations
  its runs reach, or saying plainly that it is not patched.
- **FR-007**: The rail MUST offer Duplicate, adding a copy of the output on the
  same desk at the next free output number, and moving the rail to the copy.
- **FR-008**: The rail MUST offer Delete, behind a confirmation that names what is
  being deleted and warns that cables leaving it go with it, and MUST close when
  the output is gone.
- **FR-009**: Selecting an output MUST be a click on the row's **label**; a click
  on the row's **port dot** MUST keep its existing meaning — starting, completing
  or inspecting a cable — and MUST NOT change what the rail shows.
- **FR-010**: A selected output's row MUST be marked on the canvas, so it is
  visible which row the rail is editing.

**The rail for every other box (US2)**

- **FR-011**: Selecting a stagebox, a stage multi, an output device or a desk's
  local jack panel MUST open the rail naming that box, with the note that rig gear
  is declared once per event in the Rig drawer.
- **FR-012**: The rail MUST carry a close control that clears the selection.
- **FR-013**: The rail's legend MUST show the line styles this canvas draws and
  MUST NOT include the phantom-power indicator, which exists only on the input
  side.

**One rail (US3)**

- **FR-014**: The rail's frame, header, field row, note box and legend MUST be
  shared components used by both tabs' inspectors, not two copies of the same
  values.
- **FR-015**: The inputs inspector MUST keep its current appearance and behaviour
  exactly — this slice extracts what it already draws and adds nothing to it.

**Access (cross-cutting)**

- **FR-016**: For a role that may not edit the event, the rail MUST render every
  field disabled and MUST NOT render Duplicate or Delete — hidden client-side, not
  merely refused by the server.

### Key Entities

- **Output**: a bus off a desk — number, name, type, width, tape colour, notes,
  and the desk it belongs to. Already exists; this slice adds no field to it.
- **Flow selection (outputs)**: what the outputs canvas currently has marked.
  Today it can only be a *box*; it must also be able to be a single *output row*,
  which is a finer thing than the box that draws it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every output field that can be edited in the Sheet view can also be
  edited in the Flow view — 7 of 7 fields, versus 0 of 7 today.
- **SC-002**: Renaming an output while looking at the flow graph takes no view
  switches, down from two (to the Sheet and back).
- **SC-003**: Every selectable box on the outputs canvas opens the rail — 5 of 5
  kinds (output, stagebox, stage multi, device, local jacks), versus 0 today.
- **SC-004**: The two tabs' inspectors share one implementation of the rail's
  frame, field row, note box and legend, so a change to any of those four values
  needs editing exactly one place.
- **SC-005**: An edit made in the rail is visible on the canvas within one
  refresh, with no reload and no view switch.
- **SC-006**: The inputs Flow view behaves exactly as it did before this slice —
  no field, action or note added, removed or moved.

## Assumptions

- **Fields save as they change**, one at a time, as the inputs rail's fields
  already do — no Save button in the rail. The sheet's inline editor keeps its
  explicit Save, because it edits a whole row at once and is driven by the
  keyboard; the rail edits one field at a time and is driven by the pointer.
- **Duplicate copies the row's own fields**, not its cabling — the same as
  duplicating a source, which copies the source and not its cables. A duplicated
  output starts unpatched.
- **The output number stays editable in the rail**, because the request was for
  every field the sheet's editor holds, and that includes the number.
- **Nothing is persisted about the selection.** It is where the planner is
  looking, not part of the plan, so it survives the view toggle within a session
  and is gone on reload — the same as the inputs side.
- **No inspector for the desk box itself, or for the "No desk" box.** Their
  contents are the output rows, each of which now has a rail of its own, and a
  desk's own fields belong to the Rig drawer. Selecting a box header is not part of
  this slice.
- **No backend change.** Outputs already have create, update and delete routes,
  and this slice adds no field to the row.
- **Desktop only**, as with the Flow view generally; the mobile audio tabs keep
  their own list-and-sheet editor.
