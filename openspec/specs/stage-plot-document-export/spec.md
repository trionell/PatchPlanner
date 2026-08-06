# stage-plot-document-export Specification

## Purpose
What the application produces when asked for a stage plot on paper: one scale drawing of one
plot, in the three orthographic views plus a schedule, at a single stated scale, in colour
that survives the crossing from a dark canvas onto white paper.
## Requirements
### Requirement: One stage plot document, for one plot

The system SHALL produce, on request, a single document for a single stage plot. An event
holding several plots SHALL yield a separate document for each; the system SHALL NOT combine
them.

The request SHALL be a read, and SHALL be permitted to anyone who may read the event. A
request naming a plot that does not belong to the named event SHALL be refused as not found.

#### Scenario: Requesting the document for a plot

- **WHEN** a user with access to the event asks for a plot's document
- **THEN** a single PDF is returned as a download
- **AND** its name identifies both the event and the plot

#### Scenario: An event with two plots

- **WHEN** a user asks for each of an event's two plots in turn
- **THEN** two documents are returned, each containing only its own plot

#### Scenario: A user without access

- **WHEN** a user who cannot read the event asks for one of its plots
- **THEN** no document is produced

#### Scenario: A viewer

- **WHEN** a user whose role on the event is viewer asks for a plot
- **THEN** the document is produced, because an export reads

#### Scenario: A plot belonging to another event

- **WHEN** a request names an event and a plot that belongs to a different event
- **THEN** the request is refused as not found

#### Scenario: A plot with nothing on it

- **WHEN** a plot has no visible elements
- **THEN** the document is still produced with all its sheets
- **AND** each drawing sheet states in words that the plot is empty

### Requirement: The document holds four sheets in a fixed order

The document SHALL contain the top view, the front view, the side view and an element
schedule, one sheet each, in that order.

All three views SHALL be drawn regardless of which view the editor was last showing. The
document's contents SHALL NOT depend on any editor state.

#### Scenario: A plot last edited in the side view

- **WHEN** a plot whose stored active view is the side view is exported
- **THEN** the document still holds the top, front and side views in that order
- **AND** the side view is not given any different treatment for having been the active one

#### Scenario: Every sheet is identifiable alone

- **WHEN** any single sheet is separated from the document
- **THEN** it names the event, the plot, which view it is, its number in the set, and the
  scale it is drawn at

### Requirement: One scale for the whole document, stated and drawn

The system SHALL choose one scale for the whole document and SHALL draw all three views at
it. The scale SHALL be the largest on the document's scale ladder at which every view fits
its frame.

The scale SHALL be stated in figures on every sheet, and SHALL also be drawn as a graduated
bar in real units, so that the scale remains readable after the sheet has been resized by a
copier.

#### Scenario: A plot that fits at a larger scale

- **WHEN** every view of a plot fits its frame at 1:50
- **THEN** all three views are drawn at 1:50 and 1:50 is stated

#### Scenario: One view forces the scale

- **WHEN** two views fit at 1:50 but the third does not
- **THEN** all three views are drawn at the next scale down, and that scale is stated

#### Scenario: The stated scale and the drawn bar agree

- **WHEN** a sheet states a scale
- **THEN** the graduated bar on that sheet measures the distance it is labelled with, at that
  scale

### Requirement: The three views are registered to each other

The system SHALL compute one window per world axis — stage width, stage depth and height —
and SHALL share each window between the views that use it.

An element's position along a shared axis SHALL therefore fall at the same place on the sheet
in every view that draws that axis, so the views can be read against one another.

#### Scenario: A vertical dropped from the plan

- **WHEN** an element appears in both the top view and the front view
- **THEN** it occupies the same horizontal position on both sheets

#### Scenario: The elevations share a floor

- **WHEN** the front and side views are compared
- **THEN** the floor falls at the same height on both sheets, and an element at a given height
  is drawn at the same height on both

### Requirement: A layer colour crosses onto paper by lightness

Layer colour is the plot's whole palette, and every layer colour is chosen against a dark
canvas. When a layer colour is drawn on paper, the system SHALL preserve its hue and
saturation, and SHALL lower only its lightness, until the ink meets the contrast floor
against white stated in `design/patterns.md` §8.

