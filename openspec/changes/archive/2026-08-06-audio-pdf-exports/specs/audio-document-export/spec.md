## Purpose

What the application produces when asked for an event's audio plan on paper: one generated
document that states the patch, the rig it runs on, and the signal flow as a drawing every
cable can be traced through. It exists because a signal path compressed into a table column
is not readable, and because a browser cannot be told to repeat a header, change orientation
mid-document, or route a line.

## ADDED Requirements

### Requirement: One audio document, requested from anywhere

The system SHALL produce the audio plan as a single downloadable PDF containing, in this
order: the input patch, the output patch, the stage rig, the signal flow of the input graph,
and the signal flow of the output graph.

Every audio surface that offers an export SHALL deliver this same document. The surface the
request came from SHALL NOT change what the document contains.

The document SHALL be requestable by URL alone, without any state computed by a browser.

An event with no audio planning at all SHALL still produce a document, whose sections state
that they are empty rather than being omitted.

#### Scenario: Requesting the export from the input patch

- **WHEN** a user with read access to an event requests the audio export
- **THEN** the response is a PDF attachment named for the event
- **AND** it contains all five sections in the order above

#### Scenario: The same document from the signal flow surface

- **WHEN** the same user requests the audio export from the signal-flow surface instead
- **THEN** the document is byte-for-byte the document section 1 would have produced for that
  event at that moment

#### Scenario: A user without access

- **WHEN** a user who is not a member of the event requests its audio export
- **THEN** the request is refused with the same status the event's other reads use
- **AND** no part of the document is returned

#### Scenario: An event with nothing planned

- **WHEN** an event has no channels, outputs, boxes or cables
- **THEN** a document is still produced
- **AND** each section states that it holds nothing rather than being absent

### Requirement: The document identifies the event on every page

The first page SHALL carry a header block stating the event name, the venue, the event
dates, the bound inventory's name, the generation date, and a count of what the document
describes.

Every page after the first SHALL carry a running head naming the section it is inside and
marking it as a continuation.

Every page SHALL carry a footer stating the document's title and the page number against the
total page count.

#### Scenario: A patch that runs past one page

- **WHEN** the input patch has more channels than fit on the first page
- **THEN** the continuation page carries a running head naming the input patch
- **AND** the table's column headers are repeated above the first row on that page
- **AND** the footer states the correct page number and total

### Requirement: The input patch states channel identity and source in one table

The input patch SHALL present one row per channel, ordered by channel number, stating: the
channel number, its name, whether it is mono or stereo, the name of the source feeding it,
the catalogue item used as microphone or DI, the catalogue item used as a stand, whether
phantom power is switched on, the connector type, and the channel's group and DCA membership.

Group membership and DCA membership SHALL be distinguishable from one another without
relying on colour.

The system SHALL NOT print the signal path as a joined string of steps in a table column.

#### Scenario: A channel fed by a microphone on a stand

- **WHEN** a channel is fed by a source of kind `mic` with a microphone item, a stand item,
  phantom power on, and an XLR connector
- **THEN** its row names the source, the microphone item, the stand item, the connector
- **AND** marks phantom power

#### Scenario: A channel fed by a line source

- **WHEN** a channel is fed by a source of kind `line`
- **THEN** the microphone, stand and phantom cells state that they do not apply rather than
  being blank

#### Scenario: A channel with nothing patched into it

- **WHEN** no cable path reaches a channel from any source
- **THEN** the row states that the channel has no source
- **AND** the document does not present the channel as complete

### Requirement: The output patch states each output's destination

The output patch SHALL present one row per output, ordered by output number, stating: the
output number, its name, its output type, whether it is mono or stereo, the far end of its
chain, the box it leaves the desk through, and the connector type.

#### Scenario: An output reaching a speaker through a stagebox

- **WHEN** an output is cabled from the desk through a stagebox to an output device
- **THEN** its row names the output device as the destination
- **AND** names the stagebox and its jack as the route

#### Scenario: An output that reaches nothing

- **WHEN** an output is patched at the desk but no cable leaves it
- **THEN** the row states that the output reaches nothing
- **AND** the destination and route are not left silently blank

### Requirement: A row may carry a continuation line

Where a row has a note, or states an incompleteness, the system SHALL print that text as a
second line beneath the row spanning the full text block, rather than as a table column.

A row without such text SHALL cost no additional height.

#### Scenario: A channel with a note

- **WHEN** a channel carries a note
- **THEN** the note prints on its own line directly beneath that channel's row
- **AND** the rows above and below are unchanged in height

### Requirement: The document states the rig the patch runs on

The stage rig section SHALL list every stagebox, stage multi, input device, output device and
console belonging to the event, stating for each: its name, its catalogue item, what kind of
box it is, its connection type, how many of its input jacks are patched against how many are
installed, the same for its output jacks, and the resulting spare capacity.

A console's figures SHALL exclude its local jack panel, which SHALL be stated separately.

