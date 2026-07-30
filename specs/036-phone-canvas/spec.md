# Feature Specification: The canvases

**Feature Branch**: `036-phone-canvas`

**Created**: 2026-07-29

**Status**: Draft

**Input**: Wave 6d of the design convergence — both audio Flow canvases in the phone's
frame. Closes audit finding **M6**, the last finding in Wave 6. Approved mockup at
`specs/036-phone-canvas/mockup.html`, revision 1, with all four questions in its §07
answered.

---

## Context

Wave 6 is the phone, in four phases. 6a (Slice 33) built the overlay — `ui/Sheet`, and
the drawer's phone anchoring — and touched no surface. 6b (Slice 34) built the frame —
bar, rows, strip. 6c (Slice 35) put the nine event sections in it, and after it the phone
was no longer a subset of the application.

**6d is the last phase, and the only one that is a new capability rather than a
conversion.** Nine surfaces were converted; this one has never existed. It is ordered
last for two reasons stated at the time: it is the only phase that adds something, and
6c had to settle what a phone bar and a phone sheet are before a canvas had to use both.

### The rule this slice reverses

`audit.md` and `patterns.md` §7 both carried *"a patch graph on a phone is unreadable at
any density"*. It is **reversed**, on the report that the picture of where the signal
goes is exactly what is wanted on site. `patterns.md` §7f already carries the reversal
and draws the canvas in the hand; Stage Plots has done the viewable half since 6c and is
the working precedent.

### Almost everything is already written down

`patterns.md` §7f states pan, pinch, what is selectable, that the inspector sheet
**edits**, that it takes no scrim, and that **nothing is pinned to the canvas's edges**.
§7g states the one withheld gesture and the words that name it. §7b states the bar's
`actions`/`overflow` rule and puts `Sheet │ Flow` in `actions` by name.
`components.md` §5 states that the inspector sheet is `InspectorRail`'s contents in
`ui/Sheet` — *"no new inspector — a different container for the one that exists, editing
exactly what the rail edits and committing per field"* — and that `scrim={false}` was
built in 6a and left unwired for exactly this. `tokens.md` §7 states every value.

**None of that is restated here.** This specification covers only what those documents do
not settle, which is what the mockup was for.

### The question the audit deferred to this phase, and its answer

`audit.md` Part 2 left one thing open: *"whether a phone canvas wants the desktop's
pan-and-zoom or a fit-to-width default with zoom as the exception. Nobody has held a
60-channel patch graph on a phone yet. That is a field-test question, not a document
one."*

It is arithmetic, and the arithmetic answers it. The graph's coordinate space is clamped
to **820 logical px wide** — not a layout choice a phone can renegotiate, because it is
where every stored `position_x` already is — and the phone's panel has **341 px**. So
opening at 100 % lands on the Stage lane with nothing on screen saying a desk exists;
and fitting the width needs 0.42, which is below the shared zoom control's floor and
renders an 11 px node title at 4.6 px.

**The second dimension settles it.** The graph is 640 logical px tall and the phone's
canvas region is about 300, so at 42 % the graph is 345 × 269: it fits the window *in
both axes, whole, once*.

| | Settled at review |
|---|---|
| Fit-to-width or pan-and-zoom? | **Both, in that order.** Fit is the opening state and the reset target; pan-and-zoom is the working state. The one control whose meaning changes is the zoom readout: on a desk it resets to 100 %, in a hand it resets to *fit*. |
| Is `＋ Add channel` right to be absent in Flow? | **Yes**, and it may be revised later. A row control on a view with no rows, on a device that cannot cable what it just added. |
| One canvas this slice or both? | **Both.** A phone branch built at one call site and copied to the second is how two of them end up different — which is the lesson `NodeShell`, `PortDot` and `PortRow` cost a slice to learn. |
| Should search move the viewport on the desktop too? | **Yes, unconditionally.** A viewport smaller than its content is a fact about the screen, not about the person. |

### One finding this slice adds

**There are two zoom controls.** `graph/ZoomControl` is the shared one, and 6c hand-built
a second inside `StagePlotTab`'s phone branch — three 44 px targets and a percentage,
because the shared control's are 28 px and `tokens.md` §7 amendment 1 forbids that in the
hand. It was the right call in a slice that had no other canvas; it becomes the
`NodeShell` mistake the moment a second canvas needs the same thing, which is now.

