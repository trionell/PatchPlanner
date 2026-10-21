# console-desk-model Specification

## Purpose
Governs which mixing console model an event's desk is, what that model declares about the desk
(strips, aux inputs, local jacks, mix pools, stereo style), and how changing the model is
previewed and applied without losing any part of the plan.
## Requirements
### Requirement: A console has a desk model from a fixed list

Every console SHALL have exactly one desk model. The list SHALL be: X32, X32 Compact, X32 Producer,
X32 Rack, X32 Core, M32, M32 Live, M32R, M32R Live, M32C, LV1 16, LV1 32, LV1 64, LV1 80,
LV1 Classic 64, LV1 Classic 80, and Generic. Models SHALL be offered grouped by family. There SHALL
be no user-defined models.

#### Scenario: Adding a console requires a model

- **WHEN** a planner adds a console without choosing a model
- **THEN** the console is not created
- **AND** the form states "Pick the desk's model, or Generic."

#### Scenario: Generic is an explicit choice

- **WHEN** a planner adds a console with model Generic
- **THEN** the console is created with typed counts, exactly as consoles behave today

### Requirement: A real model derives the desk's counts

For any model other than Generic, the desk's strips, aux inputs, aux sockets, local inputs, local
outputs and mix pools SHALL be read from the model's profile and SHALL NOT be editable. Generic SHALL
keep its four typed counts and SHALL have no aux sockets. Aux inputs are the aux strip pool; aux
sockets are the rear jacks that can feed them. The profiles SHALL be:

| Family | Strips | Aux in | Aux sockets | Local in / out | Mix pools | DCA · mute | Stereo |
|---|---|---|---|---|---|---|---|
| X32, M32, M32 Live | 32 | 8 | 6 | 32 / 16 | 16 buses, 6 matrices | 8 · 6 | linked odd–even pair |
| X32 Compact, Producer, Rack; M32R, M32R Live | 32 | 8 | 6 | 16 / 8 | as above | 8 · 6 | linked odd–even pair |
| X32 Core, M32C | 32 | 8 | 0 | 0 / 0 | as above | 8 · 6 | linked odd–even pair |
| LV1 16 | 16 | 0 | 0 | 0 / 0 | 0 groups, 0 Mon, 8 FX, 8 matrix | 16 · 8 | one stereo strip |
| LV1 32 / 64 | 32 / 64 | 0 | 0 | 0 / 0 | 8 groups, 16 Mon, 8 FX, 8 matrix | 16 · 8 | one stereo strip |
| LV1 80 | 80 | 0 | 0 | 0 / 0 | per bus mode, 8 FX, 8 matrix | 16 · 8 | one stereo strip |
| LV1 Classic 64 / 80 | 64 / 80 | 0 | 0 | 18 / 16 | as LV1 64 / LV1 80 | 16 · 8 | one stereo strip |

No real model SHALL carry an output-count limit; outputs are limited by the physical jacks they are
patched to.

#### Scenario: The counts follow the model

- **WHEN** a console's model is M32R
- **THEN** its card shows 32 strips, 8 aux inputs and 16 / 8 local jacks as used / capacity
- **AND** the edit form shows those counts read-only, not as inputs
- **AND** the desk has 6 aux sockets

#### Scenario: Typed counts on a real model are ignored

- **WHEN** a request sets a typed input or local count on a console whose model is not Generic
- **THEN** the stored counts remain the model's

### Requirement: LV1 80 has a bus mode

LV1 80 and LV1 Classic 80 SHALL have a bus mode: Groups mode (16 groups, 16 Mon) or Monitors mode
(8 groups, 24 Mon). A new desk's bus mode SHALL default to Monitors mode when its role is monitor and
Groups mode otherwise. Changing the bus mode SHALL apply at once with no preview.

#### Scenario: A monitor desk on LV1 80

- **WHEN** a planner adds a monitor-role console with model LV1 80
- **THEN** its bus mode is Monitors mode and its card states 8 groups and 24 Mon

### Requirement: The catalog item suggests a model and never sets one

When a console's catalog or owned item name names a listed model unambiguously, the edit form SHALL
offer that model with one action ("Use M32R"), which goes through the model switch. When it names
only a family whose size the name does not state (an LV1), the form SHALL say so without an action.
The item SHALL never change the model by itself.

