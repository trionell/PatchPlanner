# console-showfile-export Specification

## Purpose
Governs exporting one desk of an event as a file the console loads — an X32 · M32 scene or an LV1
session — what that file holds, how the planner maps stageboxes to the desk's ports, and how
everything the file cannot hold is stated before the download.
## Requirements
### Requirement: The desk's model decides the file

Exporting SHALL export the desk selected on the audio sheets. An X32 · M32 model SHALL produce a
`.scn` scene (firmware 4.0); an LV1 model SHALL produce an `.emo` session (LV1 17.3). A Generic desk
SHALL produce no file: the dialog SHALL say the desk is Generic and that a model is picked in Rig,
with Open Rig for owners and contributors. On a multi-desk event the dialog SHALL name the desk and
say how to export another. The file SHALL be named `<event>-<desk>.<scn|emo>`.

#### Scenario: An M32 desk

- **WHEN** a planner exports Julkonsert's FOH, an M32 Live
- **THEN** the file is `Julkonsert-FOH.scn` and the primary reads Download scene

#### Scenario: A Generic desk

- **WHEN** the selected desk is Generic
- **THEN** the dialog says to pick its model in Rig and offers no download

### Requirement: Everyone who can see the event can export

The export SHALL be offered beside Export PDF on the Audio Inputs and Audio Outputs tabs and in the
phone's overflow, to every role including viewers. A viewer's Generic dialog SHALL say an owner can
pick the model and offer only Close.

#### Scenario: A viewer exports

- **WHEN** a viewer exports an M32 desk
- **THEN** the scene downloads

### Requirement: Stageboxes are mapped to the desk's ports

The dialog SHALL list each stagebox the desk uses and let the planner map it to a port: on X32 · M32
Local, AES50-A, AES50-B or Card with a start position; on LV1 an I/O slot (bank and slot) and a
device model (SG4000, SG1000, LV1 Classic, Other). An LV1 Classic desk's local jacks SHALL default to
LV1 Classic. A row may be left not connected. The mapping SHALL be remembered per viewer, per event,
desk and engine, on the device.

#### Scenario: Remembered ports

- **WHEN** a planner maps Scen A to AES50-A and exports, then opens the dialog again
- **THEN** Scen A is still mapped to AES50-A

### Requirement: The file holds the desk as planned

The file SHALL hold, from the desk's own data and nothing allocated by the export: channel and (X32)
aux names, colours and stereo links; mains, subgroups or groups, monitors, FX sends, matrices, DCAs
and mute groups in their Desk Routing slots with names, colours and links; every route as an assign,
or as a send switched on at 0 dB; each output's source from Fed by; the input patch through the
mapped ports with 48 V where a channel's source has it on; and the recorder's tracks. On X32 · M32 the
scene SHALL route through user in and user out, so a patch that does not line up in blocks of 8
exports as drawn. On X32 · M32 an aux strip fed from aux socket *k* SHALL take socket *k* as its
source, and an ordinary channel fed from aux socket *k* SHALL take user-in code 160 + *k*. Aux sockets
SHALL carry no 48 V. Lines the export does not own SHALL be the template's.

#### Scenario: A monitor mix on an M32

- **WHEN** Monitor 1 is Bus 3 with Kick and Vox as members
- **THEN** the scene names Bus 3 and switches Kick's and Vox's sends to Bus 3 on at 0 dB

#### Scenario: A patch not on a block of 8

- **WHEN** Scen A input 3 feeds channel 17 on an M32
- **THEN** the scene's user-in table routes that input to channel 17

#### Scenario: An LV1 recorder

- **WHEN** an LV1 desk records 40 preamps and Main LR
- **THEN** the session holds a 64/64 I/O device routed from those preamps and Main LR

#### Scenario: Playback on aux sockets

- **WHEN** a stereo aux strip on Aux 1–2 is fed from Aux in 3 and Aux in 4 on an X32
- **THEN** the scene's aux 1 takes Aux 3 as its source and aux 2 takes Aux 4

#### Scenario: An aux socket into a channel

- **WHEN** Aux in 3 feeds channel 20 on an M32
- **THEN** the scene's user-in table routes code 163 to channel 20

### Requirement: What the file cannot hold is stated before the download

The dialog SHALL show figures for what the file holds (channel strips, plus aux on X32; mixes;
DCAs · mutes; 48 V; outputs patched; recorder tracks, labelled Card or SoundGrid) and, before the
download, word-led lines for what it cannot: **Left out** — rows and mixes flagged over, routes the
engine refuses, box ports past the end of their socket, an X32 local out past 16; **Changed** — names longer than the desk shows (cut
in the file, kept whole in PatchPlanner), two plan colours landing on one desk colour, 48 V on an LV1
device of unknown model, an aux strip fed from anything but an aux socket (the scene keeps that strip on its own rear socket), the LV1 recorder written unverified; **No input** — a channel with nothing patched; **No port** — a stagebox left
not connected. The server SHALL compute both, from the code that writes the file. The download SHALL
never be blocked by a line; an output with no Fed by SHALL not warn.

#### Scenario: A long name on an X32

- **WHEN** a channel is named "Gitarr Johannes" on an M32
- **THEN** the preview says it is cut to "Gitarr Johan" and the scene holds the cut name

#### Scenario: An over row

- **WHEN** a channel is flagged over on an X32 Producer
- **THEN** the preview lists it under Left out and the scene does not hold it

#### Scenario: An aux strip on a stagebox

- **WHEN** an aux strip on an M32 is fed from a stagebox input
- **THEN** the preview lists it under Changed and the scene leaves that strip's source as the template's

### Requirement: A file the desk loads

A scene SHALL have the template's line count and order with only owned lines replaced. A session
SHALL pass SQLite's integrity check, keep the template's schema version, and write only parameter ids
the mapping registry lists. A template version the registry does not know SHALL be refused.

#### Scenario: Integrity

- **WHEN** a session is written for any desk
- **THEN** `PRAGMA integrity_check` reports ok and every channel's colour survives beside every other write