So the shared control gains a phone form **inside itself** and the copy is deleted. That
is the **fifth** time in this wave that a branch inside a shared component gave several
surfaces a phone form at once — after `ui/Drawer` in 6a, `StatusStrip` in 6b, and
`VocabularyPanel` and the drawers in 6c — and the third time this document has had to
record that the phase which needed a thing twice is the phase that should own it.

### The design work of the slice, which came out of that question rather than into it

Once the canvas is a 341 px window over an 820 px graph, **the hard thing is not reading
a box — it is finding one.** Both canvases already take the shell's search term and *dim*
every non-matching node and row rather than hiding them, deliberately, because removing a
node removes edges that exist and a partly-filtered patch would read as an unpatched one.
On a 1180 px desk that is a highlight. In a 341 px window it is a **direction**, and one
call turns it into one: the first match scrolls itself into the viewport — the same call
`SourceRow` has made since Slice 25, for the same stated reason, *a selection you cannot
see is not a selection*.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The picture of where the signal goes, on site (Priority: P1)

A technician standing at the stage box during load-in wants to know what the patch
actually looks like — which sources land on which box, what the network hop is, where the
desk sits. Today the phone offers a list of channels and nothing else: the Flow view has
never existed below 768 px. After this slice they tap **Flow**, the whole graph draws
itself once at fit, and they put a thumb on the part they came for.

**Why this priority**: It is `M6`, the last finding in Wave 6, and it is the surface the
reversal was reported for.

**Independent Test**: At 375 × 667 on an event with 16 channels, a stage box and a desk,
open Audio Inputs, tap **Flow**, and confirm the whole graph is visible in one screen and
that dragging moves the window in both axes.

**Acceptance Scenarios**:

1. **Given** Audio Inputs or Audio Outputs on a phone, **Then** the bar carries a
   `Sheet │ Flow` control and the view it selects is remembered per event and per tab,
   exactly as the desktop remembers it.
2. **Given** Flow opening on a phone, **Then** the initial zoom is the value at which the
   whole graph fits the canvas region in **both** axes, and the window is centred
   horizontally and at the top.
3. **Given** the canvas, **When** one finger is dragged across it, **Then** the window
   moves in both axes with the platform's own momentum, and it is not bounded by rails,
   lanes or node positions.
4. **Given** the canvas, **When** two fingers are pinched, **Then** the zoom changes about
   the midpoint of the two fingers and stays within fit and 100 %.
5. **Given** the bar's zoom control, **Then** it offers three targets of at least 44 px,
   the outer two step by a factor of 1.4, and the middle one states the current
   percentage and resets to **fit**.
6. **Given** the canvas at any zoom, **Then** nothing on it is re-sized for the phone:
   ports are 7 px, port rows 18 px, and no port is truncated.
7. **Given** the canvas, **Then** nothing is pinned to its edges — no sources rail beside
   it, no inspector column, no legend anchored to a corner.
8. **Given** the panel in Flow, **Then** the bar and the status strip are on screen at
   every pan and zoom position, and only the canvas region moves.

---

### User Story 2 - Change what is on the end of the cable that is already there (Priority: P1)

The same technician is standing next to the source. The stand it is written down as is
not the stand that came off the truck. They tap the source on the canvas, the inspector
rises from the bottom edge without dimming the graph, and they change the stand — while
still being able to drag the canvas behind it.

**Why this priority**: `patterns.md` §7f calls this *"the phone's best case, not an edge
case"*, and it is what makes the canvas worth mounting rather than merely drawing.

**Independent Test**: At 375 px in Flow, tap a source, change its stand and its 48 V, and
confirm both are visible on the desktop without a reload of the sheet.

**Acceptance Scenarios**:

1. **Given** the canvas, **When** a node or a source-rail row is tapped, **Then** the
   inspector opens as a bottom sheet showing the same fields the desktop rail shows.
2. **Given** the canvas, **When** a 7 px port dot is tapped, **Then** nothing is selected
   and nothing is connected — the dot is drawn, not a target.
3. **Given** the inspector sheet, **Then** it renders **no scrim and no backdrop element
   at all**, the canvas behind it stays pannable, and focus is not trapped.
4. **Given** the inspector sheet, **Then** it has no footer and no **Save**: every field
   commits on change, exactly as the rail does on a desk.
5. **Given** a selection made while the sheet is open, **Then** the selected node is
   scrolled into the part of the window the sheet does not cover.
6. **Given** a **viewer**, **When** they tap a node, **Then** the sheet opens and every
   field is present and read-only, and no request is attempted.
