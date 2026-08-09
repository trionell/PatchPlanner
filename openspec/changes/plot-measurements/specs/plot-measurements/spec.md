## Purpose

What a measurement on a stage plot is: a stated distance between two anchored points, drawn
the way a technical drawing states one, so a plot can say how far apart things are instead of
leaving it to be counted off the grid or judged by eye.

## ADDED Requirements

### Requirement: A measurement states a distance the system derives

A measurement SHALL hold two endpoints and derive its value from them. The system SHALL NOT
accept a typed value for a measurement, and SHALL NOT store one.

The value SHALL be stated in centimetres, the unit the plot is modelled in throughout.

#### Scenario: The value follows the geometry

- **WHEN** a measurement exists between two anchored points and either point moves
- **THEN** the stated value changes to the new distance
- **AND** the user is not asked to update it

#### Scenario: No control offers to set the value

- **WHEN** a measurement is selected and its properties are shown
- **THEN** the value is stated and there is no control that would let it disagree with the
  drawing

### Requirement: An endpoint anchors to an element feature or to a free point

Each endpoint SHALL be either a **feature of one element** or a **free point** in the plot's
coordinate space.

An element-anchored endpoint SHALL be stored as a reference to that element and the feature,
never as a copied position, so it is re-derived from the element's current geometry every
time the measurement is drawn.

A free endpoint SHALL be stored as a position, SHALL snap to the plot's grid when placed or
moved, and SHALL NOT move when any element moves.

The two endpoints of one measurement SHALL be independent: either, both or neither may be
element-anchored.

#### Scenario: An anchored end follows its element

- **WHEN** an element carrying an anchored endpoint is moved, resized, rotated or raked
- **THEN** the endpoint is re-derived from the element's new geometry
- **AND** the measurement is still drawn to the same named feature

#### Scenario: A free end stays put

- **WHEN** an element near a free endpoint is moved
- **THEN** the free endpoint does not move

#### Scenario: Measuring from a fixed point to a thing

- **WHEN** a measurement is drawn from a free point to an element feature
- **THEN** both ends behave by their own rule and the measurement is valid

### Requirement: An element offers its centre, its corners, its side midpoints and its faces

An element SHALL offer, as anchor features: its centre; each corner of its drawn silhouette;
the midpoint of each straight side of that silhouette; and each straight side as a **face**.

These features SHALL be derived from the element's silhouette in the view being drawn, so
that an element whose silhouette is not a rectangle — one carrying both a plan rotation and a
rake — offers the corners and sides it actually has, not the corners of an unrotated box.

An elliptical element SHALL offer its centre and the four points at its top, bottom, left and
right. It SHALL offer **no face** in any view that looks along its extrusion, where its
silhouette is the curve itself and a perpendicular differs at every point along it, so
"anywhere along this side" cannot be kept. In every other view its silhouette is a plain
rectangle — a cylinder seen straight-on — and its sides SHALL be offered as any other
element's are. An elliptical element SHALL NOT offer corners in any view: the silhouette hull
is its bounding box, whose corners are the one place the drawn shape is not.

The system SHALL make plain, before the pick is committed, which feature would be taken —
in particular which of a side's midpoint or that same side's face is being aimed at.

#### Scenario: A raked element's corners

- **WHEN** an element carries both a plan rotation and a rake, so its silhouette is not a
  rectangle
- **THEN** the anchor features offered are the corners and side midpoints of that silhouette

#### Scenario: An ellipse seen along its extrusion

- **WHEN** an elliptical element is aimed at in a view that looks along its extrusion
- **THEN** it offers a centre and four quadrant points
- **AND** it offers no face anchor, and no corners

#### Scenario: An ellipse seen from the side

- **WHEN** the same element is aimed at in a view that draws it as a rectangle
- **THEN** its straight silhouette sides are offered as any other element's are

#### Scenario: Telling a midpoint from its face

- **WHEN** the pointer is over a side's midpoint, and then moved along that same side
- **THEN** the feature that would be taken is shown, and changes from the midpoint to the
  face

### Requirement: A face anchor meets the face at a right angle and slides along it

Where an endpoint is a face, the measurement SHALL meet that face's line at 90°, and SHALL
be free to sit anywhere along it. Its value SHALL be the perpendicular distance from the
other endpoint to that face's line.

The system SHALL draw the foot where the perpendicular actually falls, marked as a right
angle. Where the foot falls beyond the drawn extent of that side, the system SHALL extend the
side's line to reach it rather than drawing a foot in empty space.

Both endpoints MAY be faces only where the two faces are parallel; where they are not, the
system SHALL decline the second face and offer that element's point features instead.

#### Scenario: Perpendicular to a stage edge

- **WHEN** a measurement anchors one end to a rectangular element's face and the other to a
  point
- **THEN** the measurement meets that face at a right angle
- **AND** its value is the perpendicular distance to that face's line

#### Scenario: The foot falls off the side

- **WHEN** the perpendicular from the other endpoint lands beyond the end of the drawn side
- **THEN** the side's line is extended to the foot
- **AND** the right-angle mark is drawn where the perpendicular actually meets it

#### Scenario: Two faces that are not parallel

- **WHEN** the user picks a second face that is not parallel to the first
- **THEN** the system does not commit that pick, and offers the element's point features

### Requirement: A measurement is aligned, horizontal or vertical

A measurement SHALL carry one of three types:

- **aligned** — the line runs between the two endpoints and states the true distance;
- **horizontal** — the line states the separation of the two endpoints along the view's
  horizontal axis alone;
- **vertical** — the line states their separation along the view's vertical axis alone.

The type SHALL be chosen when the measurement is drawn and SHALL be changeable afterwards
without redrawing it. A locked type SHALL state its axis separation even where the endpoints
are not on that axis.

