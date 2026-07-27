# Research: Audio patch shell, second pass

**Feature**: `024-patch-shell-fixes` | **Date**: 2026-07-26

Four defects were reported after the Slice 23 field test. Three of them turned
out to have a single cause each, and one of those causes explains two symptoms
at once. This document establishes what is actually broken before anything is
changed, because two of the four reports name a cause that is only half right.

---

## Part 1 — Desk assignment (US1)

### R1. Why a channel loses its desk

**Finding**: The reporter's diagnosis is correct and slightly incomplete. The
sheet's row editor persists with

```ts
persist: (channel, draft) => updateChannel.mutate({ id: channel.id, data: {
  channel_number, channel_name, width, color, group_ids, dca_ids, notes,
  mixer_behavior: channel.mixer_behavior,
} })
```

— eight fields, no `console_id`. `UpdateInputChannel` writes
`console_id = ?` from the decoded payload unconditionally, and Go decodes an
absent JSON key into a nil `*int64`, so the column is set to NULL. The channel
detaches on the *first save of any field*, which is why the reporter saw it
happen to the one channel they had just added and named.

`OutputSheet` has the identical omission, so FR-001 has to cover both.

The reporter's phrasing suggests the create path is also at fault ("I added a
channel"). It is not: `CreateInputChannel` and `CreateAudioPatchOutput` both
already consult `DefaultConsoleID`. What happened is that the channel was
created *with* the desk and then lost it a moment later on the rename.

**Decision**: Fix it in two layers, not one.

1. Every caller of the update endpoints carries `console_id`. This is the
   convention the codebase already states out loud — "the row's full state
   travels with every PATCH" — and honouring it is the correct fix.
2. `UpdateInputChannel` and `UpdateAudioPatchOutput` additionally fall back to
   `DefaultConsoleID` when the incoming value is nil, exactly as their create
   counterparts do.

**Rationale**: Layer 1 alone is a fix that only holds until the next caller
forgets. Layer 2 alone leaves multi-desk events broken and hides the real
mistake. Together, layer 2 makes the single-desk case — the overwhelming
majority — structurally incapable of producing a deskless row, and layer 1
makes the multi-desk case correct.

**Alternatives considered**: Making the PATCH genuinely partial, by decoding the
body into `map[string]json.RawMessage` alongside the struct and treating an
absent key as "unchanged". Rejected: it would make `console_id` behave
differently from every other field on the same endpoint, for one field, and the
whole-state convention exists so that a PATCH is idempotent and readable in a
log. Not worth splitting the semantics of one endpoint.

### R2. Why the fallback is safe, and why it is limited to one desk

`DefaultConsoleID` returns a console only when the event has exactly one. With
none there is nothing to pick; with several, picking would be a guess. A guess
here is not harmless: attaching a monitor send to the FOH desk puts a wrong line
on a printed patch sheet that someone works from at a show. FR-003 states the
rule; the existing helper already implements it and needs no change.

An extra benefit of running the fallback on update as well as create: any row
that is *already* deskless on a single-desk event — including the ones the
reporter's session produced — repairs itself the next time it is saved. No
migration, no repair script.

### R3. Where the desk picker lives

**Finding**: Both sheets show a Desk select when the event has more than one
desk, and both fire their own mutation from its `onChange`, spreading
`...channel`. So the picker works today, but it saves immediately while every
other field in the same editor waits for Save — and a later Save then wipes what
the picker set, because of R1.

**Decision**: Move `console_id` into the row editor's draft, so the picker
behaves like every other field in the editor and is written by the same Save.

**Rationale**: FR-004. One editor, one Save. It also removes the second mutation
path, which is what made the interaction between the picker and Save so easy to
get wrong.

### R4. The immovable box

**Finding**: `ChannelsNode` (input) and `MixerNode` (output) are the boxes that
hold rows belonging to no desk. Neither is passed an `onDragStart` — the input
one because it never had a position to store, the output one because
`persistPosition` returns early for `kind === 'mixer'` with the comment "the
placeholder node for outputs with no desk: nothing to persist". So the output
box is at least *declared* draggable, and the input box is not draggable at all.
That is the box the reporter could not move.

