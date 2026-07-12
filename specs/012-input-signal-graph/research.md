# Research: Audio input signal-flow graph

## R1 — No new graph-rendering dependency (reaffirms Slice 11 R1)

**Decision**: Build the input canvas with the same hand-rolled React state
+ SVG technique as the Output graph — no graph-editor library.

**Rationale**: Same reasoning as Slice 11 research.md R1: the interaction
surface (tens of nodes per event) doesn't need what a graph library buys
you, and the pinned-rail zone layout (Sources/Channels rails, free
Processing zone) doesn't map onto a general-purpose library's node/edge
model any better here than it did there.

**Alternatives considered**: None re-evaluated — Slice 11 already settled
this for the codebase; introducing a library for only one of two
structurally-identical graphs would be the inconsistent choice.

## R2 — Ports computed, not stored (reaffirms Slice 11 R2)

**Decision**: No `input_ports` table. A port is identified by `(kind, id,
index)` — `kind` ∈ `source | stagebox | stage_multi | device | channel`
— derived at read time: a Source's ports from its `width` (1, or 2
independent ports if stereo); a Stagebox/Stage-Multi's ports from its
existing `input_count`/`channels`; a Device's ports from its
`input_port_count`/`output_port_count`; a Channel has exactly one port
(from its own row existing).

**Rationale**: Identical to Slice 11 R2 — every count already lives on an
existing row, so a synthetic ports table would just be a second place for
the same fact to drift out of sync.

## R3 — A new `input_devices` table, not a reuse of `output_devices`

**Decision**: DI boxes and similar input-side processing gear get their
own new table, `input_devices`, structurally identical in shape to
`output_devices`'s port/connector/position fields (`input_port_count`,
`input_connector_type`, `output_port_count`, `output_connector_type`,
`position_x`, `position_y`, plus the existing
`inventory_item_id`/`owned_item_id` pair) — but a separate table, separate
rows, separate rental-arm entry.

**Rationale**: The feature description's "handled like a Processing
device, and that's fine" asks for the same *shape and interaction
pattern* (a node with an input side and an output side, the same
`ProcessingDeviceSection`-style management table), not literally the same
rows serving two independent, unrelated graphs. Reusing `output_devices`
directly would mean: the Output graph's device-management list would
start showing input-side DI boxes mixed in with amplifiers (today's
`ProcessingDeviceSection` reads that one array with no way to filter
which graph a row belongs to); the rental arm would need new logic to
avoid conflating the two populations; and deleting/repositioning a device
on one graph would risk touching state that also matters to the other.
None of that is needed if the two tables stay independent — the *shape*
is what's proven and worth reusing, not the storage.

**Alternatives considered**: Reuse `output_devices` directly, adding a
`graph` discriminator column (`'input' | 'output'`) to scope it — rejected
as strictly more invasive than a second table with the same shape (an
`ALTER TABLE` on Slice 11's already-shipped table, a backfill of the new
column for every existing row, and conditional filtering added to every
existing query/UI surface that reads `output_devices`), for a benefit
(one shared table) the feature doesn't actually need.

## R4 — `audio_patch_inputs` renamed in place to `input_channels`, slimmed

**Decision**: Rename the existing `audio_patch_inputs` table to
`input_channels` and drop every source-only column (`signal_type`,
`preamp_connector`, `stagebox_id`/`stagebox_channel` (+ `_b` sides),
`stage_multi_id`/`stage_multi_channel` (+ `_b` sides), `mic_item_id`,
`mic_label`, `cable_item_id`, `stand_item_id`, `cable_type`,
`cable_length_m`, `mic_stand`, `phantom_power`, `source_cable_item_id`,
`source_cabling`) — keeping `id`, `event_id`, `channel_number`,
`channel_name`, `width`, `mixer_behavior`, `color`, `notes` untouched.

**Rationale**: Every existing channel keeps its literal row `id` through
the rename, so `audio_input_groups`/`audio_input_dcas` (both FK'd on
`input_id → audio_patch_inputs(id)`) need no data migration at all — a
`RENAME TO` transparently updates their `REFERENCES` clause, and every
group/DCA membership a user has already set up survives untouched. This
is the same "extend/reuse an existing row's identity" instinct as Slice
11 R3, applied to a rename instead of an `ALTER TABLE ADD COLUMN`.

**Alternatives considered**: A brand-new `input_channels` table, copying
rows across and repointing `audio_input_groups`/`audio_input_dcas`' FK
column — rejected: strictly more migration surface (copy + FK rewrite)
for an identical end state.

