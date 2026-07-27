# Feature Specification: Audio Patch Shell — Sheet, Flow, Drawers & the Console

**Feature Branch**: `023-audio-patch-shell`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "I would like to improve the UI/UX of the audio input tab and the audio output tab (since they are related). Right now I feel like it's cluttered on the desktop version. Functionality-wise I'm happy with what I have today. Focus on frontend change (although I'm not against backend change if necessary). […] I like your recommendation with Patch Sheet as the default and Patchbay as a second toggle. Could you make more thorough mockups for this direction? I would like to also see the "buses" and "Rig" drawers. One thing I've been thinking about is there is no picker for the actual audio console. Just stage boxes. Can you include that in the mockup as well? […] I would like the 48 V indicator to be a bit more distinct from the port dot. Another color? Red is common for 48 V. And stereo sources should have the ports vertical, not horizontal, meaning stereo sources will be taller. Last thing, I would like the channel color to be reflected on the entire flow, like in today's solution, when it's fully connected end-to-end. […] I'm happy with the last mockup. Implement the changes proposed in the mockup."

The approved mockup is the artifact
`https://claude.ai/code/artifact/f90ed9ba-5dff-49de-b9ad-3cf9ca555d2e`
("Audio tabs — Sheet + Flow, in detail"), which is this spec's visual
reference. Where prose and mockup disagree, the mockup wins on layout and
the spec wins on behaviour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Land on one surface instead of a stack of cards (Priority: P1)

A technician opens Audio Inputs on a laptop to check a patch. Today they meet
five or six stacked cards — buses, channels, stageboxes, multis, devices,
sources — and have to scroll roughly two screens before the signal-flow graph
appears. They want the channel list immediately, with the setup material
(consoles, boxes, buses) available on demand instead of permanently occupying
the top of the page.

**Why this priority**: This is the complaint that started the work, it is pure
presentation, and it delivers the whole perceived improvement on its own. It
also creates the container the later stories fill: without one shell there is
nowhere to put the chain column, the status rail or the console.

**Independent Test**: Open both audio tabs on a desktop viewport with an event
that has channels, stageboxes, multis, devices and buses declared. Confirm
there is exactly one toolbar, that the channel/output list is the first thing
visible without scrolling, and that every piece of equipment and every bus
that could be edited before is still reachable and still editable — through a
drawer rather than a card.

**Acceptance Scenarios**:

1. **Given** an event with equipment declared on both audio tabs, **When** the
   user opens Audio Inputs on a desktop viewport, **Then** the page shows one
   toolbar and one content area, and the first channel row is visible without
   scrolling.
2. **Given** the Audio Inputs tab, **When** the user opens the Rig drawer,
   **Then** the consoles, stageboxes, stage multis and processing/destination
   devices of that event are all listed in it, each editable and deletable
   exactly as it was in its former card.
3. **Given** the Audio Outputs tab, **When** the user opens the Rig drawer,
   **Then** it shows the same stageboxes and stage multis as the Inputs tab
   against the same underlying data, so a box declared on one tab needs no
   re-declaring on the other.
4. **Given** the Audio Inputs tab, **When** the user opens the Buses drawer,
   **Then** mix groups and DCAs can be added, renamed, recoloured and deleted
   as before, and each shows how many channels are assigned to it.
5. **Given** the Audio Outputs tab, **When** the user looks for the Buses
   drawer, **Then** there is none, because outputs have no group or DCA
   membership.
6. **Given** either audio tab, **When** the user switches between Sheet and
   Flow, **Then** the selected channel/output survives the switch, the search
   term stays applied, and the chosen view is remembered for that tab on that
   event across a page reload.
7. **Given** a user whose role on the event is contributor or viewer, **When**
   they open either audio tab, **Then** the row editor, the add button and the
   Rig and Buses buttons are absent — not present-but-refusing — while the
   Flow view stays fully pannable and zoomable.
8. **Given** a phone-sized viewport, **When** the user opens either audio tab,
   **Then** the existing mobile list-and-edit-sheet flow renders exactly as it
   does today, untouched by this feature.

---

### User Story 2 - Read a channel's whole signal path on one line (Priority: P1)

Before a show the technician walks the stage with a laptop, checking that every
channel has a mic, a stagebox jack and a desk channel. Today each of those
lives in a different card and the only place the path exists as a whole is the
graph. They want one line per channel that reads mic → every hop → desk
channel, and a single summary line that tells them whether anything is missing.

