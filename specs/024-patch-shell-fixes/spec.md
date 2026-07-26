# Feature Specification: Audio patch shell, second pass

**Feature Branch**: `024-patch-shell-fixes`

**Created**: 2026-07-26

**Status**: Draft

**Input**: Field test of Slice 23 by the event planner who uses the app. Four defects, reported in their own words as items 1–4. This spec keeps their numbering visible in each story title so the report and the work can be matched up, but orders the stories by severity rather than by the order they were written.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A channel keeps the desk it belongs to (Priority: P1) — reporter's item 2

A planner opens an existing event, names the desk it is booked on, and then adds and names a channel in the sheet. They expect that channel to appear on that desk in the graph, alongside the channels that were already there.

Instead the channel detaches from the desk. The graph grows a second, nameless box holding just that one channel, and that box lands on top of the desk box where it cannot be moved out of the way — so it hides the desk's own strips and the stage boxes behind it.

**Why this priority**: This is silent loss of information the planner entered, and it gets worse the more they work: every channel they touch in the sheet falls off the desk. It also makes the graph progressively unreadable, and the covering box cannot be dragged away, so there is no way to work around it. Nothing else in this slice matters if the plan quietly comes apart while being edited.

**Independent Test**: On an event with one desk, edit and save an existing channel in the sheet, then switch to Flow. The channel must still be listed on the desk, and the graph must contain exactly one destination box. Repeat on the Outputs tab with an output row.

**Acceptance Scenarios**:

1. **Given** an event with one declared desk and channels assigned to it, **When** the planner edits any field of a channel in the sheet and saves, **Then** the channel is still on that desk.
2. **Given** an event with one declared desk, **When** the planner adds a channel from the toolbar and then renames it in the sheet, **Then** the channel belongs to that desk without the planner having to say so.
3. **Given** an event with two declared desks, **When** the planner picks a desk for a channel in the row editor and saves, **Then** that choice is kept, and saving other fields later does not change it.
4. **Given** an event whose only desk has been deleted, **When** the planner opens Flow, **Then** the channels that lost their desk are still shown and still patchable, in a box the planner can drag anywhere on the canvas.
5. **Given** any box on either graph, **When** the planner drags it, **Then** it moves — no box is fixed in place on top of another.
6. **Given** an event with one declared desk, **When** the planner edits and saves an output row on the Outputs tab, **Then** the output is still on that desk.

---

### User Story 2 - The desk's own sockets are a real destination (Priority: P2) — reporter's item 4

A desk has sockets on its own back panel. A planner wants to use them the way they use a stage box: run the talkback microphone straight into a local input, and send a matrix feed straight out of a local output to the amplifier rack next to the desk.

Today the desk's sockets are drawn but lead nowhere. On the Outputs graph a bus cannot be routed into a local output at all, so the sockets cannot be used. On the Inputs graph a cable can be run into a local input, but that input can never be connected on to a channel, so the signal stops there.

**Why this priority**: Reaching the desk directly is the whole reason the desk was added to the model in the previous slice, and it is one of the two cases that previously had to be faked with a fictitious stage box. It is a promised capability that cannot be used, so it ranks above the appearance problems — but below losing entered data.

**Independent Test**: Declare a desk with local inputs and local outputs. On the Inputs graph, run a source into a local input and then on to a channel, and confirm the sheet's chain column reads the whole path. On the Outputs graph, route a bus into a local output and then run a cable from it to a device.

**Acceptance Scenarios**:

1. **Given** a desk with local inputs declared, **When** the planner connects a source to a local input and that local input on to a channel, **Then** both connections are accepted and the channel's chain column reads source → local input → channel.
2. **Given** a desk with local outputs declared, **When** the planner routes a bus to a local output, **Then** the connection is accepted, and a cable can then be run from that local output to a device.
3. **Given** a bus that needs to reach an amplifier, **When** the planner chooses where to send it, **Then** the desk's local outputs and a stage box's sockets are offered and behave the same way, so either can be picked.
4. **Given** a run that goes through a desk's local socket, **When** the planner reads the rental order, **Then** the cable into or out of that socket is counted and the hop inside the desk is not — the same rule a stage box already follows.
5. **Given** a desk's sockets shown on a graph, **When** the planner drags them to a clearer position, **Then** the position is remembered per graph, so arranging the Inputs canvas does not disturb the Outputs canvas.
6. **Given** a desk with no local sockets declared, **When** the planner opens either graph, **Then** no empty socket box is drawn.