## R5 — Cableless rule: a Stage Multi's whole output side is free; a Stagebox's only into a Channel

**Revised** (original decision below, corrected after live use surfaced a
real rig where a Stage Multi's output fed a Processing device, not a
Channel, and still shouldn't have prompted for a cable): `cable_item_id`
is forced `NULL` (and the API rejects a non-null value) whenever
`from_kind = 'stage_multi'`, **regardless of `to_kind`** — plus, as
before, whenever `from_kind = 'stagebox'` **and** `to_kind = 'channel'`.

**Rationale**: A Stage Multi's own body *is* the physical cable for its
entire run — there is no separate cable to pick no matter what its output
side feeds (a Channel, a Stagebox, another Stage Multi, or a Processing
device); the real, billable cable is only ever the one on its *input*
side, from the Source into its stage-end jack. A Stagebox has no such
integrated run of its own — each of its jacks is a separate physical
connection point, so only its console-side hop into a specific Channel is
a logical slot assignment ("this channel uses jack 5"); a Stagebox's hop
onward to anything else (a device, another Stagebox/Stage-Multi) is a
real, separately billable cable, same as before.

**Original decision** (superseded above): `cable_item_id` forced `NULL`
exactly when `from_kind ∈ {stagebox, stage_multi}` **and**
`to_kind = 'channel'` — treating a Stage Multi identically to a Stagebox.
This was the mirror image of Slice 11's rule (there, the mixer feeds
*into* the stagebox/multi's input side for free, and its *output* side
onward is real) and seemed like the natural generalization, but it didn't
account for a Stage Multi's output side reaching something *other* than a
Channel — an edge case the original design never explicitly considered
kind-by-kind.

**Alternatives considered**: Keying cablelessness off node kind alone
(any cable touching a Stagebox/Stage Multi is free) — still rejected, it
would incorrectly zero out the real physical mic-cable run from the
Source into either node's own input side, and the real cable from a
Stagebox's output into a device.

## R6 — No stored "splitter vs. two cables" field

**Decision**: A stereo Source's two output ports each connect via their
own `input_cables` row. Whether that's "two independent cables" or "one
physical splitter cable" is never a stored flag — it's simply whether the
second row's `cable_item_id` is set independently or left `null` because
the tech is deliberately reusing the first row's pick for the same
physical cable. The rental aggregation already only sums non-null
`cable_item_id` values per row, so a deliberately-`null` second row
naturally contributes nothing, achieving "billed once" with no special
case anywhere in the aggregation.

**Rationale**: Slice 9's `source_cabling` field existed because the old
model had nowhere else to express "this is one cable, not two" — a flag
on the channel row was the only lever available. In the new cable-graph
model, the two physical ports already are two independent rows, so the
same distinction is just "did you pick an item on both rows or only one,"
which needs no new schema. The UI may offer a one-click "same cable as
the other side" convenience action that fills the first row's item and
leaves the second `null`, but that's a UI affordance, not a data model
addition.

**Alternatives considered**: A `cabling_mode` enum on the cable or a
paired-cable concept — rejected, adds a field (and a consistency rule
requiring the two paired rows to agree) for a distinction the "is one
side's `cable_item_id` null" state already expresses for free.

## R7 — Legacy data conversion: the algorithm