7. **Given** a source in the sheet, **Then** its duplicate and delete controls sit at the
   foot of the scrolling body, left-aligned, apart from anything a thumb rests on.
8. **Given** a failed save, **Then** the sheet stays open with every value intact and the
   error is stated inline.

---

### User Story 3 - Finding one box in two and a half screens (Priority: P2)

A 60-channel festival patch at 100 % is two and a half screens wide and two tall. The
technician needs *Gtr R*. They open the search row, type `gtr`, and the window moves to
it while everything else goes quiet.

**Why this priority**: It is what makes US1 usable at working zoom rather than only at
fit, and it is the design work of the slice. P2 only because US1 delivers value without
it.

**Independent Test**: At 375 px in Flow at 100 %, scrolled to the far left, type a term
matching a node at the far right, and confirm the window moves to it.

**Acceptance Scenarios**:

1. **Given** Flow on a phone, **Then** the bar's search control is present and opens the
   bar's second row, as it does in the Sheet view.
2. **Given** a search term, **Then** non-matching nodes and rows are **dimmed and never
   removed**, on both canvases and at every width.
3. **Given** a search term with at least one match, **Then** the first match is scrolled
   into the viewport.
4. **Given** a search term with no match, **Then** the window does not move and nothing is
   hidden.
5. **Given** the **desktop** at any width, **Then** the same scroll-into-view happens —
   the behaviour is not guarded on reach.
6. **Given** the Sheet view at any width, **Then** search filters rows exactly as it does
   today.

---

### User Story 4 - Why can I not drag this cable? (Priority: P2)

Someone who uses the desktop daily opens Flow on a phone and reaches for a port. Nothing
happens. The panel has already told them why, in one sentence, and told them what they
*can* do.

**Why this priority**: `patterns.md` §7g requires it and states the treatment; it is the
difference between a withheld gesture and a broken one.

**Independent Test**: At 375 px in Flow, read the sentence, close it, reload, and confirm
it stays closed and the `i` reopens it.

**Acceptance Scenarios**:

1. **Given** Flow on a phone, **Then** the panel states: *"Patching is a desk job — open
   this event on a computer. Tap any box to read or edit what it is."*
2. **Given** that sentence, **Then** it is not a banner, not a dialog and not a disabled
   control, it sits where the editor would be, and **it does not vary with role**.
3. **Given** that sentence, **When** it is closed, **Then** it collapses to an `i` in the
   panel title's own line, the choice is remembered, and the panel costs no row for it.
4. **Given** a phone, **Then** dragging a cable between ports, dragging a node to a new
   position and deleting a cable from the canvas are all **absent** — withheld by the
   canvas being handed no handler, never by a role check.
5. **Given** the whole frontend, **Then** `!isMobile` appears in no permission expression.
6. **Given** a node under a thumb, **When** the thumb moves more than 3 px before
   lifting, **Then** the canvas panned and nothing was selected.

---

### User Story 5 - Outputs is the same surface (Priority: P2)

A monitor engineer wants the same picture in the other direction: which desk output
reaches which wedge, through which box. They get it, and it behaves identically.

**Why this priority**: Both canvases ship together by decision. It is P2 rather than P1
only because Inputs is the reported case; the work is shared and the risk of splitting is
what makes it one slice.

**Independent Test**: Repeat every scenario of US1 to US4 on Audio Outputs at 375 px.

**Acceptance Scenarios**:

1. **Given** Audio Outputs on a phone, **Then** its Flow view behaves identically to
   Audio Inputs' in every respect above.
2. **Given** the two canvases, **Then** neither has a phone code path the other lacks.
3. **Given** the outputs inspector, **Then** it opens in the same sheet, from the same
   shared rail, with its own fields.

---

### Edge Cases

- **A canvas region smaller than one node.** Fit is capped at 100 % and floored at
  nothing — a very short viewport simply yields a very small fit, which is still the
  whole graph.
- **A graph with nothing on it.** The empty-canvas hint the desktop already shows is
  shown, and the fit calculation still produces a usable window.
- **Rotating the phone.** Fit is re-measured from the live viewport; the current zoom is
  clamped into the new range rather than reset, so a working zoom survives a rotation.
- **Toggling `Sheet │ Flow` and back.** The selection and the zoom survive the toggle, as
  they already do on the desktop.
- **A search term typed on the desktop, then narrowed to phone width.** Already handled by
  6c's derived search-open rule; the Flow view inherits it.
