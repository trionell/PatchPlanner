## Purpose

Governs how input channels occupy a desk's strips: which pool a channel sits on, how much room a
stereo channel takes on each model, how channels are numbered and counted, and what is refused or
flagged when a desk is full.

## ADDED Requirements

### Requirement: X32 · M32 desks have a channel pool and an aux pool

A channel on an X32 · M32 desk SHALL sit on one of two pools: channels (1–32) or aux inputs (1–8).
Each pool SHALL be numbered, counted and checked on its own. LV1 and Generic desks SHALL have one
pool. A channel SHALL be put on aux only by the planner choosing aux: adding to aux, or changing the
channel's Strip field.

#### Scenario: An aux channel's number

- **WHEN** a stereo channel sits on aux 1 of an M32
- **THEN** its number cell reads "Aux 1–2"

#### Scenario: Channels full, aux free

- **WHEN** all 32 channels of an M32 are taken and 4 aux inputs are free, and the planner presses + Channel
- **THEN** no channel is created
- **AND** the message names the desk and says to free a channel or move one to aux from its editor

### Requirement: Stereo follows the model

On X32 · M32 a stereo channel SHALL occupy two strips as a linked pair starting on an odd number, in
both pools. On LV1 a stereo channel SHALL occupy one strip. Generic SHALL keep each channel's stored
stereo behaviour. The number cell SHALL read "5–6" for a linked pair and "6 S" for a stereo strip.

#### Scenario: Stereo on an LV1

- **WHEN** a stereo channel is on strip 6 of an LV1 64
- **THEN** it occupies one strip and its number reads "6 S"

### Requirement: Capacity counts strips

A desk's usage SHALL be the number of strips its channels occupy, per pool, not the number of rows.

#### Scenario: Four stereo channels on an X32

- **WHEN** an X32 desk has 28 mono and 4 stereo channels
- **THEN** its usage is 36 strips of 32, not 32 of 32

### Requirement: A new channel gets a suggested number

Adding a channel without a number SHALL give it the strip after the last one used in its pool on its
desk; if that is past the last strip, the lowest free strip; on X32 · M32 a stereo channel the next
free odd number.

#### Scenario: Adding after a stereo pair

- **WHEN** an M32's last used channels are a linked pair on 5–6 and the planner adds a channel
- **THEN** the new channel is 7

### Requirement: A real model refuses an illegal strip

On any model but Generic, creating or editing a channel SHALL be refused when its number is past the
pool's last strip, when any strip it would occupy is taken by another channel on the same desk and
pool, or when (X32 · M32) a stereo channel would start on an even number. The refusal SHALL be shown
inline, SHALL name the desk, and SHALL offer a fix where one exists ("Use 5–6", "Use 37"). Generic
SHALL refuse nothing and warn as today, and a count of 0 SHALL never warn.

#### Scenario: Past the end

- **WHEN** a planner sets a channel on an M32 to Aux 9
- **THEN** the save is refused with "Aux 9 is past M32 Live's 8 aux inputs."

#### Scenario: Even start

- **WHEN** a planner makes channel 6 of an M32 stereo
- **THEN** the save is refused, saying a stereo channel starts on an odd number, and offers "Use 5–6"
  or the next free odd pair

#### Scenario: Taken strip

- **WHEN** a planner sets a channel to Aux 7 and Aux 7 is Pausmusik L/R's
- **THEN** the save is refused with "Aux 7 is Pausmusik L/R's."

### Requirement: Rows over capacity are kept and flagged

A channel whose strips lie past its pool's last strip SHALL stay on the sheet with its number, its
number cell in the over tint followed by the word "over", and the status strip in the over-capacity
state. Every other field of an over row SHALL stay editable; giving it a free legal number SHALL
clear the flag.

#### Scenario: Editing an over row's name

- **WHEN** a planner renames a channel that is flagged over without changing its number
- **THEN** the save succeeds and the row stays flagged over
