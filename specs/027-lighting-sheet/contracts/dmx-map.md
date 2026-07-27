# Contract: the DMX map and its packing

The pure core of this slice. Everything here is a function of a fixture list and
nothing else — no DOM, no database, no clock, no network.

Values that are part of the visual language belong in `design/`, not here. This
document is about behaviour.

---

## 1 · Normalisation, once, at the edge

Applied when a span is built, so nothing downstream has to keep re-checking:

| Input | Treated as | Why |
|---|---|---|
| `dmx_universe < 1` or absent | `1` | matches what auto-assign has always done; an impossible value, not a real universe (spec Assumptions) |
| `dmx_channel_count < 1` | `1` | matches the existing bulk guard; a fixture occupies at least one channel |
| `dmx_start_address == null` | **no span** | unaddressed is a fourth condition, not a span at address 0 |

A span's `end` is `start + count - 1` and **is allowed to exceed 512**. Clamping
it here would hide the out-of-bounds condition the map exists to report.

## 2 · The four conditions

Derived in this order, because the order is what keeps them independent (FR-024).

1. **Group.** Partition the addressed fixtures of one universe by
   `(start, count)`. Each partition is an `AddressGroup`; one with more than one
   member is **shared**.
2. **Clash.** Compare *groups*, pairwise, within a universe: a clash is
   `a.start <= b.end && b.start <= a.end`. Because identical spans already
   collapsed into one group in step 1, a shared group can never clash with itself.
3. **Out of bounds.** `group.end > 512`.
4. **Unaddressed.** Fixtures with no start address, which took no part in 1–3.

**Same start, different count is a clash, not sharing.** `(49, 16)` and `(49, 4)`
are different partitions in step 1 and intersect in step 2. This is the strict
reading recorded in the spec's Assumptions; relaxing it means partitioning by
`start` alone in step 1 and nothing else changes.

A clash is reported **once per pair of groups** (FR-025). Three fixtures where two
share and the third overlaps both is *one* clash — group A versus group B — and
the shared pair is still reported as shared.

## 3 · Occupancy

Per universe, over the channel numbers `1…512`:

```
occupied = |⋃ { clip(group.start … group.end, 1..512) : group ∈ universe }|
free     = 512 − occupied
runs     = the maximal unoccupied intervals, ascending
```

A **set**, never a sum — three ways a sum is wrong are tabulated in
[research.md](../research.md) R10.

`largestRun` is the longest of `runs`, ties broken by the lower start. It is
reported **separately from `free`**, because only it answers "will a batch of *N*
fit" (FR-029). A universe with 494 free channels in gaps of four has
`largestRun.length === 4`.

`firstRunFitting(n)` returns the first run of at least `n` channels, which is the
next free address for a batch (FR-030) — not `max(occupied) + 1`.

An empty universe has `occupied = 0`, `runs = [{start: 1, length: 512}]`, and its
meter **draws nothing** (FR-070) — distinct from a universe that is genuinely
empty of work, which is the `Undeclared` state in `design/patterns.md` §5.

## 4 · Packing — one function, three callers

```
packGroups(groups, cursorStart = 1) → placements
```

Walks the given groups **in the order given**, carrying a cursor from
`cursorStart`, placing each group at the cursor and advancing by its `count`. A
group whose placement would end past 512 aborts the universe (§5).

Everything specific to an operation is in how its groups are ordered, and whether
a span is inserted first:

| Caller | Groups | Order | Unaddressed fixtures |
|---|---|---|---|
| `planAutoAssign` | every fixture in the universe, addressed or not | rig position of the group's first member | become groups of one, and get addresses |
| `planOptimise` | addressed fixtures only | current `start`, then rig position | excluded — left unaddressed |
| `planMakeRoom` | addressed fixtures only | current `start`, then rig position | untouched |

Because a group is one item in the list being packed:

- **every member of a group receives the same address** (FR-032) — not a rule the
  packer applies, a consequence of the group being one item;
- **a group consumes its channels once** (FR-034) — twenty pars of seven channels
  advance the cursor by seven;
- **distinct groups get disjoint blocks** (FR-033) — the cursor only ever advances.