**Why this priority**: This is what makes the sheet the right default view
rather than merely a tidier table, and it is the fastest daily check the tool
can offer. It needs the shell from Story 1 but nothing from Story 3.

**Independent Test**: On an event with a fully patched channel, a channel
patched through a DI box, a channel with no source and a stereo pair, open the
Sheet view and confirm each row states its own path correctly, that the summary
rail counts the gaps, and that clicking one hop repatches only that hop.

**Acceptance Scenarios**:

1. **Given** a channel fed by a mic through a stagebox, **When** the user views
   the Sheet, **Then** its row shows the mic, the stagebox jack and the desk
   channel in signal order on one line.
2. **Given** a channel fed through a DI box, **When** the user views its row,
   **Then** every hop appears in order, including the DI box.
3. **Given** a stereo channel, **When** the user views its row, **Then** it is
   one row and its stagebox jacks read as a range rather than two rows.
4. **Given** a channel with no source, **When** the user views its row,
   **Then** the chain cell states that the source is missing in place of an
   empty cell, and the summary rail counts it as a gap.
5. **Given** a chain too long for its column, **When** it is rendered,
   **Then** it truncates in the middle and the first and last hop remain
   visible.
6. **Given** a chain cell, **When** the user clicks one hop in it, **Then** a
   picker opens for that hop alone and confirming it changes no other hop.
7. **Given** a closed row, **When** the user clicks it, **Then** an editor
   opens in place for that row's own fields — name, width, colour, buses,
   notes — and routing is not among them; a link sends the user to Flow for
   routing instead.
8. **Given** an open row editor, **When** the user opens another row, **Then**
   the first row's changes are saved and it closes, so at most one row is open
   at a time.
9. **Given** an open row editor, **When** the user presses Escape, **Then** it
   closes without saving; **When** the user presses the save shortcut,
   **Then** it saves and opens the next row.
10. **Given** a search term, **When** it is typed in the toolbar, **Then** the
    Sheet shows only matching rows and the Flow view dims non-matching nodes
    rather than hiding them.
11. **Given** the printed input sheet, **When** it is produced, **Then** it
    presents the same channel and chain information as the on-screen Sheet.

---

### User Story 3 - Put the actual console in the plan (Priority: P2)

The technician books a DiGiCo SD10 for FOH and a Yamaha CL5 for monitors. Today
neither desk exists in the plan: the graph draws an anonymous "Mixer" box, the
desk never reaches the rental order, nothing checks the channel count against
what the desk can take, and a talkback mic that goes straight into the desk's
own preamp has to be faked through a stagebox. They want to name the desks they
have booked, see them on the order, patch straight into their local jacks, and
be warned when the patch outgrows them.

**Why this priority**: It closes a real hole in the domain model — including a
violation of the project's standing invariant that every planned catalog item
reaches the rental order — but the two presentation stories deliver value
without it, and it carries the only schema change in the feature.

**Independent Test**: On an event with an existing patch, add a console from
the catalog, confirm it appears on the rental order and in every export,
confirm the graph and the printed sheets name it instead of "Mixer", patch a
source directly into one of its local inputs, then reduce its channel count
below what is patched and confirm the over-capacity warning.

**Acceptance Scenarios**:

1. **Given** an event, **When** the user adds a console with a name, a role, a
   catalog or owned item and its input/output/local counts, **Then** it is
   listed in the Rig drawer and named in both signal-flow graphs.
2. **Given** a console linked to a catalog item, **When** the user opens the
   rental order, **Then** the console appears as one line of quantity 1 under
   audio, and appears in every export format the inventory offers.
3. **Given** a console linked to an owned item, **When** the user opens the
   rental order, **Then** it appears there too, consistent with how owned
   processing devices are already counted.
4. **Given** a console with local inputs, **When** the user patches a source
   directly into one of them, **Then** the cable is accepted without any
   stagebox or multi in the path, and the channel's chain reads
   source → local jack → channel.
5. **Given** a console with local outputs, **When** the user patches one of
   them to a destination device, **Then** the cable is accepted and the
   output's chain starts at the console's local jack.
6. **Given** an event with more channels than its console can take, **When**
   the user views either audio tab, **Then** the summary rail warns, states
   the shortfall as a number, and offers a way into the Rig drawer.