- **A search match that is already fully visible.** The window does not move.
- **The strip in Flow.** It states the same verdict it states in Sheet and is **not a
  control**, because the canvas does not filter — which is the rule §7b already states
  for a strip with nothing to filter to.
- **A tap that lands on a node while the inspector is open on another node.** The
  inspector switches to the new node; it does not open a second sheet.
- **A node behind the sheet.** Selecting scrolls it clear; panning with the sheet open
  stays available, because there is no backdrop to swallow the touch.
- **A viewer in Flow.** The overflow holds Print alone, exactly as it does in Sheet, and
  the withheld-gesture sentence is unchanged — it is about the surface, not the person.
- **Printing from Flow.** The print sheet is produced exactly as it is from the Sheet
  view; the view toggle is chrome and does not reach the print output.

---

## Requirements *(mandatory)*

### Functional Requirements

**The canvas mounts (M6)**

- **FR-001**: Audio Inputs and Audio Outputs MUST offer a `Sheet │ Flow` control on a
  phone, in the bar's visible controls.
- **FR-002**: The selected view MUST be remembered per event and per tab, by the same
  mechanism the desktop uses. Nothing new is persisted.
- **FR-003**: The Flow view on a phone MUST render the same canvas component the desktop
  renders, drawing the same graph from the same data.
- **FR-004**: Nothing drawn on the canvas MUST be re-sized, re-laid-out or truncated for
  the phone. No canvas geometry value may acquire a second definition.
- **FR-005**: Nothing MUST be pinned to the canvas's edges on a phone — no sources rail
  column, no inspector column, no anchored legend.

**The viewport**

- **FR-006**: The canvas region MUST fill the panel's body and be the only part of the
  panel that moves. The bar and the strip MUST remain on screen at every pan and zoom
  position.
- **FR-007**: Panning MUST be the platform's own scrolling — both axes, unbounded, with
  momentum — and MUST NOT be implemented by a gesture handler on the canvas.
- **FR-008**: The phone's zoom range MUST be **fit to 1.0**, where *fit* is measured from
  the live viewport as the largest scale at which the whole graph fits in both axes,
  capped at 1.0.
- **FR-009**: The opening zoom MUST be *fit*, with the window centred horizontally and at
  the top.
- **FR-010**: The zoom control's step on a phone MUST be a factor of **1.4**, and its
  readout MUST reset to **fit**.
- **FR-011**: Pinching MUST change the zoom about the midpoint of the two contact points,
  within the same range.
- **FR-012**: *Fit* MUST be re-measured when the viewport changes size, and the current
  zoom clamped into the new range rather than reset.
- **FR-013**: The phone MUST use the shared zoom control's existing explicit-stepping
  props rather than a stepping of its own. The control MUST reach a 44 px target on a
  phone by acquiring a phone form **inside itself**, and its desktop rendering MUST be
  unchanged.
- **FR-013a**: The hand-built phone zoom cluster inside the stage plot tab MUST be
  deleted in favour of that phone form, so the application has **one** zoom control at
  every width.

**Selection and the inspector**

- **FR-014**: A node and a source-rail row MUST be selectable by tap. A port dot MUST NOT
  be.
- **FR-015**: A press that moves more than 3 px before lifting MUST be a pan and MUST NOT
  select.
- **FR-016**: The inspector MUST open as a bottom sheet holding the existing rail's own
  contents, with no new inspector component and no second field layout.
- **FR-017**: The inspector sheet MUST render **no backdrop element**, MUST NOT trap
  focus, and MUST leave the canvas behind it interactive.
- **FR-018**: The inspector sheet MUST have no footer and no confirm control: every field
  commits on change, as the rail does at every width.
- **FR-019**: Selecting MUST scroll the selected node into the part of the viewport the
  sheet does not cover.
- **FR-020**: A role that may not edit MUST get the same sheet with every field present
  and read-only, and no request attempted.

**The bar in Flow**

- **FR-021**: The bar in Flow MUST carry the panel's title, the `Sheet │ Flow` control,
  the search control and the overflow, and MUST wrap to a second row rather than scroll.
- **FR-022**: The bar in Flow MUST carry **no primary action**. The Sheet view keeps its
  add control.
- **FR-023**: The overflow's contents MUST be the surface's existing ones, unchanged by
  the view.
- **FR-024**: The status strip MUST be present in Flow, stating the same verdict it states
  in Sheet, and MUST NOT be a filter control there.

**What is withheld (§7g)**