**Decision**: Make both draggable, and keep their positions in the canvas's
existing in-memory `positions` map, which every node already consults before
falling back to its stored coordinates. `persistPosition` stays a no-op for
these two kinds.

**Rationale**: FR-006. There is genuinely nowhere to store the position of a box
that represents "the rows that belong to nothing" — it is not an entity. But
session-only movement is enough to clear an overlap, and it costs no schema. The
alternative, an `event_canvas_positions` table keyed by an arbitrary node
string, is speculative infrastructure for a box that should be empty most of the
time (Principle V).

### R5. Where the orphan box starts

**Finding**: The input canvas stacks desks from `y = 24` in 220 px steps and
then places the orphan box at the running `nextY`. But each desk node is placed
at its *stored* y, not at the running counter, so with one desk sitting at
`input_position_y = 240` the counter is still at 244 and the two land on top of
each other. That is the overlap.

**Decision**: Start the orphan box below the lowest desk box actually placed,
not below a counter that ignores where they are.

**Rationale**: FR-007. Node heights vary with how many ports they carry, so no
arithmetic makes overlap impossible — which is exactly why R4 is the real fix
and this is the polish. Both are cheap.

---

## Part 2 — The desk's own sockets (US2)

### R6. Why the sockets become their own box

**Finding**: The reporter's diagnosis is exactly right, and their proposed fix is
the one to take. The current desk node renders, on the output graph,
`mixerPorts(outputs)` and then `consoleLocalPorts(desk).outputs` — both
`direction: 'out'`, both right-aligned. The in side of the pass-through is never
drawn. A cable needs an in-side port to land on, so there is no target: a bus
cannot be routed into a local out at all.

The input graph has the mirror image of the same bug, which the reporter did not
hit only because it fails one step later: the desk node draws
`consoleLocalPorts(desk).inputs`, so a source *can* be cabled into a local in —
and then that jack has no out side, so it can never reach a channel. The signal
stops inside the desk.

So both halves of the feature were unusable, and the model underneath them is
already right: `console_local` is in `ValidInputCableFromKinds`,
`ValidInputCableToKinds`, `ValidPortFromKinds` and `ValidPortToKinds`;
`isCablelessEdge('console_local', 'channel')` and
`isCablelessToKind('console_local')` are both true. Nothing about what a cable
may join to has to change. This is a rendering defect with a walker defect
behind it (R9).

**Decision**: The desk's local jacks become their own node on each graph —
freely positioned in the processing lane, drawn with two columns, in on the
left and out on the right, exactly as `StageboxNode` draws its own. The desk
node keeps only its channel strips (input graph) or its bus list (output graph).

**Rationale**: A stage box and a desk's back panel do the same job in the graph:
signal arrives on one side and leaves on the other. Drawing them the same way is
what makes them interchangeable to look at as well as in the data (FR-009), and
it means a run into the desk needs no new cabling concept — it is the stage box
flow with a different box.

**Alternatives considered**:

- *Draw both sides inside the desk node.* Rejected on geometry. On the output
  graph the bus ports are on the desk node's right edge and the local in ports
  would be on its left edge, lower down. The canvas draws a cable as a cubic
  bezier whose control points push out horizontally from each end, so a
  right-edge-to-left-edge cable on the *same* box swings right, doubles back
  across the box, and enters from the left. Every direct-to-desk run would draw
  a loop over the desk's own port list.
- *Move the whole desk node into the processing lane.* Rejected: the channel
  strips are where the signal ends and the bus list is where it starts. Putting
  them mid-canvas breaks the left-to-right reading the lanes exist to give.
- *Keep one node and make the local section's in ports accept a drop from
  anywhere.* Rejected: it does not fix the input graph's missing out side, so
  it fixes one direction of a symmetric bug.

### R7. Where the new node's position is stored

**Finding**: `event_consoles` already has `position_x` / `position_y` (output
canvas) and `input_position_x` / `input_position_y` (input canvas) — migration
031's convention, shared with stageboxes and stage multis. But the desk node is
pinned to its lane on both graphs and only ever reads and writes the `y`. Both
`x` columns are dead.

**Decision**: Add four columns in migration 043 for the socket panel:
`local_position_x`, `local_position_y` (output canvas) and
`local_input_position_x`, `local_input_position_y` (input canvas).