7. **Given** a console with cables patched to its local jacks, **When** the
   user reduces its local port counts below what is patched, **Then** the
   change is refused and the conflicting hops are named.
8. **Given** an event with two consoles, **When** the user views the Outputs
   tab, **Then** each output states which console it belongs to and the list
   can be narrowed to one console.
9. **Given** an event with exactly one console, **When** the user views the
   Outputs tab, **Then** no console column or filter is shown, because there
   is nothing to disambiguate.
10. **Given** an event that existed before this feature, **When** it is opened
    afterwards, **Then** its channels, outputs, cables and canvas layout are
    unchanged, and it shows a single unnamed console with no item picked and
    no capacity declared, which raises no warnings.
11. **Given** a console with no item picked, **When** the user opens the rental
    order, **Then** it contributes no line, exactly as an unpicked stagebox
    does.

---

### User Story 4 - Read the graph at festival scale (Priority: P3)

The technician opens Flow on a 32-source festival patch. They need to see which
runs are complete, which mic is on which source, and where phantom power is
switched on, without the source lane growing so tall that the rig and the desk
scroll off the screen.

**Why this priority**: The Flow view already works; this is density and
legibility on top of it. Worth doing in the same feature because the graph is
now one toggle away from the default view and will be looked at far more often.

**Independent Test**: Open Flow on an event with more than 24 sources, several
of them stereo, some fully patched and some not. Confirm the whole source list
fits without the rig lane moving, that a complete run carries its channel's
colour end to end, and that phantom power is unmistakable at a glance.

**Acceptance Scenarios**:

1. **Given** an event with 30 sources, **When** Flow is opened, **Then** the
   source lane scrolls within itself and the rig and console lanes stay in
   place.
2. **Given** a source row, **When** it is rendered, **Then** it shows a colour
   edge, the source name, the picked mic or connector, phantom-power state and
   its patchable port, all on one row of the same height as a stagebox jack
   row.
3. **Given** a stereo source, **When** it is rendered, **Then** it occupies two
   port slots with its left and right ports stacked vertically, each taking its
   own cable.
4. **Given** a source with phantom power on, **When** it is rendered, **Then**
   the indicator differs from a port in both colour and shape, and is red.
5. **Given** a run that reaches a desk channel where all reachable channels
   agree on one colour, **When** it is rendered, **Then** that colour appears
   on the source's colour edge, on every cable in the run, on every port the
   run passes through and on the desk's channel row.
6. **Given** a run that is cabled but reaches no channel, **When** it is
   rendered, **Then** nothing on that path takes a colour and its cables read
   as connected-but-incomplete.
7. **Given** a run reaching two channels of different colours, **When** it is
   rendered, **Then** it stays neutral, as the existing colour rule already
   requires.
8. **Given** an unpatched source, **When** it is rendered, **Then** its port is
   drawn as empty and no cable leaves it.
9. **Given** a network hop between a console and a stagebox, **When** it is
   rendered, **Then** it is distinguishable from a physical cable by a means
   independent of colour, so it can still carry its channel's colour.
10. **Given** any node in Flow, **When** it is selected, **Then** an inspector
    shows its details and, for a source, what it reaches; the inspector
    replaces the sheet's row editor rather than adding a second editing model.

### Edge Cases

- An event with no console at all (never added, or the backfilled one deleted):
  the graph shows an unnamed desk placeholder, capacity checks are silent, and
  channels still work exactly as they do today.
- An event whose console has capacity declared as 0: treated as "not declared",
  never as "over capacity by every channel".
- A console deleted while cables are patched to its local jacks: refused, or
  warned with the count of cables it would clear, consistent with how deleting
  a stagebox behaves today.
- Two consoles given the same name: allowed; the role and the catalog item
  disambiguate them, and nothing keys off the name.
- A source whose run passes through a device with no output cable: the run is
  incomplete and takes no colour, though the cables that do exist are drawn.
- A search term matching nothing: the Sheet says so in place of the rows rather
  than showing an empty table body.
- A drawer open when the browser window is narrowed to tablet width: the drawer
  stays usable, overlaying the content rather than squeezing it.
- A channel deleted while its row editor is open: the editor closes and the
  Sheet re-renders without it.

## Requirements *(mandatory)*

### Functional Requirements

**The shell**

