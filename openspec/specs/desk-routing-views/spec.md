# desk-routing-views Specification

## Purpose
Governs the Desk Routing tab where a desk's mixes are created and routed — its tables, how a mix is
edited, its canvas, its phone form and read-only behaviour — and how the Inputs and Outputs sheets
show and edit routing.
## Requirements
### Requirement: Desk Routing is an event tab

The event SHALL have a Desk Routing tab between Audio Inputs and Audio Outputs. It SHALL show one desk
at a time using the desk selection shared with Inputs and Outputs, with no "No desk" entry. Its bar
SHALL hold the title, Sheet | Flow, the desk selector, search and + Mix (Sheet only). An event with no
desk SHALL show a refusal with Open Rig. The Buses drawer SHALL no longer exist.

#### Scenario: Switching desk

- **WHEN** a planner selects Monitor on Desk Routing
- **THEN** Inputs and Outputs also open on Monitor

### Requirement: Eight tables, one at a time

The Sheet SHALL offer eight tables — Mains, Subgroups (Groups on LV1), Monitors, FX, Matrices, DCAs,
Mute groups, Recorder — one at a time, picked from an index row naming each with its pool fill
(X32 · M32's Subgroups, Monitors and FX all show the shared bus count). The choice SHALL be remembered
per viewer and per event on the device. In each table the columns SHALL be that type's mixes in slot
order and the rows what can feed them; rows a type cannot take SHALL be absent; cells the desk can
never route SHALL be hatched with no control. LV1 matrix channel rows SHALL be folded to those in use
with "Show all".

#### Scenario: The LV1 Groups triangle

- **WHEN** the Groups table of an LV1 64 is shown
- **THEN** below the channel rows it lists the groups as rows, and every cell on or below the diagonal is hatched

#### Scenario: An X32 Matrices table

- **WHEN** the Matrices table of an M32 is shown
- **THEN** its rows are LR, M/C and the buses, with no channel rows

### Requirement: A mix is edited as a column

Clicking a column head SHALL open that mix: its fields (slot, name, width, colour) above the grid and
its cells as controls; Save SHALL write the fields and routes together; one column SHALL be open at a
time. + Mix SHALL ask the type first and take the first legal free slot.

#### Scenario: Adding a monitor mix

- **WHEN** a planner presses + Mix, picks Monitor, ticks five channels and saves
- **THEN** the mix exists in the first free slot with those five channels as members

### Requirement: The canvas draws one desk's inside

Flow on Desk Routing SHALL draw only the selected desk: columns of channels, groups or buses, mains,
matrices, outputs and the recorder in signal order; LV1 groups by feed-forward depth so edges run left
to right. Mix → mix and mix → output edges SHALL always be drawn; channel edges only for the selection.
Routes SHALL NOT be drawn by dragging; the inspector rail SHALL list a selection's sources and feeds
and open the mix in the Sheet. The Audio Inputs and Outputs Flow canvases SHALL keep showing every desk.

#### Scenario: Selecting a channel

- **WHEN** a planner selects Kick on the canvas
- **THEN** every route from Kick is drawn and the other channels' routes are not

### Requirement: Inputs show and edit a channel's routes

The Inputs sheet's Buses column SHALL become Routes: main and group chips, DCA chips, then a count of
the rest ("1 mon · 2 fx"). The row editor SHALL edit, on the channel's own desk, Routes to (mains and
groups), DCAs and Mute groups, and SHALL state monitor and FX membership with a hand-off to Desk
Routing.

#### Scenario: A channel's monitor sends

- **WHEN** Sång Amanda is in 6 monitor mixes and opened on Inputs
- **THEN** the editor says so and offers "Edit in Desk Routing", without a tick per monitor

### Requirement: Outputs show Fed by

The Outputs sheet SHALL show Fed by before Type, and its row editor (desktop and phone) SHALL set it
from the output's desk's mixes, asking the side when a stereo mix feeds a mono output.

#### Scenario: Setting Fed by

- **WHEN** a planner sets FOH's Center output to be fed by Mtx 1
- **THEN** the row shows Mtx 1 under Fed by and the routing canvas draws Mtx 1 → Center

### Requirement: Phone and read-only

On the phone the selected table's mixes SHALL be rows under the desk picker title with a table picker
in the bar, and tapping a mix SHALL open a bottom sheet of 44 px tick rows; the canvas SHALL render and
select. Viewers SHALL see every table, the canvas and the phone sheets with no + Mix, no Record every
preamp, and column heads as labels.

#### Scenario: A viewer on Desk Routing

- **WHEN** a viewer opens Desk Routing
- **THEN** the tables are shown with no control that changes a route

