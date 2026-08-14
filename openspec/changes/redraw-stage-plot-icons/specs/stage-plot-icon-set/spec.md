## Purpose

The built-in shapes a stage plot element is drawn as, in each of the three
views. One description serves both the canvas and the printed document, so this
capability governs what a glyph may be made of, what its views mean, and what a
reader must be able to tell from it.

## ADDED Requirements

### Requirement: Every built-in icon draws in every view

Each built-in icon SHALL carry a glyph for the top, front and side views. A
reader who switches view SHALL NOT be shown a fallback in place of a drawing.

The fallback chain that exists for unknown ids SHALL remain, because an element
may name an icon this version does not have; it SHALL NOT be relied on to cover
a built-in icon.

#### Scenario: A built-in icon in each view

- **WHEN** any built-in icon is drawn in the top, front or side view
- **THEN** the glyph drawn is the one defined for that view
- **AND** no view falls back to another view's glyph

#### Scenario: An icon the system does not have

- **WHEN** an element names an icon id that is not built in
- **THEN** a visible placeholder is drawn, in every view

### Requirement: A glyph is drawn in the mark vocabulary both renderers support

A glyph SHALL be described only as filled or stroked paths, circles and
rectangles, where a path uses absolute move, line, cubic, arc and close
commands only. A mark MAY carry a dash pattern and a rotation about a point in
the glyph's own coordinate box.

A description outside this vocabulary SHALL be an error that fails a test, not
a mark that silently fails to draw.

#### Scenario: The whole set drawn onto paper

- **WHEN** every glyph of every icon is drawn through the document renderer
- **THEN** every mark is drawn
- **AND** no mark reports an unsupported command

#### Scenario: An unsupported command

- **WHEN** a glyph uses a relative path command or an unknown mark kind
- **THEN** drawing it reports an error

### Requirement: Detail inside a filled body is negative space, wound the other way

An icon is drawn in a single colour, so a mark drawn over a filled body in that
same colour is invisible. Detail inside a filled body SHALL therefore be
absence: either a gap between two filled shapes, or a hole.

A hole SHALL be authored as a subpath of the same filled path, wound in the
opposite direction to the body that encloses it. Both renderers fill by the
nonzero winding rule, so a hole authored this way SHALL appear identically on
the canvas and on paper.

#### Scenario: A hole on screen and on paper

- **WHEN** a filled glyph containing a reverse-wound inner subpath is drawn on
  the canvas and in the document
- **THEN** the enclosed area is unpainted in both

#### Scenario: A subpath wound the same way as its body

- **WHEN** an inner subpath is wound in the same direction as the body enclosing it
- **THEN** it does not cut a hole, and the detail it was meant to draw is lost

### Requirement: The top view is an identifying plan symbol

The front and side views SHALL be elevations of the object. The top view SHALL
identify the object within its plan footprint, and is NOT required to be a
strict orthographic projection of it — an object whose true plan is
unidentifiable SHALL be drawn as a recognisable symbol fitted into the
footprint instead.

An icon whose object reads the same from every side MAY use one drawing for
more than one view.

#### Scenario: An object with an unreadable true plan

- **WHEN** a guitar is drawn in the top view
- **THEN** a recognisable guitar is drawn within the element's footprint

#### Scenario: An object with a meaningful plan

- **WHEN** a drum kit, a piano or a truss is drawn in the top view
- **THEN** the drawing is the object's plan, and its parts sit where they sit in reality

#### Scenario: Two views of the same object that are alike

- **WHEN** an object presents the same outline in two views
- **THEN** those views may share one drawing

### Requirement: A glyph is legible at the size an element is drawn

A glyph SHALL be identifiable at the size its default footprint occupies at a
scale that fits a whole stage, where a small element is a few tens of pixels
across. It SHALL therefore carry only the few features that distinguish it, at a
size that survives; a feature too fine to survive SHALL be left out rather than
drawn.

A glyph SHALL fill its coordinate box, so that an element is as large as its
footprint allows.

#### Scenario: A small element on a whole-stage plan

- **WHEN** an element of a few tens of centimetres is drawn on a plan of a whole stage
- **THEN** its icon is identifiable without recourse to its label

#### Scenario: A glyph's extent

- **WHEN** any glyph is drawn
- **THEN** its marks reach the edges of its coordinate box on the box's long axis

### Requirement: Icons that name different things look different

Two icons that a user chooses between SHALL be distinguishable from each other
in every view they share. This SHALL hold for the pairs that differ by kind
rather than by outline — an acoustic against an electric guitar, a bass against
an electric guitar, a speaker against a stage monitor against a rack, an upright
against a grand piano, a keyboard against an upright piano.

#### Scenario: Two instruments of similar outline

- **WHEN** an acoustic guitar and an electric guitar are drawn in the same view
- **THEN** the two drawings differ by more than their size

#### Scenario: Two boxes of similar outline

- **WHEN** a speaker, a stage monitor and a rack are drawn in the same view
- **THEN** each is identifiable as itself