---

### User Story 3 - The Rig and Buses drawers are one usable design (Priority: P3) — reporter's item 1

A planner opens the Rig drawer at the start of a job to declare the desks, stage boxes, multicores and devices the event runs on. They expect one clear list per kind of equipment, each item stating what it is and how much of it is used, with fields appearing only when they choose to edit.

Instead the drawer shows sections carried over from the previous layout: stage boxes and multicores sit side by side in two narrow columns, which leaves their always-visible entry fields too cramped to type into, and every section presents adding and editing differently from every other and from the agreed design.

**Why this priority**: The fields being too narrow to use makes part of the drawer unusable, not merely untidy — but a planner can still declare equipment by widening the window, so it ranks below the two defects that lose data or block a capability outright.

**Independent Test**: Open the Rig drawer on either audio tab and declare one of each kind of equipment, then edit and delete each. Every section must read the same way, every field must be wide enough to type a full name into, and no section may sit beside another.

**Acceptance Scenarios**:

1. **Given** the Rig drawer, **When** the planner opens it, **Then** every section is full width and stacked one above the next, in signal order starting at the desk.
2. **Given** any section in either drawer, **When** the planner compares it to any other, **Then** the section heading, the add control, the shape of a listed item and the edit form follow the same pattern.
3. **Given** a listed piece of equipment, **When** the planner looks at it without editing, **Then** it reads as a single summary line — its name, the catalogue or owned item it stands for, its declared capacity, and how much of that capacity the patch is using — with no editable fields on show.
4. **Given** a listed piece of equipment, **When** the planner presses Edit, **Then** its fields appear beneath it, each wide enough to enter a full value, and no other item's fields are open at the same time.
5. **Given** the planner wants to add equipment, **When** they press the section's add control, **Then** a single row of fields appears with the same look as the edit form, and confirming it adds the item.
6. **Given** a desk in the drawer, **When** the patch uses more channels or outputs than the desk was declared to have, **Then** that is stated on the desk's line as a warning rather than passing silently.
7. **Given** a planner with a read-only role, **When** they open either drawer, **Then** no add, edit or delete control is present at all.

---

### User Story 4 - The sheet's row editor matches the agreed design (Priority: P4) — reporter's item 3

A planner clicks a channel row in the sheet to change its name, its tape colour or its bus membership. They expect a compact strip of fields that uses the width of the sheet, a clearly labelled way to save, an obvious way to delete, and a way to jump to the graph when what they actually need to change is where the signal comes from.

Instead the editor lays its fields out on a rigid grid that wastes the row's width, the save button's label sits hard against its own edge, the delete control is an icon stretched out of shape, and there is no way to get to the graph from the editor.

**Why this priority**: Everything here is reachable and works; it is friction and a visibly broken control on a surface the planner uses constantly. Worth fixing in the same pass, after the three defects that cost data, capability or usability.

**Independent Test**: Open a row editor on each audio tab. Confirm the fields flow across the available width, the save and delete controls read as words and are correctly proportioned, and the jump to the graph opens the graph with the same row's source selected.

**Acceptance Scenarios**:

1. **Given** an open row editor, **When** the planner looks at it, **Then** its fields run across the width of the sheet and wrap onto another line only when they run out of room.
2. **Given** an open row editor, **When** the planner looks at the row it belongs to, **Then** the two read as one block, visibly attached to each other and marked as the row being edited.
3. **Given** an open row editor, **When** the planner reads the save and delete controls, **Then** both are labelled in words, neither label touches its own edge, and delete is distinguished by colour.
4. **Given** an open row editor, **When** the planner chooses to change where the signal comes from, **Then** they can move to the graph from inside the editor with that row's own source already selected.
5. **Given** an open row editor, **When** the planner presses the discard key or the save shortcut, **Then** the behaviour is unchanged from before.

---

### Edge Cases

