## MODIFIED Requirements

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

### Requirement: Local jacks past a new model's count are kept

When a switch leaves cables on local jacks or aux sockets the new model lacks, the cables SHALL be
kept, the jacks SHALL be drawn on the canvas flagged over, and no new cable SHALL be patched to them.

#### Scenario: X32 to X32 Compact

- **WHEN** a desk with a cable on local input 20 is switched to X32 Compact (16 local inputs)
- **THEN** the cable remains, local input 20 is drawn flagged over, and the preview listed it under Left out

#### Scenario: X32 to M32C

- **WHEN** a desk with a cable on Aux in 2 is switched to M32C
- **THEN** the cable remains, and the aux node is still drawn with Aux in 2 flagged over