#### Scenario: An M32R catalog item

- **WHEN** a Generic console's catalog item is "Midas M32R"
- **THEN** the form says the item is a Midas M32R and offers "Use M32R"

#### Scenario: An LV1 catalog item

- **WHEN** the catalog item is "Waves Emotion LV1"
- **THEN** the form says the licence size is not stated and offers no action

### Requirement: Existing consoles become Generic

The migration SHALL set every existing console to Generic. On every event with exactly one console,
channels and outputs with no desk SHALL be put on that console. No channel number, count or
capacity verdict SHALL change.

#### Scenario: Migrating a single-desk event

- **WHEN** an event has one console and two channels with no desk
- **THEN** after the migration both channels are on that console, which is Generic

### Requirement: A model switch is previewed and never blocked

Changing a console's model SHALL first show a preview: the desk's figures before and after (strips,
aux inputs on X32 · M32, aux sockets when either model has them, local in, local out, each as used /
capacity) and lines led by a word —
**Left out** (rows past the last strip; rows or cables on local jacks or aux sockets the new desk
lacks), **Changed** (stereo style, typed counts replaced, names longer than the new desk shows),
**Moved** (rows whose number changes, listed), **Fits again** (rows previously left out that now fit).
Confirming SHALL apply exactly what the preview stated. The switch SHALL never be blocked and SHALL
delete nothing. A switch whose preview has no line (a desk with no rows, or nothing that changes) SHALL apply without a preview.

#### Scenario: Switching to a smaller desk

- **WHEN** a console with 41 strips in use is switched to X32 Compact
- **THEN** the preview lists the rows past strip 32 under Left out
- **AND** after the switch those rows are still on the sheet, flagged over

#### Scenario: The preview and the switch agree

- **WHEN** the planner confirms a previewed switch
- **THEN** every row's resulting number equals the number the preview stated

#### Scenario: Aux sockets on a switch to X32 Core

- **WHEN** a desk with cables on Aux in 1 and 3 is switched from X32 to X32 Core
- **THEN** the preview's aux socket figure reads 2 / 6 before and 2 / 0 after, and both sockets are
  listed under Left out

### Requirement: The switch maps rows in order

The mapping SHALL take rows in strip order and keep each row's number where it is legal and free on
the new desk. A stereo row on X32 · M32 SHALL take the next free odd pair at or after its number, and
later rows SHALL move along as far as needed; no row SHALL be placed ahead of a row above it. A row
past the last strip SHALL move up into the next free strip after the row above it when
there is one; rows that still do not fit SHALL be kept past the last strip and flagged over. Switching to X32 · M32 SHALL never
place a row on an aux input. Switching from X32 · M32 to LV1 or Generic SHALL put aux rows on strips
after the last channel, in aux order, listed under Moved. Between two X32 · M32 models aux rows SHALL
stay aux. Names SHALL be kept whole.

#### Scenario: A stereo channel on an even number, onto an M32R

- **WHEN** a Generic desk with stereo Piano on 7 and Trumpet on 8 is switched to M32R
- **THEN** Piano becomes 7–8 and Trumpet moves to 9, and the preview lists both

#### Scenario: Overflow onto an X32

- **WHEN** a 40-channel LV1 desk is switched to M32
- **THEN** 8 rows are left out and flagged over, and all 8 aux inputs stay empty

#### Scenario: Aux rows onto an LV1

- **WHEN** an M32 desk with rows on Aux 1–2 and Aux 7–8 is switched to LV1 64
- **THEN** those rows become strips after the last channel and are listed under Moved

### Requirement: Local jacks past a new model's count are kept

When a switch leaves cables on local jacks or aux sockets the new model lacks, the cables SHALL be
kept, the jacks SHALL be drawn on the canvas flagged over, and no new cable SHALL be patched to them.

#### Scenario: X32 to X32 Compact

- **WHEN** a desk with a cable on local input 20 is switched to X32 Compact (16 local inputs)
- **THEN** the cable remains, local input 20 is drawn flagged over, and the preview listed it under Left out

#### Scenario: X32 to M32C

- **WHEN** a desk with a cable on Aux in 2 is switched to M32C
- **THEN** the cable remains, and the aux node is still drawn with Aux in 2 flagged over
