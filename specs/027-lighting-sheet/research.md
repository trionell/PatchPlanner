# Research: Lighting becomes a sheet

Every decision this slice rests on, and what each one rejected. Written before the
code, corrected by it where the code disagreed.

---

## R1 · What the Lighting tab actually is today

`LightingTab.tsx`, 502 lines, one `Card` holding one `ui/Table` of fourteen
columns (thirteen plus the delete cell). Counted rather than remembered:

```
grep -c "<Input\|<Select" frontend/src/components/event/LightingTab.tsx   # 24
```

Every row renders: two `Input`s for the console ID and position, an `Input` for
the custom name **below** a read-only model name, two `Select`s for power and
connector, an `Input` for the universe, a `Select`-plus-`Input` pair for the mode,
an `Input` for the channel count, an `Input` for the notes, and a delete button.
Only three cells are read-only: the row ordinal, the truss, and the DMX address
range.

Two dialogs sit beside it — Add Fixture and Bulk Add — holding two copies of the
model picker, the mode picker and the channel count. The drift is already
measurable: **the single-add dialog has no universe and no power fields**, so
every hand-added fixture starts on universe 1 with a Schuko regardless of intent,
while the bulk dialog asks for both.

That last fact is the strongest argument in the spec for merging them, and it was
found by reading the two dialogs side by side rather than by design reasoning.

## R2 · There is no DMX map anywhere in the codebase

Searched for anything that reasons about addresses:

```
grep -rn "512\|dmx_start_address" frontend/src backend/internal --include='*.ts*' --include='*.go'
```

The only occurrences are `formatDMXRange` (a display helper), the bulk-add
capacity guard, and `AutoAssignDMX`'s own bound. **Nothing detects an overlap,
nothing computes occupancy, and nothing knows what a gap is.** The status strip is
therefore not a restyle of an existing check — it is the first time the
application has an opinion about a rig's addressing.

Auto-assign is why this has survived: it packs each universe from address 1 in rig
order, so its own output is always clean, and a rig that is only ever addressed by
that button is never wrong. The failure mode arrives with the first hand-edit
afterwards.

## R3 · Where the packing lives — the decision this plan turns on

**Chosen: TypeScript, once, in `lib/dmxPlan.ts`, with three callers. The backend
gains a transactional address writer and loses its packing algorithm.**

The alternatives were weighed against four facts:

1. **The browser must derive the map regardless.** The strip states occupancy per
   universe; the sheet marks clashing and shared cells; the drawer shows free runs
   and largest run; the add editor answers "will this batch fit"; the collision
   prompt must know what is in the way and how many fixtures would move — *before*
   any request is sent. None of that can be server-side without a round trip per
   keystroke.
2. **The three operations are that same map plus an ordering.** Auto-assign orders
   groups by rig position; optimise orders them by current address; make room
   places one span and ripples. Strip the ordering out and one function remains.
3. **FR-082 requires these derivations to be pure functions, testable without a
   database.** A Go implementation is testable without a *DOM* but not without a
   `*sql.DB` in this codebase's idiom — `AutoAssignDMX` takes one.
4. **Go and TS both having the rule means it can drift.** The ripple's stopping
   condition and the "identical spans are one group" rule are precisely the sort of
   thing that gets fixed on one side.

So: **Go keeps the guarantee, TS keeps the arithmetic.** The endpoint accepts a
list of `(fixture id, universe, start address)` and applies it in one
transaction, validating that every fixture belongs to the rig and every address is
within 1–512. It cannot be talked into an inconsistent write, and it has no
opinion about what a good address is.

**Rejected — packing stays in Go, three endpoints.** Honest and conventional, and
it would have left the ripple rule in two languages, with the client's preview
("moves 11 fixtures") free to disagree with what the server then did. A preview
that can lie is worse than no preview.

**Rejected — packing in Go with a dry-run mode.** Fixes the disagreement by making
every collision cost a round trip before the prompt can be drawn, and adds a
second response shape to keep in step with the first.

**Consequence accepted:** `AutoAssignDMX` and `ErrUniverseFull` are deleted from
`db/lighting.go`, and the `auto-assign-dmx` route is deleted from the router. Its
tests do not disappear — they become `dmxPlan.test.ts` cases, where they can cover
groups, gaps and universe isolation exhaustively without standing up a database.

## R4 · The staleness this introduces, and why it is not new

A rig-wide repack computed in the browser is computed from what the browser last
fetched. If a second contributor changed an address in between, the write
overwrites it.

This is the concurrency model the application already has. `updateLightingFixture`
sends the **whole fixture row** from a client-held draft and has since Slice 7; so
does every audio row editor. Last write wins, everywhere, deliberately — a
planning tool for one or two people preparing an event, not a collaborative
editor.

What is genuinely new is the *blast radius*: one confirmation can now move thirty
fixtures instead of one. That is why FR-041 requires both operations to state what
they will change and to ask first. It is a mitigation of the model, not a fix for
it, and pretending otherwise would need optimistic concurrency on every route in
the application.

## R5 · Sharing recognised by identical spans, not stored

Settled in the spec (Assumptions), recorded here for the reason that matters to
the implementation: **because sharing is derived, the bulk operations preserve it
for free.** `packGroups` groups by `(universe, start, count)` before it does
anything else, so "members of a group keep the same address" is not a rule the
packer has to remember — it is a consequence of a group being one item in the list
it packs.

A stored `shared_group_id` would have needed the packer to consult it, the row
editor to maintain it, the delete path to garbage-collect it, and a migration to
create it. Every one of those is a place for the flag to disagree with the
addresses it describes.

