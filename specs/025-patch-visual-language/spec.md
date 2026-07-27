# Feature Specification: The mockup's visual language, for real

**Feature Branch**: `025-patch-visual-language`

**Created**: 2026-07-26

**Status**: Draft

**Input**: Second field test of the audio patch surface, by the event planner who uses the app. Five items, reported as 1–5. Two are things that do not work; three are the surface not having been built to the approved mockup, with the instruction that it "does not need to be pixel-perfect since the mockup is hardcoded, but layout, spacing, colours, fonts and everything else MUST follow it".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Getting to a channel's source takes one click (Priority: P1) — reporter's item 1

A planner is editing a channel in the sheet, realises the wrong microphone is on it, and presses **Edit in Flow**. They expect to land on the graph with that channel's source selected and its editor open, ready to change the mic.

Instead they land on the graph with nothing selected. The button changes the view and forgets which row they pressed it from, so they have to find the source in the rail by eye and click it — which on a festival patch means scrolling a list of thirty.

**Why this priority**: It is the one item here that makes a planner do work the app was supposed to do for them, and it gets worse the bigger the patch. The other four are either a colour that is missing or a surface that looks wrong; this one wastes the planner's time on every use.

**Independent Test**: Open a row editor on a channel that has a source, press Edit in Flow, and confirm the graph opens with that source's row highlighted and its editor showing its mic.

**Acceptance Scenarios**:

1. **Given** a channel with a source, **When** the planner presses Edit in Flow from its row editor, **Then** the graph opens with that source selected and its editor open on it.
2. **Given** the same, **When** the graph opens, **Then** the selected source is visibly marked in the rail, and scrolled into view if the rail is longer than the lane.
3. **Given** a hop clicked in the sheet's chain cell, **When** the planner chooses Edit in Flow from it, **Then** the graph opens with *that hop's* box selected, not the row's source.
4. **Given** the planner then switches back to the sheet and returns to the graph, **Then** what was selected is still selected — the selection belongs to the tab, not to one press of a button.
5. **Given** an output row on the Outputs tab, **When** the planner presses Edit in Flow, **Then** the graph opens with that run's first box selected.

---

### User Story 2 - Colour runs end to end on the outputs graph too (Priority: P2) — reporter's item 2

A planner gives each output a tape colour in the sheet — cyan for FOH, green for monitors — and switches to the graph expecting to follow each one by colour, the way they already can on the inputs graph.

Instead every port on the outputs graph is grey. The cables carry colour but the ports they attach to do not, so a run is only half-coloured and the desk's own list of outputs gives no clue which is which.

**Why this priority**: Colour is the graph's main answer to "where does this go?", and it works on one tab and not the other — which reads as the app being unfinished rather than as a preference. But nothing is unusable, so it comes after the click that costs real time.

**Independent Test**: Give three outputs distinct tape colours, patch each to a device, and confirm on the graph that every port along each run wears that output's colour, matching the inputs graph's behaviour.

**Acceptance Scenarios**:

1. **Given** an output with a tape colour patched to a device, **When** the planner opens the graph, **Then** every port along that run wears the output's colour — the desk's port, the pass-through's two ports, and the device's port.
2. **Given** an output with no colour set, **When** the planner opens the graph, **Then** its ports stay neutral rather than picking an arbitrary colour.
3. **Given** a port that cannot be traced back to an output, **Then** it stays neutral.
4. **Given** both graphs side by side, **When** the planner compares them, **Then** colour means the same thing and is drawn the same way on each.

---

### User Story 3 - The sheet looks like the mockup (Priority: P3) — reporter's item 3

A planner works from the sheet all day, and expects the dense, technical look of the approved mockup: a tight table under one toolbar, quiet mono headings, one line per row, the tape colour beside the name, and a status strip closing the panel.

Instead the table is roughly twice as tall per row as agreed, its headings are ordinary grey sentence-case, its zebra striping is heavy enough to read as a pattern rather than as an aid, the tape colour is a shadow on the number cell rather than a bar beside the name, the numbers do not line up in their columns, the chain reads as prose rather than as a signal path, and the toolbar, table and status strip are three separate rounded cards with gaps between them instead of one framed panel.

**Why this priority**: This is the surface the planner spends most time on, so it is the appearance item that matters most — but everything on it is legible and works today.

**Independent Test**: Put the sheet beside the mockup and compare: heading style, row height, striping, where the tape is, whether digits align, how a chain reads, and whether the toolbar/table/rail form one panel.

**Acceptance Scenarios**:

