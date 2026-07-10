# Research: Audio output signal-flow graph

## R1 — No new graph-rendering dependency

**Decision**: Build the canvas with plain React state (device positions,
selection, in-progress drag) and an SVG layer for cable paths — the same
technique already proven in the review mockup — rather than adding a
graph-editor library (e.g. React Flow).

**Rationale**: Constitution V requires a demonstrated need before adding a
runtime dependency. This project's graphs are small — a real event's
output rig is tens of devices, not hundreds — so none of what a graph
library actually buys you (virtualized rendering, minimap, automatic
layout algorithms, large-graph pan/zoom performance) is needed. The
interaction surface itself (drag a node, drag a cable between two fixed
jack positions, recompute a bezier path) is bounded and was already
hand-built successfully for the mockup.

**Alternatives considered**: React Flow / `@xyflow/react` — rejected, adds
a substantial dependency and its own opinionated node/edge model for
capabilities (minimap, large-graph virtualization, layout plugins) this
feature doesn't need; would also fight the left/middle/right pinned-rail
layout rule (FR-006) that a general-purpose graph library doesn't have a
built-in concept for.

## R2 — Ports are computed, not stored

**Decision**: No `ports` table. A port is identified everywhere by
`(kind, id, index)` — `kind` ∈ `mixer | stagebox | stage_multi | device`
— and its existence/bounds are derived at read time from whichever row it
belongs to: a mixer port from the output channel's `width` (1 port, or 2
independent ports if stereo); a stagebox port from its `output_count`; a
stage-multi port (on either side) from its `channels`; a device port from
its `input_port_count`/`output_port_count`.

**Rationale**: A stored `ports` table would need synthetic rows kept in
sync with four different triggers (a device's port-count edit, a mixer
channel's width flip, a stagebox's `output_count` edit, a stage multi's
`channels` edit) — real sync-drift risk for no benefit, since every one
of those counts already lives on an existing row. Computing the live port
list on demand can't drift out of date. The cost — no DB-level FK or
CHECK enforcing a port index is in bounds — is paid the same way this
project already pays it for `destination_type`/`hop_kind`: Go-layer
validation against each node's live count.

## R3 — `Device` extends the existing `output_devices` table

**Decision**: Add `input_port_count`, `input_connector_type`,
`output_port_count`, `output_connector_type`, `position_x`, `position_y`
to Slice 10's `output_devices` table rather than introducing a new table.
Every existing `output_devices` row (the user's real "LR amplifier"/"LR
splitter") keeps its identity through the upgrade.

**Rationale**: `output_devices` already has exactly the right shape for
the general node concept — name, an event scope, exactly one of
`inventory_item_id`/`owned_item_id`. Extending it in place (an additive
`ALTER TABLE`) is a straight continuation of the pattern this project has
used at every prior slice boundary rather than standing up a parallel
table and migrating identity across.

**Alternatives considered**: A brand-new `graph_devices` table — rejected,
would need its own migration of every existing `output_devices` row
*plus* rewriting every `output_device_id` foreign key across the
migration, for no behavioral difference from an in-place `ALTER TABLE`.

## R4 — Rental aggregation simplifies to flat per-row counting

**Decision**: Every rental CTE arm touching output devices/cables becomes
a plain `SELECT inventory_item_id, 1, 0 ... WHERE ... IS NOT NULL` — no
`CASE WHEN width = 'stereo' THEN 2 ELSE 1 END` anywhere in this feature's
arms.

**Rationale**: Slice 9/10's doubling logic existed because a stereo
channel's second physical side was represented *implicitly* (one row,
doubled by a flag) rather than as its own real row. In the graph, a
stereo channel's two sides are two genuinely separate ports from the
start (per the spec's own framing — "a real console has two physical
jacks for a stereo bus, not one") and get two genuinely separate device
rows and cable rows if the tech wires them to different equipment (an
amplifier on one side of the stage), or the *same* shared-device row
counted once if they're wired through one shared two-channel unit (the
existing shared-device rule, unchanged). Counting simply becomes "how
many rows reference this catalog item" — which is what the CTE already
does for stageboxes and stage multis today, this feature just extends the
same shape to devices and cables instead of writing new doubling logic.

## R5 — Migrating existing chains: the algorithm

**Decision**: A one-time Go function (not a `.sql` migration) walks every
existing `audio_patch_outputs` row's `output_chain_hops`, in position
order, once per physical side (one pass for mono, two independent passes
— side A and side B — for stereo), converting each hop into either a new
cable or a reused/new `Device`, before `output_chain_hops` is dropped.

**Algorithm** (per output row, per side):