- **FR-001**: Both audio tabs MUST present a single toolbar carrying, in this
  order: a Sheet/Flow view toggle, a search field, the drawer buttons, print,
  and an add-row action.
- **FR-002**: The two tabs MUST share one shell implementation, differing only
  in their columns, their row editor, their canvas, and the nouns in their
  labels.
- **FR-003**: The Rig drawer MUST be the same surface on both tabs, operating
  on the same event-scoped equipment, and MUST list consoles, stageboxes,
  stage multis, and processing/destination devices.
- **FR-004**: The Buses drawer MUST exist on the Inputs tab only, and MUST show
  the number of channels assigned to each group and DCA.
- **FR-005**: Each drawer entry MUST render as a summary line with its capacity
  and its patched usage, revealing editable fields only on request.
- **FR-006**: The system MUST remember the chosen view per tab per event, and
  MUST preserve the current selection and search term across a view switch.
- **FR-007**: For a contributor or viewer, the system MUST omit the add action,
  the row editor and the drawer buttons from the rendered page, while leaving
  the Sheet readable and the Flow view fully navigable.
- **FR-008**: The feature MUST NOT alter any mobile rendering path.

**The sheet**

- **FR-009**: Each Sheet row MUST state its channel's or output's full signal
  path in signal order, from the origin source to the desk channel on inputs,
  and from the desk output to the final destination on outputs.
- **FR-010**: A stereo channel or output MUST occupy one row, with paired ports
  presented as a range.
- **FR-011**: A missing link in a path MUST be named in place rather than
  rendered as an empty cell.
- **FR-012**: Each hop in a path MUST be individually actionable, opening a
  picker scoped to that hop.
- **FR-013**: At most one row editor MUST be open at a time; opening another
  saves and closes the first.
- **FR-014**: The row editor MUST expose only the row's own attributes and MUST
  link to Flow for anything about routing.
- **FR-015**: The system MUST show one summary rail under the list stating the
  row count, the console's declared and used capacity, per-box usage, the
  number of cables picked, and the number of gaps; and MUST distinguish a
  complete plan, a plan with gaps, and a plan that exceeds console capacity.
- **FR-016**: A search term MUST filter Sheet rows and MUST de-emphasise
  non-matching Flow nodes without removing them.
- **FR-017**: The printed input and output sheets MUST present the same columns
  and the same path information as the on-screen Sheet.

**The console**

- **FR-018**: An event MUST be able to declare any number of consoles, each
  with a name, a role, an optional catalog or owned item, and typed input,
  output, local-input and local-output counts.
- **FR-019**: A console linked to a catalog or owned item MUST contribute
  exactly one audio line to the rental order and to every export format,
  regardless of how many channels, outputs or cables reference it; a console
  with no item picked MUST contribute nothing.
- **FR-020**: A console's local input and output jacks MUST be patchable, so a
  source can reach a channel and an output can reach a destination without a
  stagebox or multi in the path.
- **FR-021**: Each input channel and each output MUST belong to exactly one
  console; the console MUST be shown and selectable per row only when the
  event has more than one.
- **FR-022**: Both signal-flow graphs MUST render each console as a named node
  showing its identity, its capacity and its used count, replacing the current
  anonymous mixer node.
- **FR-023**: The system MUST warn when the channels or outputs assigned to a
  console exceed its declared counts, stating the shortfall, and MUST stay
  silent when a count is undeclared.
- **FR-024**: Reducing a console's port counts below what is patched MUST be
  refused, naming the conflicting hops.
- **FR-025**: Every event that exists before this feature MUST keep its
  channels, outputs, cables, buses and canvas positions unchanged, and MUST
  gain exactly one console with no item and no declared capacity.
- **FR-026**: The printed sheets and every export MUST name the console
  wherever they currently say "Mixer".

**The flow view**

- **FR-027**: Sources MUST be presented as one consolidated scrollable rail of
  fixed-height rows, one row per mono source and two stacked port slots per
  stereo source, and the rail MUST scroll without moving the other lanes.
- **FR-028**: A source row MUST carry its derived colour edge, name, picked
  model, phantom-power state and port.
- **FR-029**: Phantom power MUST be indicated in red and in a shape that no
  port uses.
- **FR-030**: When a run reaches at least one channel and all reachable
  channels agree on a colour, that colour MUST be applied along the whole run:
  the source's colour edge, every cable, every intermediate port, and the
  channel row. When they disagree, or no channel is reached, the run MUST stay
  neutral.