## R6 · The ripple, and why not a bulk shift

FR-046 specifies make room as a ripple. The obvious alternative — shift every
group at or after the insertion point by the inserted width — is three lines
shorter and wrong in a specific way: it destroys deliberate gaps.

```
before   [1–16] [17–32]           [100–116]
insert   16 channels at 17

bulk     [1–16] [17–32]→[33–48]   [100–116]→[116–132]      gap at 33–99 destroyed
ripple   [1–16] [17–32]→[33–48]   [100–116] untouched      ripple stops at the gap
```

The ripple's stopping condition is the whole of it: walk the groups at or after
the insertion point in ascending address order, carrying a cursor; move a group
only if it starts before the cursor; **stop at the first group that does not**.
Everything above that group is already clear of everything below it, because the
list is sorted and non-overlapping.

The "non-overlapping" qualifier matters and is stated in the contract: if the
universe already contains a clash, the ripple may leave one. Make room fixes the
insertion, not the rig; optimise fixes the rig.

## R7 · Why the collision prompt is not a dialog

The tab currently has two dialogs and ends this slice with zero, which is an
explicit success criterion (SC-012). Reintroducing one for the collision would be
the same shape of mistake — an overlay for a decision that belongs to the thing
being edited.

`design/patterns.md` §5 puts an error "inline above the content it concerns. Never
a toast; the user needs to see it next to what failed." A collision is not an error
but the reasoning is identical, so the prompt is a full-width block inside the row
editor's amber body, below the fields and beside the actions it replaces.

This is why `RowEditor` gains a `notice` slot rather than the prompt being
positioned absolutely: the editor already owns the wrapping flex row, and a block
that participates in it cannot end up overlapping a field at some window width.

## R8 · Checked on confirm, not while typing

An address typed digit by digit passes through several collisions on its way to
the intended one: typing `149` visits `1`, then `14`, then `149`. A prompt that
appeared for each would be unusable, and one that debounced would appear *after*
the planner had stopped caring.

On confirm is also when the planner has committed to a value, which is the moment
a question about it is worth asking.

## R9 · What the strip counts, and the one that is not a state

The audio strip has three states and no fourth thing. The lighting strip has three
states — errors, unaddressed, clean — plus **shared groups, which are present in
all three**.

That is deliberate and is the mitigation for R5's one weakness: sharing is derived
from addresses agreeing, so a bulk add run twice produces a group nobody asked
for. Counting shared groups in every state means the condition is never silent,
while tinting the strip for it would be crying wolf about the most ordinary
arrangement in environment lighting.

## R10 · Occupancy as a channel set, not a sum

Three ways a naive sum is wrong, all reachable at once:

| | Sum says | Truth |
|---|---|---|
| Twenty fixtures sharing 1–7 | 140 channels | 7 |
| A clash where 49–63 and 56–70 overlap | 30 | 22 |
| A span at 505–520 | 16 | 8 within the universe |

So occupancy is a **set of channel numbers**, built by unioning each span clipped
to 1–512. Free runs fall out of the same structure by walking 1→512 once. At 512
channels per universe and a handful of universes, the cost of being obviously
correct is nothing worth optimising.

`patchCapacity.usedPorts` already does exactly this — a `Set` unioned over both
sides of a cable, with the comment "a jack used in both directions is still one
jack" — so this is the codebase's existing answer to the same class of mistake,
applied to a different noun.

## R11 · `dmx_chain_parent_id` really is dead

Established before proposing the migration, not after:

- `backend/migrations/004_lighting.up.sql` defines it.
- `db/lighting.go` reads it in two queries, writes it in create and update, and
  nulls it in the delete cascade.
- `api/lighting.go` never sets it; no handler mentions it.
- The bulk insert does not include the column at all.
- `frontend/src/types/index.ts` declares it; `LightingTab.tsx` prints it raw
  (`{fixture.dmx_chain_parent_id ?? '—'}`); nothing writes it.
- `db/lighting_test.go:171` sets it by hand — the only assignment in the
  repository, and it exists to prove the column round-trips.

So the value is always `NULL` in every rig anyone has ever built, and the down
migration restoring an empty nullable column loses nothing that was there.

**`ALTER TABLE … DROP COLUMN` is safe here**, and this is not a guess: migration
`033_drop_truss_sections.up.sql` already drops a `REFERENCES` column from *this
exact table*, and its down migration adds it back the same way. The table-rebuild
pattern of migration 018 is not needed.

## R12 · Bulk add: extend the request rather than compose from single creates

The add editor needs three things the bulk endpoint cannot express: a name for the
fixtures, a batch with no catalog model, and a batch that all shares one address.

**Chosen: widen `BulkFixtureRequest`.** `inventory_item_id` becomes optional,
`name_stem`, `share_address` and `dmx_start_address` are added. Two dozen lines
across the domain struct, the handler's validation and one insert loop, and the
batch stays one transaction.

**Rejected: composing the batch from N single creates in the browser.** Up to a
hundred requests for one gesture, no atomicity, and a half-created batch on the
first failure. It would also have made the client responsible for consecutive
console IDs, which the endpoint already does correctly.

Note the boundary against R3: the arithmetic that stays in Go here is
`start + i × count` for a consecutive batch, or `start` for a shared one. That is
not the group-aware packing R3 moved out — it neither reads other fixtures nor
resolves collisions. The client computes the batch's start address from the map
and sends it; if it collides, the collision prompt has already run and either
shifted the rig or been overruled.
