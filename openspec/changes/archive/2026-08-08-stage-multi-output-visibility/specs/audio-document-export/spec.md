## MODIFIED Requirements

### Requirement: The signal flow is drawn, and inputs and outputs are drawn separately

The input graph and the output graph SHALL each be drawn as their own section, each starting
a new page in landscape orientation. They SHALL NOT be combined into one drawing.

Each drawing SHALL place its boxes according to the positions already stored for that graph,
preserving their relative arrangement, and SHALL draw one line per cable between the jacks
that cable connects.

Each box SHALL state its name, its kind, its jacks, and which of those jacks are patched.
Whether a jack is patched SHALL be legible without colour.

The output graph SHALL omit a stage multi whose output-graph visibility flag is not shown,
unless that stage multi has an output cable connected to it, in which case it SHALL be drawn
like any other box. The input graph is unaffected by this flag and SHALL continue to draw
every stage multi.

#### Scenario: A graph drawn from stored positions

- **WHEN** a planner has arranged the input graph's boxes on the canvas
- **THEN** the drawing preserves that arrangement
- **AND** a box the planner placed left of another is drawn left of it

#### Scenario: A jack with nothing in it

- **WHEN** a box has jacks that no cable reaches
- **THEN** those jacks are drawn and marked as free
- **AND** the distinction from a patched jack survives monochrome printing

#### Scenario: A hidden stage multi is omitted from the output graph

- **WHEN** the exported document's output graph is drawn for an event with a stage multi whose
  visibility flag is not shown and which has no output cable connected to it
- **THEN** that stage multi is not drawn as a box in the output graph section
- **AND** the same stage multi is still drawn in the input graph section

#### Scenario: A cabled stage multi is drawn even when hidden

- **WHEN** the exported document's output graph is drawn for an event with a stage multi whose
  visibility flag is not shown but which has an output cable connected to it
- **THEN** that stage multi is drawn as a box in the output graph section
- **AND** the cable's line is drawn to it as it would be for any other box