**Decision**: A one-time Go function (not a `.sql` migration, mirroring
Slice 11 R5) walks every existing `audio_patch_inputs` row (read from the
still-legacy-column-intact table, before the follow-up migration drops
them — see plan.md Project Structure), once per physical side (one pass
for mono, two independent passes — side A and side B — for stereo,
exactly like Slice 11 R5's dual-pass), producing:

1. **One new `input_sources` row per side** — `kind = 'mic'` if the old
   row's `signal_type = 'mic'`, or `mic_item_id`/legacy `mic_label` is
   set, or `phantom_power` is true (a union of every old signal that ever
   implied "this is a mic," so no real flag is silently dropped even if
   old data has an inconsistent `signal_type`); `kind = 'line'` otherwise
   (covers old `line`, `di`, `return`, and `aux` signal types alike — none
   of the last three carry mic-specific state worth preserving as a
   distinct `kind`). `connector_type` copies the old `preamp_connector`
   directly (same vocabulary). Old `mic_item_id`/`stand_item_id`/
   `phantom_power` copy across only when `kind = 'mic'`.
2. **If `signal_type = 'di'`**: also create a one-off `input_devices` row
   (1 input port, 1 output port, connector types both copied from
   `preamp_connector`) representing the DI box itself, inserted between
   the new Source and whatever the old row routed onward to. Never
   deduplicated across rows — same one-off-per-row rule Slice 10/11 used
   for non-shared device migrations.
3. **Cable(s)**: if the old row had `stagebox_id`/`stage_multi_id` set,
   emit a real cable from the Source (or the DI device, if step 2
   applied) into that Stagebox/Stage-Multi's stage-end jack at
   `stagebox_channel - 1`/`stage_multi_channel - 1` (old values are
   1-based; ports are 0-based), carrying the old `cable_item_id` (source
   cable) or — for the DI case — the old `source_cable_item_id`; then a
   second, cableless cable from that same jack's console-side port to
   the migrated Channel (R5). If neither was set, emit one real cable
   directly from the Source/DI device straight to the Channel, carrying
   `cable_item_id`.
4. **Stereo splitter carry-over**: when the old row's `width = 'stereo'`
   and `source_cabling = 'splitter'`, side B's equivalent cable
   (Source/DI-side) is written with `cable_item_id = NULL` regardless of
   what the old `source_cable_item_id` held on that side — reproducing
   "billed once" (R6) as two real rows, one of them deliberately
   unbilled, instead of the old doubling-avoidance flag.
5. **The `input_channels` row itself** keeps its original `id`
   (R4 — table renamed in place), so `channel_number`, `channel_name`,
   `width`, `mixer_behavior`, `color`, `notes`, and every group/DCA
   membership survive with zero additional migration work.
6. **Disclosed, intentional data loss**: the legacy pre-catalog fallback
   text fields (`mic_label`, `cable_type`/`cable_length_m`, `mic_stand`)
   are not carried forward — they were already flagged as
   "read-only, unlinked" display-only leftovers in today's UI, and the
   new cable/Source model has no equivalent free-text slot. A short
   migration report lists every row this drops non-empty legacy text
   from, so nothing vanishes silently (same discipline as Slice 11 R5's
   dropped-link report).

**Alternatives considered**: A recursive-CTE SQL migration — rejected for
the same reason as Slice 11 R5: the branching (mic-vs-line inference, DI
device insertion, per-side stereo handling, splitter carry-over) is real
conditional logic that is unreadable and unverifiable as pure SQL, for a
migration whose correctness against the user's real, already-built event
data matters more than anything else in this feature.

## R8 — Signal Flow / print sheet walks backward from each Channel

**Decision**: The Input signal-flow view and print sheet keep enumerating
rows by `channel_number` (today's convention) and, per channel, walk
`input_cables` backward — from the Channel's one port, to whichever edge
targets it, to that edge's origin, recursing until a Source with nothing
further upstream — rather than walking forward from an implicit
all-channels origin the way the Output graph walks forward from the
mixer.

**Rationale**: Unlike the Output graph's Mixer, there is no single
implicit "all channels" node on the input side to start a forward walk
from — Channels are independent rows, and per-channel enumeration is
already the natural, existing shape of the print sheet
(`InputPatchSheet.tsx` today lists rows by `channel_number`). Walking
backward from each Channel is the direct continuation of that shape onto
the new graph, and naturally reproduces "no Source found" as the gap
condition per spec Edge Cases.

**Alternatives considered**: Enumerating from Sources forward and
grouping by destination Channel — rejected, it would have to re-sort
results back into channel-number order for the print sheet anyway (its
one hard requirement), so walking backward from the channel is strictly
less work and matches the existing component's shape.

## R9 — Color is derived, never stored except on the Channel

**Decision**: `input_channels.color` is the only stored color. Every
Source's, Device's, and Stagebox/Stage-Multi-port's displayed color is
computed client-side by tracing `input_cables` forward from that port to
whichever Channel(s) it reaches: one color if every reachable Channel
agrees (or only one is reachable), a neutral "unset" color if none is
reachable yet or reachable Channels disagree. This is pure frontend logic
(a new `inputGraph.ts` function) with no backend/schema involvement,
recomputed from current data on every render — never persisted, so it
can never drift out of sync with the Channel colors it's derived from.

**Rationale**: Directly implements spec FR-018/US4, and follows the exact
precedent the Output graph already established for node role/zone
(data-model.md "Derived / computed values" in Slice 11): anything that
can be computed from data that already exists elsewhere is computed, not
stored a second time.

**Alternatives considered**: A color field on Stagebox/Stage-Multi
channels (spec's option B, raised and rejected during mockup review) —
would need its own conflict-priority rule against the Channel's color and
is a third place color could disagree with itself; rejected in favor of
the zero-new-storage inference approach, confirmed during mockup review.