- A channel or output is assigned to a desk, and that desk is then deleted: the row keeps existing and shows as belonging to no desk, and remains fully editable and patchable.
- An event has several desks and a row belongs to none of them: the row must not be silently attached to one of them, because guessing which desk a monitor feed is on would put wrong information on a printed sheet.
- An event has several desks: adding a row cannot pick one for the planner, so the row starts with no desk and the planner is offered the choice.
- A desk's local socket count is reduced below what the patch already uses: refused, naming the connections that conflict — the rule already applied to stage boxes.
- A desk's sockets are dragged, then the desk is deleted: the sockets box disappears with it and any cable to or from it is cleared, with the count stated in the confirmation.
- Two desks are declared: each has its own sockets box on each graph, independently placed, and their sockets cannot be confused for one another.
- A search term is typed while a drawer is open: the drawer is unaffected — it lists equipment, not patch rows.
- The window is narrow: the drawer stays usable, its sections still full width, and the sheet behind it does not shift.

## Requirements *(mandatory)*

### Functional Requirements

**Desk assignment (US1)**

- **FR-001**: Saving any change to a channel or output row MUST leave which desk it belongs to exactly as it was, unless the planner changed that themselves.
- **FR-002**: When an event has exactly one desk, a channel or output that belongs to no desk MUST be attached to it, on creation and on every later save, so a single-desk event can never accumulate deskless rows.
- **FR-003**: When an event has no desk or more than one, a row that belongs to no desk MUST stay that way; the system MUST NOT choose a desk on the planner's behalf.
- **FR-004**: The row editor MUST offer a desk choice whenever the event has more than one desk, and that choice MUST be saved together with the rest of the row rather than taking effect on its own.
- **FR-005**: Rows belonging to no desk MUST still be shown on the graph, in a box of their own, and that box MUST be draggable like every other box.
- **FR-006**: Every box on either graph MUST be draggable. A box whose position cannot be stored MUST still move for the duration of the session.
- **FR-007**: The box holding deskless rows MUST NOT be placed where it overlaps a desk box when the canvas first opens.

**The desk's own sockets (US2)**

- **FR-008**: A desk's local sockets MUST be drawn as a box of their own on each graph, separate from the desk's channel strips or bus list, and MUST be positionable anywhere in the same area of the canvas that stage boxes occupy.
- **FR-009**: That box MUST have two sides — the side signal arrives on and the side it leaves from — presented the same way a stage box presents its two sides, so the two are visibly interchangeable.
- **FR-010**: On the input graph, a source MUST be connectable to a local socket, and that same socket MUST be connectable on to a channel.
- **FR-011**: On the output graph, a bus MUST be routable into a local socket, and that same socket MUST be connectable on to a device or other destination.
- **FR-012**: Which hop counts as a physical cable and which as routing inside the desk MUST follow the rule a stage box already follows, so the rental order counts the same number of cables for either choice.
- **FR-013**: The position of a desk's socket box MUST be stored separately for the input graph and the output graph.
- **FR-014**: A desk with no local sockets declared MUST NOT produce a socket box on either graph.
- **FR-015**: A desk's socket box MUST be identifiable as belonging to that desk when several desks are declared.
- **FR-016**: A chain that passes through a local socket MUST read as its own hop on the sheet and on the printed sheets, naming the desk and the socket.

**Drawer design language (US3)**

- **FR-017**: The Rig and Buses drawers MUST present every section in one shared pattern: a heading with a count and an add control, a list of items, and an add form.
- **FR-018**: Sections MUST be stacked full width. No section may be placed beside another.
- **FR-019**: A listed item MUST read as a summary line when not being edited: its name, what catalogue or owned item it stands for, its declared capacity, and how much of that capacity the patch uses.
- **FR-020**: An item's fields MUST appear only when the planner chooses to edit it, and at most one item per section may be open for editing.
- **FR-021**: At the drawer's default width, every field MUST show the whole of the value it holds without the planner scrolling inside it — checked by entering the longest name in the catalogue and reading it back.
- **FR-022**: A desk's line MUST show its usage against its declared capacity, and MUST mark it as a warning when the patch has outgrown it. A capacity left undeclared MUST NOT warn.
- **FR-023**: Deleting an item MUST state what else it would remove, and MUST require confirmation.
- **FR-024**: Reducing a declared count below what the patch already uses MUST be refused, naming what conflicts.
- **FR-025**: For a read-only role, add, edit and delete controls MUST be absent from the drawer, not merely disabled or refused on use.
- **FR-026**: The drawer footer MUST state how many of the listed items become lines on the rental order.

**Sheet row editor (US4)**

