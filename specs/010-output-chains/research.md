# Research: Output signal chains

## R1 — Hop container shape: child table vs. wider row

**Decision**: New child table `output_chain_hops` (one row per hop, ordered
by an integer `position`, FK to `audio_patch_outputs.id` with
`ON DELETE CASCADE`), replacing the fixed
`destination_type`/`stagebox_id(_b)`/`stage_multi_id(_b)`/
`amplifier_item_id`/`speaker_item_id`/`cable_item_id`/`cable_type`/
`cable_length_m` columns on `audio_patch_outputs`.

**Rationale**: Chains are variable-length (spec examples run 1–6 hops); a
fixed set of columns can't represent "sub 1 → sub 2 (chained) → speaker
top" without an arbitrary column-count cap. A child table is the standard
shape for a one-to-many ordered collection and mirrors how this codebase
already models per-event collections referenced by patch rows (stageboxes,
stage multis, groups, DCAs) — hops are exactly that pattern one level
deeper (per-*channel* instead of per-*event*).

**Alternatives considered**:
- *Keep the fixed columns and add a handful more (hop2_item_id, hop3_...)*:
  rejected — caps chain length arbitrarily and contradicts FR-002's
  arbitrary add/reorder/remove requirement.
- *Store the chain as a JSON blob column*: rejected — hops need to be
  independently joined for rental counting (Principle IV: every rented
  item must reference a catalog row via a real FK), and Principle I
  requires traversable relationships, not opaque blobs.

## R2 — Hop kind: device vs. route, and where in the chain a route can occur

**Decision**: Each hop has a Go-validated `hop_kind` of `device` or
`route` (same validated-enum style as `destination_type`/`width` —
not a reference vocabulary, since the value selects which FK columns on
the row are meaningful). A `route` hop can occur at **any** position in
the chain, not only first or last.