1. **Given** the sheet, **When** the planner looks at the toolbar, table and status strip, **Then** they form one bordered panel — the toolbar closing onto the table, the strip closing the bottom, no gaps and no separate rounded cards.
2. **Given** the table's headings, **Then** they are mono, uppercase, letter-spaced and quiet, on a ground darker than the rows.
3. **Given** any row, **Then** it is one line tall at the mockup's density, and consecutive rows are separated by a hairline with striping subtle enough to read as an aid rather than a pattern.
4. **Given** a row with a tape colour, **Then** the colour is a short vertical bar immediately before the name, not a shadow on another cell.
5. **Given** any column of numbers, **Then** the digits line up vertically.
6. **Given** a chain cell, **Then** it reads as a signal path: mono text, each hop marked as clickable, arrows between them quieter than the hops, and a hop through the desk's own socket distinguished by colour from a hop through rented gear.
7. **Given** the buses column, **Then** each bus is a small tinted pill at the mockup's size, not a full-size badge.
8. **Given** the status strip, **Then** it carries the state, the counts and the warnings on one quiet line, and takes a warning or an alarm tint when the patch has gaps or has outgrown the desk.

---

### User Story 4 - The flow canvas and its inspector look like the mockup (Priority: P3) — reporter's item 4

A planner switches to the graph and expects the mockup: three tinted lanes with quiet labels inside the canvas, the zoom control up in the toolbar with everything else, and an inspector rail down the right whose fields sit beside their labels, with what the source reaches and what the colours mean each in their own boxed note, and the destructive actions at the bottom out of the way.

Instead the lane labels sit above the canvas in a separate strip, the zoom control sits next to them rather than in the toolbar, the lanes are marked by dashed edges rather than tinted bands, and the inspector is a plain panel of stacked label-above-field pairs with the legend written out as sentences.

**Why this priority**: Same weight as the sheet's appearance — both are "make it what was agreed" — and they share the chrome, so they are worth doing together.

**Independent Test**: Put the graph beside the mockup and compare the lanes, the position of the zoom control, and every part of the inspector.

**Acceptance Scenarios**:

1. **Given** the graph, **Then** each lane is a tinted vertical band with its name in quiet mono type inside the canvas, at the top of its own band.
2. **Given** the toolbar, **Then** the zoom control lives in it with the other controls, and no separate strip sits between the toolbar and the canvas.
3. **Given** the graph and the sheet, **Then** both sit in the same framed panel, so switching view changes the content and nothing else.
4. **Given** a selected source, **Then** the inspector is a bordered rail on the right whose every field sits beside a short label in a fixed narrow column, not under it.
5. **Given** the inspector, **Then** what the source reaches, and what the colours and dash patterns mean, are each a bordered note; the legend shows actual line samples rather than describing them.
6. **Given** the inspector, **Then** Duplicate and Delete sit at the bottom of the rail, separated from the fields, with Delete distinguished by colour.
7. **Given** a planner with a read-only role, **Then** the inspector still reads — fields, what it reaches, the legend — with no way to change or delete anything.

---

### User Story 5 - The flow nodes look like the mockup, the sources rail above all (Priority: P4) — reporter's item 5

A planner reads the graph as boxes of ports. They expect the mockup's boxes: compact chrome, a name and a small badge, a footer stating usage, one row per jack with the incoming port on the left and the outgoing on the right, and a long list closing with a count of what is hidden rather than running off the canvas. And they expect the sources rail exactly as drawn: a full-height colour tape down each row, the name, the model in quiet mono, a red 48 V bar, the port flush right, a stereo source two slots tall with its two sides labelled, a count in the header, and the add button in the footer.

Instead the boxes' chrome is off, a pass-through box shows two independent columns of rows so its two sides do not line up as pairs, long lists run on, and the sources rail's rows differ from the mockup in most of their details.

**Why this priority**: Last because the graph is readable as it stands; this is the item the planner called out as looking most different, but it costs them nothing today.

**Independent Test**: Put each kind of box beside the mockup: a desk, a pass-through, a device, and the sources rail. Compare chrome, row anatomy, and how a long list ends.

**Acceptance Scenarios**:

1. **Given** any box on either graph, **Then** its corner radius, border, background, shadow, header size and weight, badge, and footer match the mockup, and are identical between the two graphs.
2. **Given** a pass-through box, **Then** each jack is one row with its incoming port on the left edge and its outgoing port on the right edge, so a pair reads across.
3. **Given** a box with more ports than fit, **Then** the list ends with a row stating how many are hidden.
4. **Given** a port, **Then** it is drawn at the mockup's size, hollow when nothing is patched, filled when patched, and in its run's colour when that run reaches a channel or comes from a coloured output.
5. **Given** the desk's box, **Then** it is distinguished from every other box, and its own sockets are separated from its channel or bus rows.
6. **Given** the sources rail, **Then** each row is: full-height colour tape, name, model in quiet mono, red 48 V bar when on, port flush right — at the mockup's row height.
7. **Given** a stereo source, **Then** its row is two port slots tall with its two sides stacked and labelled, each independently patchable.
8. **Given** the sources rail, **Then** its header states the count and its footer holds the add control.
9. **Given** a source selected in the rail, **Then** its row is marked, and its name reads stronger than the rest.

---

### Edge Cases

- A row whose chain is empty: Edit in Flow has nothing to select, so it is not offered.
- A source selected in the graph is then deleted: the selection clears rather than pointing at a row that no longer exists.
- A selected source is far down a long rail: it is scrolled into view, since a selection that cannot be seen is not a selection.
- An output has a colour but its run reaches nothing: the ports on that run stay neutral, matching the input side's rule that colour means the run is complete.
- Two runs of different colours meet at one port: the port stays neutral rather than picking one.
- A pass-through box declares zero jacks: no empty box, and no hidden-count row.
- A box has exactly one more port than fits: the hidden-count row says one, rather than being suppressed as not worth mentioning.
- The window is narrow: the framed panel and the inspector rail stay usable, and the table scrolls inside its own frame rather than pushing the page sideways.
- A row is being edited when the planner switches to the graph: the edit is saved, as it already is when another row is opened.

## Requirements *(mandatory)*

### Functional Requirements

**Selection (US1)**

- **FR-001**: The sheet MUST be able to open the graph with a chosen box already selected, and its editor open on it.
- **FR-002**: Which box is selected MUST belong to the tab and survive switching between the sheet and the graph in either direction.
- **FR-003**: Edit in Flow from a row editor MUST select the row's own signal source; from a chain hop it MUST select that hop's box.
- **FR-004**: A selected row in the sources rail MUST be scrolled into view when the graph opens.
- **FR-005**: Selecting a box that has since been deleted MUST clear the selection rather than showing an editor for nothing.
- **FR-006**: Edit in Flow MUST NOT be offered when there is nothing upstream to select.

**Colour on the outputs graph (US2)**

- **FR-007**: Every port on the outputs graph MUST carry the colour of the output whose run passes through it, derived by tracing back to that output.
- **FR-008**: A port that cannot be traced back to an output, or whose output has no colour, MUST stay neutral.
- **FR-009**: Colour MUST be derived, never stored per port, and MUST mean the same thing on both graphs.

**The sheet (US3)**

- **FR-010**: The toolbar, the content and the status strip MUST form one bordered panel, with the toolbar closing onto the content and the strip closing the panel.
- **FR-011**: The panel MUST be the same on both audio tabs and in both views, so switching view changes only what is inside it.
- **FR-012**: Table headings MUST be mono, uppercase, letter-spaced, quiet in colour, and on a ground darker than the rows.
- **FR-013**: A row MUST be one line tall at the mockup's density, separated by a hairline, with striping subtle enough not to read as a pattern.
- **FR-014**: A row's tape colour MUST be a short vertical bar immediately before its name.
- **FR-015**: Every numeric column MUST use tabular figures so digits align.
- **FR-016**: A chain cell MUST be mono; each hop MUST be marked as clickable; the arrows between hops MUST be quieter than the hops; and a hop through the desk's own socket MUST be distinguished by colour from a hop through rented gear.
- **FR-017**: Bus pills MUST be at the mockup's smaller size, distinct from the badges used elsewhere in the app.
- **FR-018**: The status strip MUST state the state, counts and warnings on one quiet line, and MUST take a warning tint when the patch has gaps and an alarm tint when it has outgrown the desk.

**The canvas and inspector (US4)**

- **FR-019**: Each lane MUST be a tinted vertical band, with its name in quiet mono type inside the canvas at the top of its band.
- **FR-020**: The zoom control MUST live in the panel's toolbar. No strip may sit between the toolbar and the canvas.
- **FR-021**: The inspector MUST be a bordered rail to the right of the canvas.
- **FR-022**: Every inspector field MUST sit beside a short label in a fixed narrow column.
- **FR-023**: What a source reaches, and what the colours and dash patterns mean, MUST each be a bordered note within the rail.
- **FR-024**: The legend MUST show actual line samples of each encoding rather than describing them in words.
- **FR-025**: Duplicate and Delete MUST sit at the bottom of the rail, separated from the fields, Delete distinguished by colour.
- **FR-026**: For a read-only role the inspector MUST still show every field, what it reaches and the legend, with no control that could change or delete anything.