- **FR-027**: The row editor MUST lay its fields out in a single flowing row that uses the sheet's full width and wraps only when needed, rather than on a fixed grid.
- **FR-028**: The row editor MUST read as attached to the row it belongs to, and that row MUST be marked as the one being edited.
- **FR-029**: Save and delete MUST both be labelled in words, sized so no label touches its own edge, with delete distinguished by colour and separated from save.
- **FR-030**: The row editor MUST offer a way to move to the graph with that row's own signal source selected.
- **FR-031**: The discard key and the save-and-advance shortcut MUST behave as they did before.
- **FR-032**: Both audio tabs' row editors MUST follow the same pattern.

**Applies throughout**

- **FR-033**: No change to the mobile layouts.
- **FR-034**: Existing events MUST keep working without the planner doing anything: no desk, channel, output, cable or position may be lost.

### Key Entities

- **Desk socket panel placement**: where a desk's own sockets are drawn, held once per desk per graph, so the planner can arrange the input canvas and the output canvas independently. New information; everything else in this slice is behaviour or appearance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Editing and saving every channel on an event with one desk leaves all of them on that desk — zero rows detach.
- **SC-002**: After an editing session of any length, the number of destination boxes on the input graph equals the number of declared desks, plus one only if rows genuinely belong to no desk.
- **SC-003**: Every box on both graphs can be dragged to a new position; none is fixed in place.
- **SC-004**: A planner can take a talkback microphone from the stage into a channel through the desk's own socket, with no stage box declared, and the sheet states the whole path on one line.
- **SC-005**: A planner can send a bus to an amplifier through the desk's own socket, and the rental order lists the same number of cables as the equivalent route through a stage box.
- **SC-006**: Arranging one graph never changes the other graph's arrangement.
- **SC-007**: Every section of both drawers can be operated — add, edit, delete — at the drawer's normal width, without resizing the window.
- **SC-008**: Shown the drawer with its headings covered, a planner cannot tell which sections are new and which were carried over: all sections share one pattern.
- **SC-009**: Reading a listed piece of equipment answers "is this big enough?" without opening anything.
- **SC-010**: No control label is clipped or touching its own edge anywhere in the drawers or the row editors.
- **SC-011**: From an open row editor, reaching the graph with that row's source selected takes one click.
- **SC-012**: Opening an event created before this change shows the same desks, channels, outputs, cables and canvas arrangement as before.

## Assumptions

- The mockup approved for Slice 23 ("Audio tabs — Sheet + Flow, in detail") is the authority for layout, hierarchy and the design language. Its absolute pixel sizes are read as proportions, because the mockup renders the whole application scaled down inside a page; the proportions and the roles of each type style are what carry over.
- Applying this design language to the rest of the application, including the typeface, is explicitly a later slice — the reporter said so. This slice covers the two audio tabs and the shared controls it needs to introduce, and leaves the rest of the application looking as it does now.
- The reporter's phrase "the trash can icon stretches the entire height of the entire table" is read as: the delete control in the row editor is wrongly proportioned. It is replaced by a labelled control, which removes the symptom regardless of its exact cause.
- Making a desk's sockets their own box on the canvas is the reporter's own suggested fix, chosen over drawing both sides of the socket inside the desk box, because a connection between two ports of the same box would have to loop back across that box to be drawn at all.
- A desk's socket box is placed in the same part of the canvas as stage boxes, because that is where the planner already looks for something that signal passes through.
- Existing desks get a starting position for their socket box rather than being left at the canvas origin, so nothing opens stacked underneath another box.
- No new outside dependency. No change to the connection rules, to how the rental order is calculated, or to any mobile code path.
- The single-desk case stays the case that needs no decisions from the planner; the multi-desk case stays the one where they are asked.

## Out of Scope

- The rest of the application's appearance — the start page, the overview, lighting, stage plots, equipment, the rental order and settings keep the look they have now. Carrying this design language and a chosen typeface across all of them is a slice of its own.
- The printed sheets' layout. They gain the local-socket hop because they render the same chain the screen does, and nothing else about them changes.
- The mobile layouts, which do not use the drawers, the sheet or the graphs.
- Any change to what a connection is allowed to join to, or to how the rental order is totalled. The desk's sockets already follow the stage box's rules; this slice makes them reachable, it does not change the rules.
- Jack-level repatching from the sheet. Deciding where a signal runs stays a thing done in Flow, as it was decided in the previous slice.
- Moving a desk's channel strips or bus list out of their lane. Only the sockets become a separately placed box.