- **FR-031**: Cable-versus-network MUST be encoded independently of colour, so
  a network hop can carry a channel colour and still read as a network hop.
- **FR-032**: Selecting a node MUST open an inspector rail showing its details
  and, for a source, the channel it reaches; the inspector MUST be the Flow
  view's only editor.

### Key Entities *(include if feature involves data)*

- **Console**: A mixing desk booked for an event. Carries a display name, a
  role (front-of-house, monitor, broadcast), the catalog or owned item it was
  booked as, how many networked inputs and outputs it can address, how many
  local jacks it has of each direction, and where it sits on each of the two
  canvases. Owns input channels and outputs; referenced by cables that land on
  its local jacks. New in this feature; everything persisted about a desk today
  is one number — its vertical position on the output canvas.
- **Console local port**: One physical jack on the desk itself, addressed by
  direction and number, usable as either end of a cable. New in this feature;
  it is what makes a direct-into-the-desk run expressible.
- **Input channel** / **Output**: Unchanged, except that each now names the
  console it belongs to.
- **Stagebox**, **Stage multi**, **Input device**, **Output device**, **Input
  source**, **Mix group**, **DCA**, **Cable**: unchanged in substance; only
  where they are presented changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a 1440×900 desktop viewport, the first channel row of an event
  with equipment declared is visible without scrolling, and the whole channel
  list plus its summary rail fits in one screen for an event of 16 channels.
- **SC-002**: Reaching the signal-flow graph takes one click from landing on
  the tab, down from scrolling past five or more section headers.
- **SC-003**: A technician can answer "does every channel have a mic and a desk
  channel?" from a single screen, without opening any drawer, row editor or
  graph.
- **SC-004**: Every piece of information and every action available on the two
  audio tabs before this feature is still available after it; nothing is
  removed, only relocated.
- **SC-005**: A booked console appears on the rental order and in every export
  format the event's inventory offers, with quantity 1.
- **SC-006**: A patch that exceeds the booked console's channel count produces
  a visible warning stating the shortfall, where today it produces silence.
- **SC-007**: A source can be patched to a desk channel through zero
  intermediate boxes, which is impossible today.
- **SC-008**: A 32-source input patch's source lane fits within the height of
  the graph canvas without the rig or console lanes scrolling out of view.
- **SC-009**: For any cabled run, the presence of a colour on the run answers
  "does this signal reach a desk channel?" with no further interaction.
- **SC-010**: Every existing event opens after the change with an identical
  channel list, output list, cable set and graph layout.
- **SC-011**: Mobile rendering of both audio tabs is unchanged.

## Assumptions

- **Several consoles per event**, decided with the user on 2026-07-26. FOH plus
  monitors is a normal rider; the single-desk case is a list of one. This is
  what obliges every output and channel to name its console (FR-021).
- **Console port counts are typed per event**, decided with the user on the
  same date, matching how stageboxes and stage multis already work. No
  console-specific fields are added to the inventory catalog, which keeps
  hand-entered and generic-imported catalogs equally usable.
- **An owned console counts on the rental order**, decided with the user on the
  same date, following the precedent of processing devices rather than of
  stageboxes. The order doubles as the day's packing list, so a desk that is
  not being rented still needs to appear on it.
- Desktop only. Every mobile path in these tabs was deliberately designed in
  the mobile slice and is out of scope here.
- The cabling rules themselves do not change, including cableless
  console-to-stagebox network hops and the existing per-row (never
  width-based) rental counting.
- The existing colour-derivation rule is the specification for colour; this
  feature applies it more widely rather than redefining it.
- Roles and permissions are unchanged; this feature only changes which controls
  a restricted role is shown.
- The three user-visible views (Sheet, Flow, print) present the same data; none
  of them becomes the only place a fact is visible.

## Out of Scope

- Any change to mobile layouts or to the mobile edit sheets.
- Any change to the cabling model beyond making console-local jacks a valid
  cable end.
- Console-specific catalog fields (channel counts on inventory items).
- Scene, snapshot, gain or EQ data — this remains a patch planner, not a desk
  editor.
- Per-console network topology (which stagebox is on which card, Dante
  subscriptions, redundancy) beyond the connection type already stored.
- Changes to the Lighting, Stage Plot, Equipment or Rental Order tabs, other
  than the console appearing as one more counted line.