**The nodes (US5)**

- **FR-027**: Box chrome — radius, border, background, shadow, header, badge, footer — MUST match the mockup and MUST be identical on both graphs.
- **FR-028**: A pass-through box MUST draw one row per jack, incoming port on the left edge and outgoing port on the right edge.
- **FR-029**: A port list longer than the mockup's limit MUST end with a row stating how many ports are hidden. A list at or under the limit MUST NOT.
- **FR-030**: A port MUST be drawn at the mockup's size, hollow when unpatched, filled when patched, and in its run's colour when it has one.
- **FR-031**: The desk's box MUST be visually distinguished from every other box, and its own sockets separated from its channel or bus rows.
- **FR-032**: A source row MUST be: full-height colour tape, name, model in quiet mono, red 48 V bar when on, port flush right — at the mockup's row height.
- **FR-033**: A stereo source's row MUST be two port slots tall, its two sides stacked and labelled, each independently patchable.
- **FR-034**: The sources rail MUST state its count in its header and hold its add control in its footer.
- **FR-035**: A selected source's row MUST be marked, with its name reading stronger than the rest.

**Applies throughout**

- **FR-036**: The two graphs MUST share the components that draw boxes, ports and rows, so they cannot drift apart again.
- **FR-037**: No change to what a cable may connect to, to the rental order, or to any stored data.
- **FR-038**: No change to the mobile layouts or to the printed sheets.
- **FR-039**: The other tabs — overview, lighting, stage plots, equipment, rental order, settings — MUST keep the appearance they have now.

### Key Entities

No new data. Which box is selected is interface state that lasts as long as the tab is open, and is deliberately not stored: it is where the planner is looking, not part of the plan.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an open row editor, reaching that row's source in the graph with its editor open takes one click, on a patch of any size.
- **SC-002**: On a 32-source patch, a selected source is visible without the planner scrolling.
- **SC-003**: Every port along a coloured output's run wears that colour — zero neutral ports on a complete, coloured run.
- **SC-004**: Shown one graph's box and the other's with their contents covered, a planner cannot tell which tab it came from.
- **SC-005**: A sheet row occupies no more than the mockup's row height at the app's own base type size.
- **SC-006**: The sheet, the graph, the toolbar and the status strip read as one panel: no gap, no second border, no rounded card inside another.
- **SC-007**: Every column of digits aligns vertically.
- **SC-008**: A planner can state what each line style on the canvas means by reading the inspector's legend, without prose.
- **SC-009**: A box with 32 ports occupies no more canvas height than the mockup's truncated box, and states how many it is hiding.
- **SC-010**: Switching between the sheet and the graph and back preserves the selection and the search term.
- **SC-011**: Nothing about the mobile layouts, the printed sheets, or the other six tabs changes.

## Assumptions

- The mockup approved for Slice 23 ("Audio tabs — Sheet + Flow, in detail") remains the authority. Its **proportions, hierarchy, type roles, colours and spacing rhythm** are what must be followed; its absolute pixel sizes are not, because it renders the whole application scaled down inside a page, and the reporter has said as much. Where a mockup value is a ratio (a label two-thirds the size of its field, a row three type-sizes tall) that ratio is the requirement.
- Where the mockup and the shipped app disagree because the app has since gained something the mockup lacks — the desk's separately-placed socket panel, the box for rows with no desk — the mockup's *language* is applied to the newer thing rather than the newer thing being removed.
- "Fonts" in the report means the two type roles the mockup uses — a mono face for labels, numbers, ports and chains, and the interface face for names and prose. Choosing a new typeface for the application is still a later slice.
- The mockup's toolbar carries the tab's own name; the app also shows it in the tab strip above. The mockup is followed, because the name is what anchors the panel now that the panel has a top edge of its own.
- The outputs graph has no inspector today. This slice gives the outputs graph the selection it needs for Edit in Flow to land somewhere, and leaves a full outputs inspector out of scope — the mockup does not draw one.
- No new outside dependency, no schema change, no change to any walker, guard, or the rental query.

## Out of Scope

- A typeface for the application, and this language on the other six tabs. Still a slice of its own, as agreed.
- An inspector for the outputs graph with editable fields. Selection lands there; the fields do not.
- The printed sheets' appearance, which is paper and has its own constraints.
- The mobile layouts, which use neither the panel, the sheet nor the graph.
- Any change to routing rules, capacity guards, the rental order, or stored data. This slice moves pixels and adds one derived colour.
