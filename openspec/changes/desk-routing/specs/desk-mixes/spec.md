## Purpose

Governs the mixes inside one desk — mains, subgroups or groups, monitors, FX sends, matrices, DCAs and
mute groups — which slots of the desk model's pools they occupy, what may route to what on each
engine, which mix feeds each output, and how today's event-level groups and a model switch carry
over without losing anything.

## ADDED Requirements

### Requirement: Mixes belong to one desk

Every mix, DCA and mute group SHALL belong to exactly one desk and SHALL route only to and from that
desk's channels and mixes. Mix types SHALL be Main, Subgroup (named Group on LV1), Monitor, FX and
Matrix. Every desk SHALL have its mains — Main LR always; M/C on X32 · M32; C and Mono on LV1 32, 64
and 80 and on Generic — which SHALL never be added or deleted.

#### Scenario: Two desks keep separate mixes

- **WHEN** FOH and Monitor each have a subgroup named "Drums"
- **THEN** renaming FOH's "Drums" leaves Monitor's unchanged

#### Scenario: LV1 16 mains

- **WHEN** a desk is LV1 16
- **THEN** it has Main L/R only, and no C or Mono

### Requirement: Mixes occupy pool slots per engine

A mix SHALL occupy a slot in its pool, read from the desk model and never typed:

- X32 · M32: subgroups, monitors and FX share one pool of 16 buses; 6 matrices; 8 DCAs; 6 mute groups.
  A stereo bus or matrix SHALL occupy an odd–even pair.
- LV1: groups, Mon mixes, FX sends and matrices each have their own pool per tier and bus mode;
  16 DCAs; 8 mute groups. A group SHALL always be stereo and occupy one slot; a stereo Mon, FX or
  Matrix mix SHALL occupy two consecutive slots of either parity.
- Generic: any count of every type, no pool checks.

Adding a mix SHALL take the first legal free slot. A full pool, a missing pair, or a pool the model
does not have SHALL be refused inline before anything is created, naming the desk; on X32 · M32 the
refusal SHALL state how the 16 buses are used.

#### Scenario: Buses are shared on an M32

- **WHEN** an M32 has 8 subgroups, 6 monitors and 2 FX sends and the planner adds a monitor
- **THEN** it is refused, stating the desk and "8 subgroups · 6 monitors · 2 FX"

#### Scenario: A stereo bus on an X32

- **WHEN** buses 1–4 and 6 are taken and the planner adds a stereo monitor on an X32
- **THEN** it takes Bus 7–8

#### Scenario: No groups on LV1 16

- **WHEN** the planner adds a group on an LV1 16
- **THEN** it is refused with "LV1 16 has no groups."

### Requirement: What may route to what

Routes SHALL be membership only, with no level, pan or tap. Allowed routes per engine:

- Channel → main, subgroup/group, monitor, FX, DCA and mute group on every engine; channel → matrix
  on LV1 and Generic only.
- X32 · M32: bus → LR and → M/C; LR, M/C and bus → matrix; no bus → bus.
- LV1 and Generic: group → main; group → any **higher-numbered** group only; mains, groups and Mon
  mixes → matrix.
- Subgroups, groups and buses → mute group on every engine.

An LV1 matrix SHALL take at most 12 sources; the 13th SHALL be refused inline. A route the engine
cannot make SHALL NOT be offered.

#### Scenario: Group feed-forward on LV1

- **WHEN** an LV1 has groups 1–8
- **THEN** group 5 can route to groups 6, 7 and 8, and to no lower or equal group

#### Scenario: A group off Main

- **WHEN** an LV1 group has no route to Main L/R
- **THEN** it does not reach the PA and the Mains table shows its L/R square empty

#### Scenario: No channel into an X32 matrix

- **WHEN** the desk is an M32
- **THEN** no channel can be routed to a matrix

### Requirement: A new channel joins Main LR

A channel created on a desk SHALL be routed to that desk's Main LR. It SHALL join no other mix.

#### Scenario: Adding a channel

- **WHEN** a planner adds a channel to FOH
- **THEN** it is routed to FOH's Main LR and to nothing else

### Requirement: An output is fed by a mix

An output SHALL keep its type as its destination and SHALL have an optional **Fed by**: one mix on
its own desk — on X32 · M32 Main LR, M/C, a bus or a matrix; on LV1 a main, group, Mon mix, matrix or
a channel's direct out; never an FX send. Several outputs MAY be fed by one mix. A stereo mix feeding
a mono output SHALL name its side (L or R); a mono mix feeding a stereo output SHALL play on both.
An output fed by nothing SHALL show "—" and SHALL NOT warn. A Mon or Matrix mix that feeds no output
SHALL be counted in the routing strip as "N mixes play nowhere".

#### Scenario: A sub fed by a bus

- **WHEN** Julkonsert's Sub output is set to be fed by Bus 15
- **THEN** its type stays sub and the Outputs sheet shows Bus 15 under Fed by

### Requirement: Moving a channel to another desk drops its routes

When a channel moves to another desk, its routes on the old desk SHALL be removed, and the editor
SHALL say so before Save ("Kick leaves 4 routes on FOH"). On the new desk it SHALL join Main LR.

#### Scenario: Moving Kick

- **WHEN** Kick, routed to four mixes on FOH, is moved to Monitor
- **THEN** the editor states the four routes before Save, and after Save Kick is on Monitor's Main LR only

### Requirement: Today's groups and DCAs move onto desks

The upgrade SHALL keep every group, DCA and membership:

- One desk: the built-in LR becomes that desk's Main LR; every other group becomes a Subgroup in id
  order, routed to Main; every DCA moves across; every membership becomes a route.
- Several desks: Main LR on every desk; a group or DCA is copied, with name and colour, onto each desk
  that holds one of its channels, each copy keeping only that desk's members; a group or DCA with no
  members goes to the first desk in Rig order.
- No desk: groups and DCAs SHALL wait and land on the first desk added.
- Fed by SHALL be filled only where an output's name exactly matches a mix's name on its desk.

#### Scenario: The wedding

- **WHEN** the wedding event (one desk, built-in LR, an output named "LR") is upgraded
- **THEN** its desk has Main LR with every former LR member, and the "LR" output is fed by Main LR

### Requirement: A model switch maps mixes

Slice 47's switch preview SHALL also state the mix pools before and after and SHALL list mixes and
routes in its four words: **Moved** (slot changes), **Changed** (a mono subgroup becomes a stereo LV1
group; M/C becomes C/Mono or back), **Left out** (mixes past the pool; routes the new desk cannot
make; direct-out feeds), **Fits again**. Mixes SHALL be mapped by type in order (subgroups, monitors,
FX, then matrices, DCAs, mute groups), each keeping its slot where legal and free, else the next
legal one, else past the end flagged over. Left-out routes SHALL be kept and unused. Nothing SHALL be
deleted.

#### Scenario: LV1 to M32

- **WHEN** an LV1 64 with 8 groups, 12 Mon mixes and 4 FX is switched to M32
- **THEN** 16 of them get buses in that order, 8 are left out and flagged over, and any group → group
  routes are listed as Left out and kept
