## ADDED Requirements

### Requirement: The drawing sheets carry the plot's measurements

Each drawing sheet SHALL draw the measurements belonging to that sheet's view, under the same
visibility rules the canvas applies: the measurement's own layer visible, and every element it
anchors to visible.

A measurement SHALL be drawn in the document's own ink rather than in any colour, and SHALL be
told apart from the equipment it measures by line weight rather than by hue, so that it stays
distinguishable on a monochrome print.

The document SHALL state, in each sheet's key, that the drawing carries measurements and in
what unit they are given. Measurements SHALL NOT be listed in the element schedule: a
measurement is a statement about elements, not one of them.

#### Scenario: A dimensioned plot on paper

- **WHEN** a plot carrying measurements is produced as a document
- **THEN** each view's sheet draws that view's measurements
- **AND** none of the other views' measurements appear on it

#### Scenario: Printed without colour

- **WHEN** the document is printed on a monochrome printer
- **THEN** every measurement is still distinguishable from the elements it measures

#### Scenario: The schedule is unchanged

- **WHEN** a plot carrying measurements is produced as a document
- **THEN** the element schedule lists the plot's elements and no measurements

#### Scenario: A hidden anchor

- **WHEN** a measurement anchors to an element on a hidden layer
- **THEN** it is not drawn in the document, exactly as it is not drawn on the canvas

## MODIFIED Requirements

### Requirement: The drawing fits the sheet or divides across sheets

Where a plot cannot be drawn at the smallest scale on the ladder within one frame, the system
SHALL divide the drawing across several sheets at that scale rather than shrinking it further
or refusing.

A division SHALL fall between elements and never through one. Each part SHALL state its
position in the set, and SHALL be drawn at the same stated scale as every other part, so the
parts can be laid side by side and read as one drawing.

A measurement whose drawing spans a division SHALL be drawn on every part it reaches, each
part carrying the value in full, so that a part read on its own still states the distance. The
system SHALL NOT drop such a measurement, and SHALL NOT divide its value between parts.

#### Scenario: A plot that fits

- **WHEN** every view fits its frame at a scale on the ladder
- **THEN** each view is drawn on one sheet

#### Scenario: A plot too large for the smallest scale

- **WHEN** a view will not fit its frame at the smallest scale on the ladder
- **THEN** that view is divided across several sheets at that scale
- **AND** each sheet states which part of the set it is
- **AND** no element is cut by the division

#### Scenario: A measurement crossing a division

- **WHEN** a measurement runs from one part of a divided drawing into another
- **THEN** it is drawn on both parts
- **AND** each part states its full value