The section SHALL close with the totals across the whole rig.

The system SHALL NOT state where a box is physically located. Stored node positions are
placement within a signal-flow graph and SHALL NOT be presented as a physical location.

#### Scenario: A stagebox partly in use

- **WHEN** a stagebox with 32 input and 24 output jacks has 8 inputs and 4 outputs patched
- **THEN** its row states 8 of 32 and 4 of 24
- **AND** states 24 input and 20 output jacks spare

#### Scenario: A desk with a local panel

- **WHEN** a console has both networked and local jacks
- **THEN** its counts cover the networked jacks
- **AND** its local panel's counts are stated on their own line

### Requirement: The signal flow is drawn, and inputs and outputs are drawn separately

The input graph and the output graph SHALL each be drawn as their own section, each starting
a new page in landscape orientation. They SHALL NOT be combined into one drawing.

Each drawing SHALL place its boxes according to the positions already stored for that graph,
preserving their relative arrangement, and SHALL draw one line per cable between the jacks
that cable connects.

Each box SHALL state its name, its kind, its jacks, and which of those jacks are patched.
Whether a jack is patched SHALL be legible without colour.

#### Scenario: A graph drawn from stored positions

- **WHEN** a planner has arranged the input graph's boxes on the canvas
- **THEN** the drawing preserves that arrangement
- **AND** a box the planner placed left of another is drawn left of it

#### Scenario: A jack with nothing in it

- **WHEN** a box has jacks that no cable reaches
- **THEN** those jacks are drawn and marked as free
- **AND** the distinction from a patched jack survives monochrome printing

### Requirement: No two cable lines share a line

Every cable is drawn in the same ink, so two parallel runs that touch cannot be told apart
and the drawing would misstate the patch. The system SHALL route cable lines such that no two
lines are collinear over any shared length, with one exception stated below.

- Lines SHALL run only horizontally and vertically, meeting at right angles.
- Each vertical run crossing the gap between two columns of boxes SHALL occupy its own
  position within that gap. Two vertical runs MAY occupy the same position only when their
  vertical extents cannot touch.
- Each horizontal run SHALL sit at the height of the jack it serves. Two horizontal runs MAY
  share a height only when their horizontal extents do not overlap.
- A line SHALL NOT pass beneath a box. It SHALL route around it.
- Two lines leaving the same jack MAY share only the stub before they diverge, and that stub
  SHALL be short enough that the divergence is visible.
- Lines crossing SHALL be drawn as a plain intersection, with no break, hop or other marking.

#### Scenario: Many cables into one box

- **WHEN** eight sources are cabled into eight jacks of the same stagebox
- **THEN** eight distinct lines are drawn
- **AND** no two of them share ink over any length

#### Scenario: A box in the way

- **WHEN** a cable runs between two boxes and a third box lies on the straight route
- **THEN** the line routes around that box
- **AND** does not pass beneath it

#### Scenario: One jack feeding two places

- **WHEN** one jack is cabled to two different destinations
- **THEN** both lines leave that jack
- **AND** they separate within a short distance of it

#### Scenario: Two cables crossing

- **WHEN** two cable lines must cross to reach their destinations
- **THEN** they are drawn crossing at a right angle
- **AND** neither is broken, hopped or otherwise marked at the crossing

### Requirement: The drawing fits the page or says that it does not

Each drawing SHALL be scaled to fit the page's text block, and the scale used SHALL be stated
on the page.

Where fitting the drawing to one page would render its jack labels below the document's
legibility floor, the system SHALL instead divide the drawing across several pages, each
stating which part of the whole it is, and SHALL divide it in the space between boxes and
never through a box.

#### Scenario: A graph that fits

- **WHEN** a graph's drawing fits the text block with labels above the legibility floor
- **THEN** it is drawn on one page
- **AND** the scale used is stated on that page

#### Scenario: A graph too large for one page

- **WHEN** fitting a graph to one page would take its labels below the legibility floor
- **THEN** the drawing is divided across pages
- **AND** each page states which part of the whole it shows
- **AND** no box is cut by the division

### Requirement: The document is complete without colour

Where the document carries colour it SHALL be carrying a value the planner chose — a channel
or output strip colour. Every fact the document states SHALL remain legible when the document
is printed in monochrome.

The system SHALL NOT depend on any character outside the document's encoding to convey
meaning; marks that cannot be represented as text SHALL be drawn.

#### Scenario: Printed on a monochrome printer

- **WHEN** the document is printed without colour
- **THEN** every channel, output, jack state and phantom-power state remains identifiable
- **AND** no piece of information is available only through a hue

### Requirement: Lighting is not part of this document

The lighting rig sheet SHALL remain available through the browser's own print path and SHALL
NOT be included in the audio document.

#### Scenario: Exporting from the lighting surface

- **WHEN** a user asks to print from the lighting surface
- **THEN** the browser print path is used, as before
- **AND** no audio document is produced