#### Scenario: Two points on a diagonal

- **GIVEN** two endpoints separated both horizontally and vertically
- **WHEN** the measurement is aligned
- **THEN** it states the true point-to-point distance
- **WHEN** the same measurement is changed to horizontal
- **THEN** it states the horizontal separation alone, which is a smaller number

#### Scenario: The type survives the change

- **WHEN** a measurement's type is changed
- **THEN** its endpoints are unchanged and it is not redrawn from scratch

### Requirement: The dimension line is held away from what it measures

A measurement SHALL carry an offset that moves its dimension line away from the geometry,
perpendicular to the measured direction, leaving extension lines running from the endpoints
out to the line.

The offset SHALL be stored in centimetres, SHALL snap to the plot's grid, and SHALL be
reversible so the line can be held on either side. Changing the offset SHALL NOT change the
stated value.

A measurement SHALL be committable with no offset, running directly between its endpoints.

#### Scenario: Moving the line clear of the drawing

- **WHEN** the user drags a measurement's dimension line away from the elements it measures
- **THEN** the line moves and extension lines grow to reach the endpoints
- **AND** the stated value does not change

#### Scenario: Flipping to the other side

- **WHEN** the offset is reversed
- **THEN** the dimension line is held on the opposite side of the measured direction
- **AND** the stated value does not change

### Requirement: A measurement belongs to the view it was drawn in

A measurement SHALL belong to exactly one of the plot's views, and SHALL be drawn in that
view only.

#### Scenario: Switching views

- **WHEN** a measurement is drawn in the top view and the plot is switched to an elevation
- **THEN** that measurement is not drawn
- **AND** it is drawn again when the top view returns

#### Scenario: Measuring a height

- **WHEN** a distance above the floor is to be stated
- **THEN** it is measured in an elevation, which is the only view that draws it

### Requirement: A measurement belongs to a layer but not to its colour

A measurement SHALL belong to one layer and SHALL inherit that layer's visibility and lock,
as an element does.

A measurement SHALL NOT be drawn in its layer's colour. All measurements SHALL be drawn in
one annotation ink, so that layer colour continues to mean equipment identity alone.

A measurement SHALL be drawn only where its own layer is visible **and** every element it
anchors to is visible. A measurement anchored to no element SHALL depend on its own layer
alone.

Measurements SHALL be drawn above every element, whatever the layer order.

#### Scenario: Hiding a layer of equipment

- **WHEN** a layer is hidden and a visible layer's measurement anchors to an element on it
- **THEN** that measurement is not drawn, because one of its ends refers to something no
  longer shown

#### Scenario: A locked layer

- **WHEN** a measurement's layer is locked
- **THEN** the measurement can still be selected and read
- **AND** it cannot be re-anchored, offset or moved

#### Scenario: Layer colour is not borrowed

- **WHEN** measurements are drawn on layers of differing colours
- **THEN** all of them are drawn in the same annotation ink

### Requirement: A measurement is drawn so its value can always be read

The system SHALL draw a measurement as a dimension line terminated at both ends, with its
value stated on the line.

Where the value cannot fit between the terminators, the system SHALL place the value outside
the measurement rather than overlapping, clipping or hiding it.

A measurement MAY carry a short note of the user's own, stated with the value.

#### Scenario: A dimension too short for its value

- **WHEN** a measurement is short enough that its value would not fit between its terminators
- **THEN** the value is placed outside the measurement and remains legible

#### Scenario: A note

- **WHEN** a measurement carries a note
- **THEN** the note is stated with the value and does not replace it

### Requirement: Deleting an element takes its measurements with it

Where an element carrying anchored measurements is deleted, those measurements SHALL be
deleted with it. The system SHALL NOT leave a measurement anchored to an element that no
longer exists, and SHALL NOT silently convert its endpoint to a free point.

The confirmation raised for that deletion SHALL state how many measurements go with it.

#### Scenario: Deleting a measured element

- **WHEN** an element with two measurements anchored to it is deleted
- **THEN** the confirmation states that two measurements go with it
- **AND** both are gone once it is confirmed

#### Scenario: No dangling measurement survives

- **WHEN** any path removes an element
- **THEN** no measurement referring to it remains readable through the plot

### Requirement: A phone reads a measurement and never authors one

At or below the phone breakpoint the system SHALL draw every measurement on the plot and
SHALL offer no way to create one, re-anchor one, change its type, or move its dimension line.

Selecting a measurement on a phone SHALL state both its endpoints, its type and its value,
and SHALL allow its note to be edited.

The phone SHALL NOT offer to delete a measurement.

The plot surface SHALL state which acts are withheld and what remains available, rather than
presenting a control that does nothing.

#### Scenario: Reading a plot on site

- **WHEN** a plot carrying measurements is opened on a phone
- **THEN** every measurement is drawn and readable
- **AND** no tool for creating one is present

#### Scenario: Tapping a measurement

- **WHEN** a measurement is tapped on a phone
- **THEN** its endpoints, type and value are stated
- **AND** its note can be edited
- **AND** no control to delete it is present

### Requirement: Screen and paper state the same distance

A measurement's value SHALL be derived from its stored endpoints by one definition, so that
the number on the canvas and the number in the generated document are the same number.

The document SHALL NOT be given a value to print; it SHALL derive the value itself from the
stored anchors.

#### Scenario: The same plot on both

- **WHEN** a plot carrying measurements is read on the canvas and produced as a document
- **THEN** every measurement states the same value in both

#### Scenario: A stale client

- **WHEN** a document is produced for a plot whose measurements were changed since the canvas
  last read it
- **THEN** the document states the stored geometry's values, not the ones the canvas held