- **FR-025**: Dragging a cable between ports, dragging a node to a new position, and
  deleting a cable from the canvas MUST be absent on a phone.
- **FR-026**: They MUST be withheld by the canvas being handed no handler, never by a
  role check or a reach check inside a permission expression.
- **FR-027**: The panel MUST state the reason in one sentence naming what is still
  available, as an explanation that can be put away to an `i` in the title's line, with
  the choice remembered.
- **FR-028**: That sentence MUST NOT vary with role.

**Search aims the window**

- **FR-029**: A search term MUST dim non-matching nodes and rows and MUST NOT remove them,
  on both canvases and at every width.
- **FR-030**: The first matching node or row MUST be scrolled into the viewport, **at
  every width** — the behaviour MUST NOT be guarded on reach.
- **FR-031**: A term with no match MUST move nothing and hide nothing.

**What must not change**

- **FR-032**: The desktop's rendered markup for both flow inspectors MUST be unchanged,
  asserted by comparing rendered output state by state rather than by reading the diff.
- **FR-033**: The shared canvas primitives that *draw* — the node shell, the port dot,
  the port row and the lane bands — MUST NOT change. Nothing in this slice may give the
  phone a second definition of a drawn value.
- **FR-033a**: The existing inspector rail component MUST keep its current signature and
  behaviour for its stage-plot caller. The flow inspectors' phone form MUST arrive
  through a frame that renders that rail unchanged on a desk.
- **FR-034**: No endpoint, no migration and no backend file MUST change.

### Key Entities

No new entity, no new stored field, no new query. The canvas draws what the audio patch
already returns, and the inspector writes through the mutations the rail already owns.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening the Flow view on a 375 × 667 screen shows **every node in the
  graph** on one screen without any scrolling.
- **SC-002**: From the opening view, reaching 100 % on any part of the graph takes **at
  most three taps** of one control, and returning to the whole picture takes **one**.
- **SC-003**: A named channel or box anywhere in a 60-node graph can be brought into view
  by typing part of its name, from any pan position, **without panning**.
- **SC-004**: Changing which stand a source is on, starting from the section list, takes
  **no more than four taps** and never leaves the surface.
- **SC-005**: The status strip's verdict is readable at **every** pan and zoom position of
  the canvas.
- **SC-006**: A user with read-only access can open and read every field of every box on
  the canvas, and can trigger **zero** write attempts.
- **SC-007**: Every scenario above behaves identically on Audio Inputs and Audio Outputs.
- **SC-008**: At desktop widths, the two flow surfaces render **identically to today** in
  every state, with the single intended exception that a search term now brings its first
  match into view.
- **SC-009**: The audit's phone findings stand at **zero open**, and Wave 6 is complete.

---

## Assumptions

- **The graph's coordinate space is fixed at 820 × 640 logical px** and this slice does
  not renegotiate it. It is where every stored node position already is, and changing it
  would move every desktop graph.
- **The canvas region is roughly 300 px tall on a 667 px handset**, after the shell's
  header, the section switcher, a two-row bar, the strip and the bottom nav. The fit
  calculation is measured rather than assumed, so this figure only has to be right enough
  for the design argument.
- **`ui/Sheet`'s `scrim={false}` behaves as specified** — it renders no backdrop element
  at all, so a sheet using it is genuinely non-modal. It was built in 6a for this and has
  had no caller until now, so this slice is its first test.
- **Both canvases already dim on search** and already hold their selection in the tab
  rather than in the canvas, so neither the dimming nor the selection needs inventing.
- **A phone's `readOnly` path already exists** on both canvases and already withholds most
  connection gestures; this slice extends that to the remainder rather than adding a
  parallel mechanism.
- **`window.confirm` behind the flow inspector's Delete stays as it is.** Replacing it is
  a desktop-visible change to a destructive path in a phone-only phase; it is recorded as
  a known defect instead.

---

## Out of Scope

- **Patching from a phone.** `patterns.md` §7g's one desk job, restated as a boundary
  rather than a gap.
- **Moving a node from a phone.** The same gesture, on the same canvas.
- **Adding a source or a channel from the Flow view on a phone.** FR-022; may be revised
  later, and the mockup records the argument on both sides.
- **A phone form for the cable picker and the cable info dialog.** Both are reachable only
  from a port, and ports are not targets on a phone.
- **Replacing `window.confirm`.** Recorded as a known defect for a slice that owns the
  desktop.
- **Any change to the stage plot canvas.** It already has its phone form, from 6c.
