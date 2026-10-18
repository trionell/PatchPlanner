## Purpose

Governs how the audio Inputs and Outputs sheets present an event with several desks: one desk's rows
at a time behind a desk selector, every row belonging to a desk, and how rows without a desk are
shown and placed. The Flow canvas keeps showing every desk at once.

## ADDED Requirements

### Requirement: A sheet shows one desk at a time

The Inputs and Outputs sheets SHALL list only the selected desk's rows. A desk selector SHALL name each
desk with its fill ("FOH · M32 Live 30/32"); it SHALL be absent when the event has one desk and no
rows without a desk. The selection SHALL be shared by the two sheets, SHALL open on the first desk in
Rig order, and SHALL be remembered per viewer and per event on the device, never on the event. The
Flow canvas SHALL show every desk and SHALL NOT be filtered. Viewers SHALL have the selector.

#### Scenario: Two desks

- **WHEN** an event has FOH and Monitor desks and the planner selects Monitor on Inputs
- **THEN** only Monitor's channels are listed, and the Outputs sheet also shows Monitor

#### Scenario: A deleted selected desk

- **WHEN** the remembered desk no longer exists
- **THEN** the sheet opens on the first desk in Rig order

### Requirement: The status strip states the selected desk

The status strip SHALL state only the selected desk's figures ("FOH · M32 Live · 30/32 ch · 4/8 aux")
and its over-capacity line. When rows without a desk exist, the strip SHALL end with their count in
amber, which selects them.

#### Scenario: Rows without a desk exist

- **WHEN** two channels have no desk
- **THEN** every desk's strip ends with "2 on no desk", which selects the No desk list

### Requirement: Adding adds to the selected desk

+ Channel and + Output SHALL add to the selected desk with no question, on any number of desks. On an
X32 · M32 desk, + Channel SHALL add to the channel pool and the aux section SHALL have its own + Aux.
On an event with no desk, adding SHALL be refused with "A channel is added to a desk, and this event
has none yet. Add the desk in Rig first." and an action that opens Rig. Adding SHALL be absent on the
No desk list.

#### Scenario: Adding on a two-desk event

- **WHEN** Monitor is selected and the planner presses + Channel
- **THEN** a channel is created on Monitor at its suggested number

#### Scenario: Adding on an event with no desk

- **WHEN** the event has no console and the planner presses + Channel
- **THEN** no channel is created and the refusal offers Open Rig

### Requirement: An X32 · M32 list has two sections

On an X32 · M32 desk the Inputs list SHALL show Channels then Aux in, each under its own heading with
its own count; an empty aux section SHALL say "No aux inputs used." LV1 and Generic desks SHALL show
one section with no heading.

#### Scenario: An M32 with aux rows

- **WHEN** an M32 desk has 30 channel rows and 4 aux rows
- **THEN** the list shows a Channels section headed 30/32 and an Aux in section headed 4/8

### Requirement: Every row is on a desk

A channel or output SHALL NOT be saved without a desk; the editor's Desk field SHALL be required and
SHALL offer no "No desk" option. Deleting a desk SHALL still leave its rows with no desk, and its
confirm SHALL say so.

#### Scenario: Editing a row with no desk

- **WHEN** a planner edits only the name of a channel with no desk and saves
- **THEN** the save is refused until a desk is picked

### Requirement: Rows without a desk have their own list

While any row has no desk, the selector SHALL end with "No desk · N" in amber. That list SHALL show
numbers unchecked and an amber note offering one "Put on <desk>" per desk. Putting rows on a desk
SHALL keep each row's number where it is legal and free there, else give it the lowest free strip,
else keep it past the end flagged over; it SHALL never place a row on aux. When anything would move or
land over, a preview SHALL be shown first, in the switch's words. When the last row is placed, the
entry SHALL disappear and the sheet SHALL return to the first desk.

#### Scenario: Placing without conflict

- **WHEN** two deskless channels 33 and 34 are put on an LV1 64 where both are free
- **THEN** they move there at once with their numbers, without a preview

#### Scenario: Placing with a move

- **WHEN** a deskless channel 5 is put on a desk where 5 is taken
- **THEN** a preview lists it under Moved with its new number before anything is applied

### Requirement: A row moved to another desk says where it went

Changing a row's Desk in its editor SHALL check its number on the destination desk, offering a
"Use N" fix when it is taken. After saving, the row SHALL leave the list and one line SHALL take its
place naming where it went and its number, with one action to show that desk ("Kick is now on
Monitor · LV1 64, as 37. Show Monitor"). The next action on the panel SHALL clear the line. It SHALL
never be a toast.

#### Scenario: Moving Kick to Monitor

- **WHEN** a planner changes Kick's desk from FOH to Monitor and saves
- **THEN** Kick leaves the FOH list and the line "Kick is now on Monitor · LV1 64, as 37." appears with Show Monitor