The system SHALL lower lightness no further than needed to meet that floor, and SHALL NOT
lower it past the lightness floor stated in the same place, so that a coloured line is never
reduced to the document's own ink.

A layer colour that already meets the floor SHALL be drawn unchanged. The system SHALL NOT
invert a colour's lightness, which would degrade a colour that was already legible.

#### Scenario: A pale colour chosen for the dark canvas

- **WHEN** a layer's colour does not meet the contrast floor against white
- **THEN** it is drawn darker, at the same hue and saturation, meeting the floor

#### Scenario: A colour that is already dark enough

- **WHEN** a layer's colour already meets the contrast floor against white
- **THEN** it is drawn exactly as stored

#### Scenario: A near-grey that is already dark

- **WHEN** a layer's colour is a dark near-grey that meets the floor
- **THEN** it is drawn unchanged, and is not lightened

#### Scenario: A very dark colour

- **WHEN** meeting the floor would take a colour below the lightness floor
- **THEN** it is drawn at the lightness floor, and remains distinguishable from the
  document's ink

### Requirement: A layer with no colour prints as ink

A layer that has no colour set SHALL be drawn in the document's own ink. The system SHALL NOT
carry the canvas's default layer colour onto paper, because that value is a consequence of
the dark ground and not a choice the planner made.

#### Scenario: An uncoloured layer

- **WHEN** a layer has no colour set
- **THEN** its elements are drawn in the document's ink
- **AND** its entry in the layer key shows that ink

#### Scenario: An uncoloured layer beside a grey one

- **WHEN** a plot has one layer with no colour and one layer whose colour is a dark grey
- **THEN** the two are drawn in distinguishable inks

### Requirement: Every drawing sheet carries its own key

Each of the three drawing sheets SHALL carry a key giving the scale, the grid, every layer
with its paper ink and name, the truss fixtures shown on that sheet, and the drawing
conventions used.

The key SHALL be complete on each sheet, so that a sheet removed from the document can still
be read.

#### Scenario: A single sheet taken to the stage

- **WHEN** one drawing sheet is separated from the document
- **THEN** the layer names, the scale, the grid and the conventions are all present on it

#### Scenario: The key names every layer

- **WHEN** a plot has layers
- **THEN** every visible layer appears in the key with the ink it is drawn in and the number
  of elements on it

### Requirement: The grid is drawn at a legible density and states itself

The system SHALL draw the plot's grid only at a density that remains legible at the chosen
scale, stepping up to a whole multiple of the plot's grid size where the plot's own grid
would be too fine.

The sheet SHALL state both the plot's grid size and the interval actually drawn.

#### Scenario: A fine grid at a small scale

- **WHEN** a plot's grid square would measure less than the document's legible minimum at the
  chosen scale
- **THEN** the grid is drawn at a whole multiple of that grid size which clears the minimum
- **AND** the sheet states the plot's grid size and the drawn interval

#### Scenario: A grid that is already legible

- **WHEN** a plot's grid square already clears the legible minimum
- **THEN** it is drawn at its own size, and the sheet states that size

### Requirement: The elevations stand on a floor datum

The front and side views SHALL draw the floor as a datum: a solid rule with hatching beneath
it, labelled with its height of zero.

A dashed line SHALL NOT be used for the floor, so that dashes remain reserved for what is
unresolved.

#### Scenario: An elevation

- **WHEN** the front or side view is drawn
- **THEN** the floor appears as a solid hatched datum spanning the drawing
- **AND** it is labelled as zero height

### Requirement: An elevation names only what is off the floor

The top view SHALL label every named element. The front and side views SHALL label only those
elements that stand above the floor.

An element standing on the floor is identified in the plan; labelling it again in an elevation
places its label on the datum alongside every other floor-standing element's, where none of
them can be read.

#### Scenario: A rig standing on the floor

- **WHEN** several named elements sit on the floor
- **THEN** they are labelled in the top view
- **AND** they are drawn without labels in the elevations

#### Scenario: A flown element

- **WHEN** a named element is hung above the floor
- **THEN** it is labelled in the elevations as well as in the plan

### Requirement: A truss fixture is numbered on the drawing and named in the schedule