The last two properties are why the packer cannot satisfy FR-032 while violating
FR-033, which is the failure mode the spec calls out as non-obvious.

## 5 · Universe isolation

Each universe is packed independently:

- **no fixture ever changes universe** (FR-035) — a `Plan`'s `AddressChange`
  always carries the fixture's own normalised universe, and packing never moves a
  group between lists;
- a universe whose groups need more than 512 channels **contributes no changes at
  all** and appears in `skippedUniverses` (FR-036) — it is left exactly as it was,
  not partially packed;
- every other universe is still packed.

A `Plan` is therefore always applicable: it can never be half-valid.

## 6 · Make room

`planMakeRoom(fixtures, { universe, start, count, excludeFixtureId })`.

`excludeFixtureId` is the fixture being edited, whose *current* channels must not
count as an obstacle to its own new address (FR-052).

1. Build the universe's groups, excluding the edited fixture.
2. Find the groups at or after `start`, ascending.
3. Cursor := `start + count`.
4. For each group in turn: if `group.start >= cursor`, **stop** — it and everything
   above it already clear the insertion. Otherwise move it to the cursor and set
   cursor := cursor + `group.count`.
5. If any moved group would end past 512, the whole operation is **not possible**;
   return no changes and say so.

Step 4's stopping condition is the entire difference from a bulk shift, and it is
what preserves a gap the planner left on purpose:

```
before   [1–16] [17–32]           [100–116]
insert   16 at 17
after    [1–16] [33–48]           [100–116]        ← stopped at the gap
```

**Groups below `start` never move** (FR-046). **Groups move whole**, so a shared
group above the insertion point is still shared afterwards (FR-047).

The list in step 2 is sorted and, in a universe with no pre-existing clash,
non-overlapping — which is what makes the stopping condition sound. **If the
universe already contains a clash, make room may leave one.** That is deliberate:
make room fixes the insertion, optimise fixes the rig, and silently repairing
unrelated clashes would move fixtures the planner did not ask about.

## 7 · What the map does not do

- It never decides *whether* an address is allowed. Every state it can describe is
  savable (FR-060); the map's job is to describe, and the surface's job is to say
  so.
- It never places a fixture unasked. `firstRunFitting` answers where a batch
  *would* go; nothing acts on that without a gesture.
- It knows nothing about console IDs beyond passing `duplicateFixtureNumbers`
  through from `lib/lightingRig.ts`, which is unchanged and already tested.

## 8 · Test obligations

`dmxMap.test.ts` and `dmxPlan.test.ts` must cover, at minimum:

| # | Case | Asserts |
|---|---|---|
| 1 | one universe holding a shared group, a clash, an out-of-bounds span and unaddressed fixtures | all four reported, none masking another (SC-006) |
| 2 | twenty fixtures on one address | one group, `occupied === count`, zero problems (SC-005) |
| 3 | same start, different counts | a clash, not a group |
| 4 | a fixture both sharing and clashing | shared *and* in the clash list |
| 5 | span 505–520 | out of bounds; contributes 8 channels to `occupied` |
| 6 | start 512, count 1 | legal, not out of bounds |
| 7 | free channels split into gaps of four | `free` large, `largestRun.length === 4`, `firstRunFitting(16) === null` |
| 8 | auto-assign over a shared group | still shared, one block (SC-007) |
| 9 | auto-assign / optimise over three universes | no fixture changes universe (SC-008) |
| 10 | one universe over 512, others not | only that one in `skippedUniverses`, others changed (SC-009) |
| 11 | optimise over a rig with gaps | order preserved, highest occupied channel falls (SC-010) |
| 12 | optimise over a rig with no gaps | empty `changes` (FR-042) |
| 13 | optimise with unaddressed fixtures | they stay unaddressed; auto-assign gives them addresses |
| 14 | make room with a gap above | ripple stops; the far group does not move |
| 15 | make room below existing fixtures | nothing below the insertion point moves |
| 16 | make room that would exceed 512 | no changes, reported as impossible |
| 17 | make room where the edited fixture is its own obstacle | excluded, no false collision |
| 18 | channel count 0, universe 0 | normalised, no crash, no false problem |
