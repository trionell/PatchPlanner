# Feature Specification: Audio output signal-flow graph

**Feature Branch**: `011-output-signal-graph`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Revamp of the audio output GUI: a Sankey-style
graph instead of the flat chain editor. A line represents a cable; a stereo
channel's two sides are independent branches. A node is a device — output-
only devices (a stagebox, or the mixer's local out) sit on the left,
input-only devices (a speaker, an IEM pack) sit on the right, anything with
both an input and an output sits in the middle. The graph shows only
device/cable names and port numbers. Devices are configured in a separate
table with input/output port counts and a connector type per side, since a
device like an amplifier has XLR inputs and Speakon outputs. The graph
supports moving/arranging devices freely. A cable is added by dragging from
one port to another; a picker to choose the catalog cable pops up when a
connection is drawn. Everything in the graph stays linked to the rest of
the planning tool (rental order, print sheets, signal flow)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and build the rig as a graph, not a list (Priority: P1)

A system tech planning a wedding's PA wants to see the actual shape of the
signal path — mixer out, through a controller and an amplifier, to the
tops and subs — the way they'd sketch it on paper, instead of reading a
flat list of hops per channel. They place the devices they're using
(an amplifier, a splitter, whatever the rig needs), drag them into a
layout that matches how the rig is actually built, and draw cables
between the jacks that are actually connected, picking the real cable
for each run from the rental catalog.

**Why this priority**: This is the whole point of the redesign — the
flat per-channel list (today's shape) doesn't show shared equipment or
branching the way a real signal-flow diagram does. Without this, nothing
else in this feature has anywhere to live.

**Independent Test**: Build a rig — mixer → controller → amplifier → two
speakers — entirely in the graph (placing devices, dragging them into
position, drawing cables, picking a catalog item for each) and confirm
every device and cable appears once, correctly, on the rental order.

**Acceptance Scenarios**:

1. **Given** an event with no output devices placed yet, **When** the tech
   adds an amplifier (2 inputs, 2 outputs) and two speakers, drags them
   into a left-to-right layout, and draws cables from the mixer's output
   to the amplifier and from the amplifier to each speaker, **Then** the
   full path is visible as connected lines and every device/cable pick
   appears once on the rental order.
2. **Given** a device already placed with cables attached, **When** the
   tech drags it to a new position, **Then** its cables follow it visually
   and nothing about the underlying connections changes.
3. **Given** a cable is drawn between two ports, **When** the tech
   completes the drag, **Then** a picker for the catalog cable item opens
   immediately, and the connection is only recorded once a pick is
   confirmed (or explicitly left for later).
4. **Given** a device has ports of different connector types on its input
   and output sides (e.g. an amplifier with XLR in and Speakon out),
   **When** the tech views the device on the canvas, **Then** each side's
   jacks are labeled with their own connector type.

---

### User Story 2 - Route a stage multi's channels independently (Priority: P2)

A stage multi (multicore) carries several independent channels between two
points. One channel might carry the mixer's monitor send to a headphone
amp at the drum riser; another might carry a completely different signal
from a stagebox to a completely different destination. The multicore
itself — its own cost and its fixed channel length — is already accounted
for as the piece of equipment it is; connecting something to one of its
channels shouldn't prompt for a cable pick or add anything extra to the
rental order.

**Why this priority**: Without this, a stage multi would either be
impossible to model as a real multi-source, multi-destination pass-through,
or its built-in channels would get double-billed as if they were separate
rentable cables — a real correctness gap once techs start using it in the
graph.

**Independent Test**: Route two different channels of one stage multi from
two different sources to two different destinations, and confirm the
rental order counts the multi itself once (as it already does today) and
adds no phantom cable line for either channel's input side.

**Acceptance Scenarios**:

1. **Given** a stage multi placed on the canvas, **When** the tech connects
   one of its channels to a source and a different channel to a different
   source, **Then** both connections are recorded independently — the
   multi is not assumed to carry one single bundled signal.
2. **Given** a cable is drawn into a stage multi's input side, **When**
   the connection is made, **Then** no cable-picker appears and nothing is
   added to the rental order for that connection — only the stage multi's
   own existing rental line applies.
3. **Given** a cable is drawn out of a stage multi's output side to a
   downstream device, **When** the connection is made, **Then** the
   picker appears as normal and that cable is counted, since it's a real,
   separate physical run.

---

### User Story 3 - See and print the graph-derived signal flow (Priority: P3)

A system tech reviewing the rig before load-in wants the existing Signal
Flow tab and output print sheet to describe the same paths the graph now
shows — hop by hop, from the console to the final destination — instead
of the flat chain description they replace.

**Why this priority**: Valuable once the graph itself works (P1/P2); closes
the paperwork loop the same way earlier slices did for the flat chain
model, but the graph is useful on its own before this ships.

**Independent Test**: Open the Signal Flow tab and the output print sheet
for an event with a graph built in P1/P2 and confirm every channel's full
path renders correctly, with any incomplete connection flagged as a gap.

**Acceptance Scenarios**:

1. **Given** a fully-connected multi-hop path, **When** the tech views the
   Signal Flow tab, **Then** the path renders in order from the mixer
   channel to the final destination.
2. **Given** a port with nothing connected to it yet, **When** the tech
   views Signal Flow or the print sheet, **Then** that gap is visibly
   flagged and included in the gap count, the same way an incomplete
   connection is already flagged today.

---

### Edge Cases

- A device with no connections at all (just placed, not yet wired) must
  not appear as an error — an empty device is a normal mid-planning state.
- Deleting a device that still has cables attached must clear those
  cables' endpoints rather than silently leaving them dangling or blocking
  the deletion — consistent with how deleting a stagebox or a shared
  device already behaves elsewhere in this tool.
- Deleting a cable must not delete the devices on either end.
- Two cables cannot occupy the same port at the same time — a port is
  either free or connected to exactly one cable.
- A stereo mixer output channel presents as two independent ports (its
  existing two independently-patchable physical sides), not one port that
  visually forks — a real console has two physical jacks for a stereo
  bus, not one.
- A device's port counts can be edited after it's already been placed and
  wired; reducing a port count below its number of existing connections
  must not silently delete those connections without telling the tech
  what would break.
- An event that already has output chains built in the previous (flat
  hop-chain) editor must convert into an equivalent graph automatically —
  nobody should have to rebuild a rig they already planned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to place a device on a canvas, configured
  with a number of input ports, a number of output ports, and a connector
  type for each side independently (a device may have inputs, outputs, or
  both).
- **FR-002**: Users MUST be able to freely drag a device with both inputs
  and outputs to any position on the canvas; its connections MUST follow
  it visually.
- **FR-003**: The mixer's own output channels MUST appear as an always-
  present set of output-only ports (one per output channel, matching
  today's channel numbers/names) without being separately created as a
  device.
- **FR-004**: A stagebox MUST appear on the canvas as an output-only node
  (its existing configured output count), reusing the stagebox already
  managed elsewhere in the tool rather than being redefined here.
- **FR-005**: A stage multi MUST appear on the canvas as a node with both
  input and output ports (its existing configured channel count on each
  side), reusing the stage multi already managed elsewhere in the tool.
- **FR-006**: Output-only devices (the mixer, stageboxes) MUST be
  positioned on one fixed side of the canvas and input-only devices
  (speakers, IEM packs, and similar) on the opposite fixed side; these may
  be reordered within their own side but not moved out of it.
- **FR-007**: Users MUST be able to connect any output port to any input
  port by drawing a line between them, regardless of which devices they
  belong to.
- **FR-008**: Completing a connection MUST prompt the user to pick a
  cable from the rental catalog for that specific connection, except when
  the connection lands on a stage multi's input side (FR-013).
- **FR-009**: The canvas MUST display each device's name and, for each
  port, its number/label and connector type; it MUST NOT clutter the view
  with any other planning detail.
- **FR-010**: Every device and cable placed in the graph MUST be reflected
  in the rental order, the output print sheet, and the Signal Flow tab —
  the graph is not a separate, disconnected view.
- **FR-011**: A device not linked to the rental catalog (owned gear) MUST
  still be placeable and connectable, but MUST be excluded from the rental
  order, consistent with how owned gear is already excluded elsewhere.
- **FR-012**: A stage multi's channels MUST be independently connectable —
  one channel's source and destination MUST NOT be assumed to be related
  to any other channel's.
- **FR-013**: A connection landing on a stage multi's input side MUST NOT
  prompt for a cable pick and MUST NOT add anything to the rental order —
  the multi's own rental line already accounts for its fixed-length,
  built-in wiring.
- **FR-014**: Deleting a device MUST clear every cable connected to it
  (leaving the other end's port free again) rather than blocking the
  deletion or leaving an orphaned connection.
- **FR-015**: Deleting a cable MUST leave both devices on its ends in
  place, only freeing the two ports it occupied.
- **FR-016**: A device's port counts and connector types MUST be editable
  after placement; reducing a port count that would orphan an existing
  connection MUST warn the user about which connections would be affected
  before applying the change.
- **FR-017**: Existing output channels built with the previous chain
  editor MUST convert automatically into an equivalent graph — same
  devices, same connections, same rental totals — with no manual rebuild
  required.
- **FR-018**: The Signal Flow tab and the output print sheet MUST describe
  each output channel's path using the graph's connections, hop by hop,
  from the mixer channel to its final destination(s).
- **FR-019**: Any port with no cable connected to it MUST be flagged as a
  gap in the Signal Flow tab and print sheet and counted in the existing
  gap total — except a stage multi's own channels, which are only a gap
  if genuinely nothing is connected on either side.

### Key Entities

- **Device**: A placeable node in the graph — a name, an optional link to
  a rental catalog item or an owned-gear item, a number of input ports
  with a connector type, a number of output ports with a connector type
  (either side may be zero), and a position on this event's canvas.
  Distinct from the stagebox and stage-multi entities, which already exist
  and are reused, not redefined, by this graph.
- **Port**: One numbered jack on a device — belongs to exactly one device,
  has a direction (in/out) and a connector type, and is connected to at
  most one cable at a time.
- **Cable**: A connection between exactly one output port and exactly one
  input port, optionally linked to a rental catalog item (never optional
  except when it lands on a stage multi's input side, where no catalog
  link applies at all).
- **Mixer output channel** *(existing entity, reused)*: Each of the
  event's output channels contributes one implicit output-only port on an
  always-present "mixer" node; a stereo channel contributes two
  independent ports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tech can place a 4-device rig (controller, amplifier, two
  speakers), wire it fully, and see it correctly reflected in the rental
  order in under three minutes.
- **SC-002**: Rearranging devices on the canvas never changes the
  underlying connections — rental totals before and after a rearrange are
  identical for the same event.
- **SC-003**: A stage multi carrying two independently-sourced,
  independently-destined channels shows both connections correctly and
  adds zero extra rental lines for its own built-in wiring.
- **SC-004**: Migrating an event's existing (pre-graph) output chains
  produces an equivalent graph with byte-for-byte unchanged rental totals.
- **SC-005**: The Signal Flow tab and print sheet describe 100% of output
  channels' paths using the graph, with every unconnected port flagged.

## Assumptions

- A device's connector type is set per side (one type for all its inputs,
  one type for all its outputs) rather than per individual port — matches
  every example encountered so far (an amplifier's inputs are uniformly
  XLR, its outputs uniformly Speakon); a device that genuinely mixes
  connector types within one side is out of scope, same workaround as
  existing "differing per-side picks" cases elsewhere in this tool
  (declare it as two devices).
- Device positions are stored per event — the same physical amplifier used
  across two different events can sit wherever makes sense in each event's
  diagram independently.
- Stageboxes and stage multis keep their existing management (channel
  counts, connector type, catalog link) unchanged; this feature only adds
  how they're drawn and connected on the new canvas, not how they're
  configured.
- A stagebox's own input side (used elsewhere for microphone patching) is
  out of scope for this graph — here it is drawn and used strictly as an
  output-only node, matching how the field feedback described it.
- This feature fully replaces the flat per-channel chain editor introduced
  previously; that editor's data converts into the graph automatically and
  is not kept as a parallel view.
- Single planner per event (established product constraint); no
  concurrent-edit handling for two people editing the same graph at once.