Where a truss carries fixtures, the system SHALL draw each fixture at its true point on the
bar as a numbered mark, and SHALL state that number against the fixture's name, its
identifier, its address and its position along the bar in the sheet's key and in the element
schedule.

The system SHALL NOT write a fixture's full label beside the mark on the drawing, because at
the scales a stage is drawn at the label is many times the size of the mark.

#### Scenario: A truss with fixtures

- **WHEN** a truss carrying fixtures is drawn
- **THEN** each fixture appears as a numbered mark at its own offset and lane on the bar
- **AND** each number is resolved to a name, identifier, address and offset in the key

#### Scenario: A fixture on an elevation

- **WHEN** a truss carrying fixtures is drawn in an elevation
- **THEN** each fixture's mark hangs below the bar's underside, connected to it

#### Scenario: A fixture whose offset exceeds the bar

- **WHEN** a fixture's stored offset is longer than the truss's current length
- **THEN** it is drawn at the end of the bar rather than past it

### Requirement: The element schedule states every element's stored geometry

The fourth sheet SHALL list every visible element, grouped by layer under that layer's paper
ink, giving its name, its centre, its height above the floor, its three dimensions and its
plan rotation and tilt, in the units they are stored in.

An element without a name SHALL be listed by what it is, never as a blank.

A truss SHALL carry its bar and its fixtures as continuation lines beneath its row, rather
than as columns that are empty on every other row.

The sheet SHALL state what its columns mean.

#### Scenario: An element with a name

- **WHEN** a named element is listed
- **THEN** its row states its name, centre, height, dimensions, rotation and tilt

#### Scenario: An element without a name

- **WHEN** an unnamed element is listed
- **THEN** its row names what it is

#### Scenario: A truss in the schedule

- **WHEN** a truss is listed
- **THEN** its row is followed by its bar's length and hanging height, and by one line per
  fixture giving the number used on the drawings

#### Scenario: Grouping matches the key

- **WHEN** the schedule groups by layer
- **THEN** each group's ink is the same ink that layer is drawn in on the drawing sheets

### Requirement: The drawing fits the sheet or divides across sheets

Where a plot cannot be drawn at the smallest scale on the ladder within one frame, the system
SHALL divide the drawing across several sheets at that scale rather than shrinking it further
or refusing.

A division SHALL fall between elements and never through one. Each part SHALL state its
position in the set, and SHALL be drawn at the same stated scale as every other part, so the
parts can be laid side by side and read as one drawing.

#### Scenario: A plot that fits

- **WHEN** every view fits its frame at a scale on the ladder
- **THEN** each view is drawn on one sheet

#### Scenario: A plot too large for the smallest scale

- **WHEN** a view will not fit its frame at the smallest scale on the ladder
- **THEN** that view is divided across several sheets at that scale
- **AND** each sheet states which part of the set it is
- **AND** no element is cut by the division

### Requirement: The document is complete without colour

Colour on this document carries layer identity, which no other document's colour does. Every
fact the drawing states through colour SHALL therefore also be stated in words: every layer
SHALL be named in the key, and every element SHALL be listed under its layer in the schedule.

The system SHALL NOT depend on any character outside the document's encoding to convey
meaning; marks that cannot be represented as text SHALL be drawn.

#### Scenario: Printed on a monochrome printer

- **WHEN** the document is printed without colour
- **THEN** every layer is still identifiable by name through the key and the schedule
- **AND** every element can still be found and measured

#### Scenario: A mark that carries meaning

- **WHEN** the document needs to state a scale bar, a floor, a fixture mark or a direction
- **THEN** the mark is drawn rather than typed

### Requirement: Screen and paper draw the same element

An element's icon SHALL be drawn from one definition, so that the shape on paper is the shape
on the canvas. The system SHALL NOT hold two independent descriptions of a glyph.

An icon the system does not recognise SHALL be drawn as a visible placeholder on paper, as it
is on screen, and SHALL never prevent the document from being produced.

#### Scenario: An icon drawn in both places

- **WHEN** an element with a built-in icon is drawn on the canvas and in the document
- **THEN** both are drawn from the same stored definition of that icon

#### Scenario: An unknown icon

- **WHEN** an element names an icon the system does not have
- **THEN** the document draws a visible placeholder in its place and is still produced

