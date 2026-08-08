## Purpose

Controls whether a stage multi appears in the audio output flow graph, since a stage multi is
normally an input-only device and its appearance on the output side is a secondary,
adapter-driven use that is often visual clutter rather than useful information.

## ADDED Requirements

### Requirement: A stage multi carries an output-graph visibility flag

Every stage multi SHALL carry a flag stating whether it is shown in the audio output flow
graph. A planner SHALL be able to set this flag from the stage multi's edit form.

A newly created stage multi SHALL default to not shown in the audio output flow graph.

This flag SHALL have no effect on any other surface that lists stage multis, including the
audio input flow graph, the Rig drawer and summary, and the output tab's search and palette —
all of these SHALL continue to list every stage multi regardless of the flag.

#### Scenario: A newly created stage multi is absent from the output graph

- **WHEN** a planner creates a stage multi and does not change the visibility flag
- **THEN** the stage multi does not appear as a node in the audio output flow graph
- **AND** the stage multi still appears in the audio input flow graph, the Rig drawer, and
  search/palette

#### Scenario: A planner opts a stage multi into the output graph

- **WHEN** a planner sets the visibility flag on a stage multi to shown
- **THEN** the stage multi appears as a node in the audio output flow graph

### Requirement: A stage multi carrying an output cable is always shown

A stage multi that has at least one `output_cables` connection to or from it — the
connector-adapter use that sends output through the multi — SHALL appear in the audio output
flow graph regardless of its visibility flag, so that cable's edge is never left with a
missing endpoint.

#### Scenario: A cabled stage multi ignores the flag

- **WHEN** a stage multi's visibility flag is set to not shown
- **AND** an output cable is patched to or from that stage multi
- **THEN** the stage multi still appears as a node in the audio output flow graph

#### Scenario: Removing the last output cable restores the flag's effect

- **WHEN** a stage multi is shown only because of an output cable connected to it
- **AND** that cable is deleted, leaving no output cable connected to the stage multi
- **AND** the visibility flag remains set to not shown
- **THEN** the stage multi no longer appears in the audio output flow graph