**Rationale**: FR-013. Repurposing the dead `position_x` would leave
`position_x` and `position_y` on the same row describing two different boxes,
which is the kind of thing that reads fine on the day it is written and is
unintelligible six months later. Four explicit columns follow the naming
convention already established for a per-graph position and cost nothing.

### R8. What existing desks get as a starting position

**Decision**: `local_position_x` and `local_input_position_x` default to `260`;
the `y` columns default to `320`. Backfill uses the same values.

**Rationale**: `clampProcessingX` keeps a processing node clear of the source
lane, and a new stage box lands at `x = 420, y = 60`. Putting the socket panel at
`260, 320` starts it inside the processing lane, left of and below where the
first stage box goes, so a migrated event opens with nothing stacked (the
Assumptions section of the spec). Desks with no local sockets declared draw no
node at all (FR-014), so in the common case the column is simply unused.

### R9. The output chain stops at the local jack

**Finding**: A second, independent bug, found while confirming R6.
`walkFromPort` in `signalFlow.ts` decides how to continue past a node with

```ts
if (cable.to_kind === 'device') { … }
else if (cable.to_kind === 'stage_multi') { … }
else { /* assumed to be a stagebox */ }
```

A `console_local` destination falls into the final branch, looks itself up in
`stageboxes`, finds nothing, and yields no continuation ports — so a bus routed
to a local out and then cabled onward to an amplifier would read as ending at
the desk. `OutputFlowContext` also has no `consoles`, so
`nodeName('console_local', …)` returns `#3` and the print sheets would say so.

**Decision**: Add an explicit `console_local` branch that continues through the
same index, and thread `consoles` through `OutputFlowContext` and the walker's
`nameContext`.

**Rationale**: FR-016 and SC-005. The input walker needs nothing: its
`upstreamPort` already returns the same index for any non-device kind, which is
the correct pass-through rule for a local jack.

### R10. What does *not* change

Worth stating so it is not re-litigated during implementation: no change to
`ValidPortFromKinds`, `ValidPortToKinds`, `ValidInputCableFromKinds`,
`ValidInputCableToKinds`, `portsConnectable`, `isCablelessEdge`,
`isCablelessToKind`, or `rentalSummaryQuery`. Slice 23 got all of those right.
The cable into a local in and the cable out of a local out already count on the
order, and the hop inside the desk already does not (FR-012).

---

## Part 3 — Drawer design language (US3)

### R11. What is actually wrong with the drawer

**Finding**, in the order the reporter would meet it:

- `RigDrawer` renders `StageboxMultiSection`, which renders
  `StageboxMultiManager`, whose root is `<div className="mb-6 grid gap-4
  md:grid-cols-2">`. Two columns inside a `max-w-3xl` drawer is about 340 px per
  side, and each stage box row is a six-column grid of *live* controls — name,
  model select, In, Out, connection type, delete. That is the "input fields are
  too small to function".
- Every other section is a `Card` with a `CardHeader`/`CardTitle`, a prose
  paragraph, and always-visible inline controls: `ConsoleSection`,
  `InputDeviceSection`, `ProcessingDeviceSection`, `TrueOutputDeviceSection`,
  `BusSection`. Five sections, four different arrangements of the same idea.
- The mockup's language is none of those: a mono uppercase micro-label as the
  section heading, a small add button on the same line, and one bordered
  "gear" card per item carrying a name, what item it stands for, a mono spec
  line, and — for a desk — a usage meter. Fields appear only on Edit.

**Decision**: Introduce one small set of drawer primitives and rebuild all six
sections on them: `DrawerSection`, `GearCard`, `GearTop`, `GearSpecs`, `Spec`,
`Meter`, `GearForm`, `FieldStack`, `MicroLabel`.

**Rationale**: FR-017, FR-018. The reason all five sections drifted is that
there was nothing shared for them to drift *from*. A primitive set is the thing
that makes SC-008 hold — and hold next slice too, when the same language goes to
the rest of the application.

**Alternatives considered**: A single data-driven `<EntityList columns={…}
fields={…}>` that every section configures. Rejected under Principle V: the six
sections' fields genuinely differ (a stage multi has a length in metres, a device
has a connector type per side, a desk has four counts and an item that may be
owned *or* rented), and a component general enough to express all of that would
be harder to read than the six explicit sections it replaced. Compositional
primitives give the consistency without the abstraction.