1. Start `currentPort = (mixer, output.id, sideIndex)`.
2. Walk hops in `position` order:
   - **route hop → stagebox**: emit *no* cable. A stagebox is output-only
     in this graph (FR-004) — it has no input port to cable *into* — so
     the link from whatever fed it cannot be represented and is dropped.
     `currentPort` becomes `(stagebox, stagebox_id, channel - 1)`, so
     anything *after* this hop in the old chain still migrates correctly,
     now sourced from the stagebox as an independent left-rail node
     (structurally identical to being sourced from the mixer).
   - **route hop → stage_multi**: emit a cable from `currentPort` into
     `(stage_multi, stage_multi_id, channel - 1)`. Its `cable_item_id` is
     always set to `NULL` regardless of what the old hop had recorded
     (FR-013 — a stage multi's input side never gets a cable pick, since
     that's the multicore's own built-in wiring, not a separate rentable
     cable). `currentPort` becomes `(stage_multi, stage_multi_id,
     channel - 1)` for whatever comes next (the same channel index,
     read out its output side).
   - **device hop**: resolve the target `Device` — `device_source =
     'shared'` reuses the existing `output_devices` row directly (R3);
     `'inventory'`/`'owned'` creates a one-off new `Device` row wrapping
     that single item, never deduplicated across hops (same rule Slice
     10 already used for its own amplifier migration, preserving
     per-row rental counting exactly). Emit a cable from `currentPort`
     into that device's next free input port. Its `cable_item_id` is the
     hop's `cable_item_id` on side A; on side B it's `cable_item_id_b` if
     set, else falls back to `cable_item_id` — reproducing the old
     "unset side-B cable doubles the same item" total exactly, now as two
     real rows referencing the same catalog item instead of one row
     counted twice. `currentPort` becomes that device's next free output
     port.
3. After every channel/side has been walked, size each `Device`'s
   `input_port_count`/`output_port_count` to the number of distinct
   cables actually referencing its input/output sides (minimum 1 on each
   side that has *any* pre-existing connections, so a device isn't
   collapsed to a phantom 0/0 node) — this is what naturally makes the
   last hop of an old chain resolve to an input-only "destination" device
   (nothing was ever migrated as a cable *out* of it) without needing a
   special terminal-hop flag.
4. Verify rental totals before/after (same technique as Slice 10's
   SC-005) — expected byte-for-byte identical **except** where step 2's
   `stage_multi` cable-drop rule actually discarded a picked cable, which
   is a disclosed, intentional consequence of FR-013's new rule, not a
   bug. Cross-check against the real reference event specifically for
   this exception before considering the migration verified.
5. Produce a short, reviewable report of every channel where a
   stagebox-terminal link was dropped (step 2's first bullet) or a cable
   was discarded under FR-013 (step 2's second bullet), so nothing about
   the user's real, already-built rig disappears without them being told
   — matches this project's standing "never silently touch real data"
   discipline.

**Alternatives considered**: A recursive-CTE SQL migration — rejected
(see plan.md Complexity Tracking): the branching depth (hop kind × device
source × width-driven dual-pass) makes a pure-SQL version unreadable and
effectively unverifiable, for a migration whose correctness against the
user's *real* data matters more than any other migration shipped so far
in this project.

## R6 — Stage multi input side: no cable, no rental line

**Decision**: `to_kind = 'stage_multi'` cables always store `cable_item_id
= NULL` and are rejected by the API if a client attempts to set one; the
rental CTE's cable arm naturally excludes them (it only sums rows with a
non-null `cable_item_id`), so no separate exclusion logic is needed there.

**Rationale**: Directly implements FR-013. The multicore itself is
already counted once via the existing `stage_multis` rental arm
(unchanged, predates this feature); a per-channel "cable" landing on its
input side would double-book the same physical wiring as if it were a
separate rentable item.

## R7 — Port validation

**Decision**: A cable's `from_port`/`to_port` are validated in the API
layer against the live port count of whichever node `from_kind`/`to_kind`
resolves to (mixer: 1 or 2 depending on `width`; stagebox: `output_count`;
stage multi: `channels`; device: `input_port_count`/`output_port_count`).
Direction is enforced structurally, not by a stored flag: `from_*` is
always resolved against a node's *output* side, `to_*` always against its
*input* side, so `from_kind ∈ {mixer, stagebox, stage_multi, device}` but
`to_kind ∈ {stage_multi, device}` only (mixer and stagebox have no input
side to target — FR-004/FR-006). Two more rules, both enforced as unique
constraints: a port can be the source of at most one cable, and the
destination of at most one cable (spec edge case — no port carries two
simultaneous connections; genuine fan-out needs an explicit splitter
device with real extra ports).

**Rationale**: No new pattern — this is the same reuse of
`itemBelongsToEvent`/`validItemRef`-style checks already used throughout
the audio-patch handler since Slice 6.
