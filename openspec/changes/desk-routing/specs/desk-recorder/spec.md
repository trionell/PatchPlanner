## Purpose

Governs the multitrack recorder a desk carries — the X32 · M32 card or an LV1's SoundGrid recorder —
what each track records, what it plays back into, and its capacity.

## ADDED Requirements

### Requirement: A desk has one recorder

Every desk SHALL have at most one recorder, declared on its Rig card and never shared with another
desk. Its track count SHALL be 32 record / 32 playback on X32 · M32 (the card), 64 / 64 on LV1 (a
recorder over SoundGrid), and typed on Generic. On a real model the count SHALL be read-only.

#### Scenario: An M32's card

- **WHEN** a planner declares the recorder on an M32 desk
- **THEN** it is the card with 32 tracks each way

### Requirement: A track records a preamp or a mix

A record track SHALL take either a channel's preamp (named by the port and the channel it feeds,
"Scen A 5 · OH L") or one side of a mix ("Main LR · L"). A track past the recorder's count SHALL be
refused inline, naming the desk.

#### Scenario: Recording LR

- **WHEN** a planner sets tracks 33 and 34 to Main LR L and R on an M32
- **THEN** the save is refused because the card has 32 tracks

### Requirement: A track plays back into a channel

A playback track MAY feed a channel on the same desk, either as **soundcheck** (it replaces that
channel's preamp when virtual soundcheck is on) or as **source** (the channel's input, e.g. walk-in
music).

#### Scenario: Virtual soundcheck

- **WHEN** track 5 records OH L's preamp and plays back into OH L as soundcheck
- **THEN** the Recorder table shows track 5 in and out on OH L, marked soundcheck

### Requirement: Record every preamp

"Record every preamp" SHALL fill the free record tracks, in channel order, with the desk's patched
preamps, each playing back into its own channel as soundcheck. It SHALL be refused, changing nothing,
when the preamps do not fit the free tracks.

#### Scenario: Thirty preamps on a card

- **WHEN** an M32 has 30 patched preamps and no tracks used, and the planner presses Record every preamp
- **THEN** tracks 1–30 record them in channel order and play back into their channels