**Rationale**: The roadmap's own worked example —
"mixer → **stagebox output** → controller → amplifier → sub 1 → sub 2 →
speaker top" — places the stagebox hop *second*, not last: it represents
"the signal is carried over existing snake/multicore wiring to another
physical location," which can happen at any hand-off point in a chain, not
only as a terminal "leaves the rig, out of scope" marker. Restricting route
hops to the terminal position (my first instinct while writing the spec)
would fail to model this exact example. FR-011 ("a chain's terminal hop
MUST be able to record a routed destination") is satisfied as a special
case of "any hop may be a route hop" — it doesn't require route hops be
*exclusively* terminal.

**Alternatives considered**:
- *Route hops only allowed as the last hop*: rejected per above — doesn't
  fit the example the roadmap explicitly calls out.
- *Model "goes over the snake" as an attribute of the cable instead of a
  hop kind*: rejected — a stagebox/stage-multi hand-off needs its own
  channel-number bookkeeping (occupied-channel checks) the same way input
  routing already does; a cable attribute can't carry that.

## R3 — Stereo doubling for hops (reconciling with Slice 9's amplifier/speaker split)

**Decision**: A hop's **cable** always doubles when the output channel's
width is `stereo`, unconditionally — identical to today's
`cable_item_id` doubling, regardless of hop kind or position. A hop's
**device** doubles when `stereo` *unless* the device is a declared shared
device (`output_devices` reference), in which case it always counts once
regardless of width. A `route` hop's stagebox/stage-multi channel gets an
optional side-B route (mirroring Slice 9's existing side-A/side-B columns
on the old flat row, now scoped to whichever hop is the route hop).

**Rationale**: This exactly reproduces Slice 9's existing rule
(`speaker_item_id` doubles, `amplifier_item_id` never does) without adding
a new "doubles" flag: a plain per-hop device pick behaves like the old
speaker (physically duplicated per side); declaring the SAME hop's device
as a shared `output_devices` entry — even one referenced by only this one
channel — is the mechanism for "this is one two-channel unit," which is
exactly what the old amplifier column meant. It reuses a mechanism the
spec already commits to (FR-007) instead of inventing a second one, and
lets migration (R6) reproduce the amplifier/speaker split exactly by
choosing which hops become shared declarations. Cable "always doubles
unconditionally" matches the pre-existing `cable_item_id` behavior byte
for byte (it doubled regardless of `destination_type` before this slice).

A stereo output row keeps exactly **one** chain (per spec Assumption:
"each output channel still has exactly one chain") — sides are not
modeled as two parallel hop sequences. Only `route` hops carry an explicit
side-B (they're the one hop kind where the two sides can genuinely diverge
to different physical stageboxes, per Slice 9's crowd-mic precedent);
device hops downstream of that hand-off are treated as serving both sides
of a single physical chain (an amp/sub run is normally one shared signal
path even when the source is stereo), with doubling standing in for "you
need two of this physical item, one per side."

**Alternatives considered**:
- *A per-hop `doubles_on_stereo` boolean*: rejected — redundant with the
  shared-device mechanism already required by FR-007; two ways to express
  the same "this is a single 2-channel unit" concept would violate
  Pragmatic Simplicity.
- *Two independent per-side hop chains*: rejected — contradicts the
  spec's own "exactly one chain per channel" assumption and massively
  complicates the UI/model for a case (fully divergent stereo device
  chains) the field feedback never asked for; the one case that
  genuinely needs divergent sides (the snake hand-off) is covered by
  route-hop side B.

## R4 — Shared device deletion behavior (spec correction)

**Decision**: Deleting a shared device clears the reference on every hop
that pointed at it (those hops fall back to "device not yet picked",
flagged as a gap) and then deletes the `output_devices` row — it does
**not** block the deletion.

**Rationale**: The spec's first draft (FR-010, US2 Acceptance Scenario 3)
asserted deletion would be blocked "consistent with how stageboxes and
stage multis already behave" — checking the actual code
(`DeleteStagebox`/`DeleteStageMulti` in `backend/internal/db/audio_patch.go`)
shows the opposite: both clear every referencing row's FK columns first,
then delete, never blocking. This was a factual error caught during
planning (before any implementation) and corrected in spec.md directly, the
same way Slice 9's mic_item_id assumption was corrected in research.md
before implementation began. Matching the existing pattern also avoids
introducing the codebase's first-ever delete-blocking behavior for a
routing/equipment reference, which would be an unjustified inconsistency
under Pragmatic Simplicity.

## R5 — API shape: embedded chain vs. separate hop endpoints

**Decision**: `AudioPatchOutput` gains a `chain: []OutputChainHop` field,
replaced wholesale on every create/update of the output row (same
"updates always replace wholesale" pattern already used for
`group_ids`/`dca_ids` on inputs). No separate per-hop CRUD endpoints.
Shared devices get their own small resource
(`GET/POST /events/{id}/output-devices`,
`PUT/DELETE /events/{id}/output-devices/{deviceID}`), mirroring the
Stagebox/StageMulti manager pattern exactly.

**Rationale**: Hops are always edited in the context of one output
channel's chain (typically 1–6 rows) and never referenced individually
from outside their parent — a full-replace on the parent update avoids a
second family of endpoints, matching the existing group/DCA-membership
precedent for small, wholly-owned child collections. Shared devices, by
contrast, are genuinely independent, event-scoped, and long-lived (created
once, referenced by many chains over the life of the event) — exactly the
shape stageboxes and stage multis already have, so they get the same
manager treatment rather than being folded into the chain payload.

**Alternatives considered**:
- *`PUT /events/{id}/audio-outputs/{outputID}/chain` as a dedicated
  sub-resource*: rejected — no other child collection in this codebase gets
  its own endpoint when it's always edited alongside its parent; adds API
  surface without a concrete need (Pragmatic Simplicity).

## R6 — Migration: converting existing output rows into equivalent chains

**Decision**: Migration 023 adds `output_devices` and
`output_chain_hops`, then for every existing `audio_patch_outputs` row:
- If `amplifier_item_id` is set: create an `output_devices` row wrapping
  it (one-off, referenced by exactly this row — not deduplicated across
  rows, to reproduce per-row counting exactly) and a `device` hop
  referencing it.
- If `speaker_item_id` is set: create a plain (non-shared) `device` hop
  referencing it directly, positioned after the amplifier hop if any.
- If `destination_type` was `stagebox` or `stage_multi`: create a `route`
  hop carrying the old stagebox/stage-multi id + channel (+ side B if
  set).
- If `cable_item_id` was set: attach it as the `cable_item_id` of the
  first hop created above (amplifier hop, else speaker hop, else route
  hop), or its own bare device-less hop if none of those exist for that
  row. If instead only the legacy `cable_type`/`cable_length_m` text was
  set (no catalog pick — Slice 6's backfill was conservative and some
  rows never got one), carry that legacy text onto the same hop's own
  `cable_type`/`cable_length_m` columns (new, read-only-until-repicked
  fields on `output_chain_hops` itself — see data-model.md) rather than
  dropping it; a hop with neither is left with no cable pick at all,
  correctly flagged as a gap.
Finally, `audio_patch_outputs` is rebuilt (table-rebuild migration, the
same technique already used for the DCA column drop) dropping
`destination_type`, `stagebox_id(_b)`, `stage_multi_id(_b)`,
`amplifier_item_id`, `speaker_item_id`, `cable_item_id`, `cable_type`,
`cable_length_m` — every one of them fully superseded by hop rows, so
keeping them around as dead columns would create two sources of truth for
the same fact.

**Rationale**: This exact scheme reproduces every existing row's rental
contribution unchanged (SC-005): the amplifier becomes a one-off shared
device (never doubles, matching the old amplifier rule from R3), the
speaker becomes a plain hop (doubles on stereo, matching the old speaker
rule), and the cable keeps doubling unconditionally regardless of which
hop now carries it. Dropping the superseded columns (rather than leaving
them inert) follows this project's precedent of retiring columns once
fully replaced (migration 021's `dca_groups` drop) as opposed to the
read-only-legacy pattern used when the *old* data has no clean equivalent
in the new shape (e.g. `mic_label`) — here the old data always converts
cleanly, so there's nothing worth keeping around.

**Alternatives considered**:
- *Leave the old columns in place, unused*: rejected — every one of them
  has a lossless equivalent in the new hop shape, so keeping them would
  be dead weight inviting drift (a future bug fix touching one but not the
  other).
- *Deduplicate migrated amplifiers into one shared device per distinct
  catalog item*: rejected — would change the old per-row counting
  behavior (3 outputs historically referencing the same amp catalog item
  counted 3×; deduping would silently drop to 1×), directly violating
  SC-005's "byte-for-byte unchanged" requirement.

## R7 — Rental CTE arms

**Decision**: Replace the three existing output arms
(`amplifier_item_id`, `speaker_item_id`, `cable_item_id` on
`audio_patch_outputs`) with three new arms, keeping the total placeholder
count unchanged (13 → 13):
1. Non-shared device hops: `SELECT h.inventory_item_id, CASE WHEN o.width='stereo' THEN 2 ELSE 1 END, 0 FROM output_chain_hops h JOIN audio_patch_outputs o ON o.id=h.output_id WHERE o.event_id=? AND h.hop_kind='device' AND h.device_source='inventory' AND h.inventory_item_id IS NOT NULL`
2. Hop cables (device or route hops alike): `SELECT h.cable_item_id, CASE WHEN o.width='stereo' THEN 2 ELSE 1 END, 0 FROM output_chain_hops h JOIN audio_patch_outputs o ON o.id=h.output_id WHERE o.event_id=? AND h.cable_item_id IS NOT NULL`
3. Shared devices (counted once per declaration, not per hop reference):
   `SELECT inventory_item_id, 1, 0 FROM output_devices WHERE event_id=? AND inventory_item_id IS NOT NULL`

Owned-gear hops (`device_source='owned'`) and owned shared devices
(`output_devices.owned_item_id` set) get no CTE arm at all — they never
join to `inventory_items`, so they're structurally excluded, exactly like
`event_owned_equipment` today.

**Rationale**: Arm 3 has no join through `output_chain_hops` at all — it
counts every declared shared device row once, independent of how many
hops reference it, which is what makes SC-002 ("referenced by 8 channels,
counted once") a structural guarantee rather than something enforced by
extra `DISTINCT`/dedup logic in application code.

## R8 — Hop validation

**Decision**: Reuse existing validation helpers directly:
`validItemRef` for `cable_item_id`/`inventory_item_id` (existing), a new
`itemBelongsToEvent`-style check for `output_device_id` (must belong to
the same event, same pattern already used for `stagebox_id_b`/
`stage_multi_id_b` in Slice 9's `validSideBRefs`), and a Go-validated
`hop_kind` enum. A hop's device fields are mutually exclusive
(`inventory_item_id` XOR `owned_item_id` XOR `output_device_id`, or none
set yet); this is checked in the API layer the same way Slice 9 validates
`width`/`mixer_behavior`/`source_cabling`.

**Rationale**: No new validation *pattern* is needed — every check this
feature requires already has a direct precedent in the audio-patch
handler from Slices 6, 8, and 9.
