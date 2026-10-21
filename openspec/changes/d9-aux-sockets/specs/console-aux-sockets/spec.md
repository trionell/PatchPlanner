## Purpose

A desk's rear aux in sockets as patchable jacks: which models have them, how a source reaches one and
how one reaches a channel, on the Inputs canvas, the phone channel sheet and the printed input graph,
kept apart from the desk's local inputs.

## ADDED Requirements

### Requirement: A desk model declares its aux sockets

Each desk model SHALL carry a count of aux in sockets, derived from the model and never typed: 6 on
X32, X32 Compact, X32 Producer, X32 Rack, M32, M32 Live, M32R and M32R Live; 0 on X32 Core, M32C,
every LV1 model and Generic. Aux strips 7–8 SHALL get no socket. The console SHALL report its aux
socket count to the client.

#### Scenario: An X32 Rack

- **WHEN** a console's model is X32 Rack
- **THEN** it has 6 aux sockets and 16 local inputs

#### Scenario: A model without sockets

- **WHEN** a console's model is X32 Core, M32C, any LV1 or Generic
- **THEN** it has 0 aux sockets

### Requirement: An aux socket is a pass-through jack kept apart from the local inputs

An aux socket SHALL be a port of its own kind, separate from the local jacks. A cable SHALL land on
socket N's cable side (*Aux in N*) from anything that may land on a local jack, and SHALL be a real
cable that may carry a cable item. Socket N's desk side (*Aux to desk N*) SHALL reach any channel:
an aux strip or an ordinary channel. That hop SHALL be cableless and SHALL refuse a cable item. A
port past the model's socket count SHALL be refused. Aux sockets SHALL NOT count toward the desk's
local input count, its local usage or its local over marking.

#### Scenario: Playback into aux 1–2

- **WHEN** a stereo source "Playback" is cabled to Aux in 1 and Aux in 2 on an X32, and Aux to desk
  1–2 feed an aux strip
- **THEN** both cables are saved, the two hops into the strip carry no cable item, and the desk's
  local usage is unchanged

#### Scenario: An aux socket feeds an ordinary channel

- **WHEN** Aux to desk 3 is patched to the channel "Host mic RX" in the channel pool
- **THEN** the hop is saved

#### Scenario: Past the socket count

- **WHEN** a cable is sent to Aux in 7 on an M32
- **THEN** the request is refused as out of bounds

### Requirement: The Inputs canvas draws the aux sockets as their own node

On the Inputs canvas, a desk with aux sockets SHALL show a pass-through node beside its LOCAL node.
The node SHALL be titled with the desk's name and badged **LOCAL AUX**, and SHALL hold one split row
per socket: *Aux in N* on the cable side and *Aux to desk N* on the desk side, numbered 1–6, with no
footer. It SHALL keep its own stored position. Until it is first moved, it SHALL sit 24 px below the
LOCAL node with the left edges aligned, or at LOCAL's default position when the desk has no local
inputs. It SHALL be draggable, selectable into the inspector titled *<desk> · aux sockets*, and found
by search on the desk's name or the word "aux". A model with no sockets SHALL show no node and no
note. A socket past the count that still carries a cable (after a model switch) SHALL be drawn
flagged over.

#### Scenario: An X32 desk

- **WHEN** the Inputs canvas shows a desk "FOH" on an X32
- **THEN** a node titled FOH and badged LOCAL AUX shows six rows, beside the LOCAL node

#### Scenario: Searching for aux

- **WHEN** the planner searches "aux"
- **THEN** the LOCAL AUX node matches, and the window moves to it

#### Scenario: X32 Core

- **WHEN** the desk's model is X32 Core
- **THEN** no aux node is drawn

### Requirement: A chain through an aux socket names it

A hop through an aux socket SHALL read *<desk> aux in N* (for example *FOH aux in 3*) wherever a
channel's chain is spelled out: the patch sheet, the phone list and the inspector.

#### Scenario: The phone list

- **WHEN** a channel is fed through FOH's Aux in 3
- **THEN** its routing label reads FOH aux in 3

### Requirement: The phone sheet routes through any jack panel

The phone channel sheet's routing pair SHALL be **Into** and **Jack**. Into SHALL list the stageboxes
first. After them, each desk with local inputs or aux sockets SHALL get a group named for the desk,
holding *<desk> local in* and *<desk> aux in* as separate entries, each present only when the desk
has those jacks. Jack SHALL list the chosen panel's jacks: *In N* for a stagebox, *Local N* for local
inputs, *Aux N* for aux sockets. Saving SHALL write the same two edges for every panel, source →
jack and jack → channel. A channel already fed through a stagebox, a local jack or an aux socket
SHALL open with both fields filled.

#### Scenario: Picking an aux socket on the phone

- **WHEN** the planner picks Into "FOH aux in", Jack "Aux 3" and the source "Host mic RX"
- **THEN** a cable from the source to Aux in 3 and a hop from Aux to desk 3 to the channel are saved

#### Scenario: A channel on a local jack

- **WHEN** the phone sheet opens a channel fed through FOH local input 5
- **THEN** Into shows "FOH local in" and Jack shows "Local 5"

### Requirement: The printed input graph prints the aux sockets

The audio PDF's input graph SHALL print a node titled *<desk> aux*, badged AUX, with rows *Aux in N*
and *Aux to desk N* and the footer *<count> aux sockets - <used> used*, at the canvas node's stored
position, whenever the desk's model has aux sockets. The local node and its footer SHALL be
unchanged.

#### Scenario: Printing an X32 desk

- **WHEN** the audio PDF is printed for an event whose X32 desk has Aux in 1–3 patched
- **THEN** the input graph holds a node "FOH aux" with the footer "6 aux sockets - 3 used"