### R12. How faithfully to copy the mockup's sizes

**Finding**: The mockup renders the whole application scaled down inside a
document — `.app { font-size: 11px }`, `.field { height: 20px }`, `.lbl {
font-size: 8.5px }`. Copied literally that is a 20 px input with 10.5 px text,
which is smaller than what is being complained about.

**Decision**: Take the mockup's proportions, hierarchy and type roles; do not
take its pixel values. Concretely: the drawer's ratio of label to field to
section gap is about 0.6 : 1.4 : 1, so at the app's 14 px base that is a mono
`text-[9px]` micro-label, an `h-8` field, and a `gap-5` between sections. Add an
`sm` size to `Input` and `Select` for this, rather than changing their defaults.

**Rationale**: The reporter's own framing — apply this language app-wide "but
perhaps as a next slice" — means the defaults must keep working everywhere else
this slice does not touch. An opt-in `size` variant is the smallest change that
gives the audio tabs the mockup's density and leaves the other eight tabs alone.

### R13. Splitting the stage box manager

**Decision**: Retire `StageboxMultiManager` and `StageboxMultiSection`, and
replace them with a `StageboxSection` and a `StageMultiSection` built on the
primitives.

**Rationale**: FR-018 requires them stacked, so the component whose entire
purpose is to put them side by side has nothing left to do. Splitting also drops
its collapse/expand chevrons, which are redundant now that an item is one line
until you edit it.

---

## Part 4 — The sheet row editor (US4)

### R14. One cause, three symptoms

**Finding**: The reporter listed three separate complaints about the row editor.
They are one bug. `InputSheet`'s editor is

```tsx
<div className="grid gap-3 md:grid-cols-[6rem_1fr_8rem_9rem] md:items-end">
```

and its items are, in order: Ch, Name, Width, Tape (filling row 1), Groups
(`col-span-2`), DCA (`col-span-2`) filling row 2, Notes (`col-span-3`), and then
the actions `div`. Notes takes columns 1–3, so **the actions land in column 4,
which is 9 rem — 144 px** — and must hold "Save channel", "Cancel" and the
delete button. Flex items shrink by default, so:

- "Save channel" is compressed until its text meets its own padding → *"the Save
  channel button text almost clips the border"*.
- The delete button is squeezed to a sliver while keeping its `h-8` height, and
  the `h-4 w-4` icon inside it squashes with it → a tall, thin, distorted trash
  can → *"the trash can icon stretches the entire height"*.
- And the layout wastes the row's width while doing it → *"the mockup made
  better use of the space"*.

`OutputSheet` has the same structure with a five-column track and Notes spanning
four, so its actions land in the same trap.

**Decision**: Replace the grid with the mockup's `.rowed` construction: a
`flex flex-wrap items-end gap-3` strip with an amber left rail, each field a
label-over-control stack of its own natural width, the actions pushed right with
`ml-auto`, and delete as a red-tinted **labelled** button.

**Rationale**: FR-027 to FR-029. This is why the spec's assumption about the
trash can — "wrongly proportioned, replaced by a labelled control, which removes
the symptom whatever its cause" — turned out to be the right call: the cause was
the layout, not the icon, and fixing the layout fixes all three.

### R15. Edit in Flow from the row editor

**Decision**: The editor gets an `Edit in Flow →` control that reuses the
existing `onEditInFlow(node)` prop the chain cell already uses, passing the row's
own first upstream node — the source that feeds the channel, or the desk output
itself when nothing feeds it yet.

**Rationale**: FR-030, SC-011. The prop, the tab switch and the canvas selection
all already exist; only the entry point in the editor was missing. Passing the
*source* rather than the channel is what makes the button mean what its label
says — the reason to leave the editor is to change where the signal comes from.

### R16. The Buses drawer comes along

**Decision**: `BusSection` is rebuilt on the same primitives, and the swatch and
member count from the mockup's `.busrow` are kept.

**Rationale**: FR-017 says "the Rig and Buses drawers", and SC-008 is about a
planner being unable to tell new sections from carried-over ones. Leaving one
`Card` in the Buses drawer would fail both for the sake of one file.
