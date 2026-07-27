# Data Model: Lighting becomes a sheet

What is stored, what is derived, and what moves on the wire.

---

## 1 · Stored — one removal, nothing added

`lighting_fixtures` loses exactly one column and gains none.

| Column | Change |
|---|---|
| `dmx_chain_parent_id` | **dropped** (migration 044) |

Everything else — `fixture_number`, `inventory_item_id`, `custom_name`,
`position_index`, `power_connection`, `power_chain_parent_id`,
`power_connector_in`, `power_connector_out`, `dmx_universe`,
`dmx_start_address`, `dmx_channel_mode`, `dmx_channel_count`, `notes` — is
untouched.

**Nothing about sharing is stored** (FR-077). A shared group exists because its
members' addresses agree; see [research.md](./research.md) R5.

### Migration 044

```sql
-- up
ALTER TABLE lighting_fixtures DROP COLUMN dmx_chain_parent_id;

-- down
ALTER TABLE lighting_fixtures ADD COLUMN dmx_chain_parent_id INTEGER REFERENCES lighting_fixtures(id);
```

The down migration restores the **schema**, not the data, because there has never
been any (research.md R11). `DROP COLUMN` is the pattern migration 033 already
used on this table.

The delete cascade in `DeleteLightingFixture` loses its
`UPDATE … SET dmx_chain_parent_id = NULL` statement; the `power_chain_parent_id`
statement beside it stays.

## 2 · Derived — `lib/dmxMap.ts`

None of this is persisted or sent. It is computed from the fixture list the tab
already holds, memoised per list, and is the input to the sheet's marks, the
strip, the drawer, the add editor's fit line and the collision prompt.

```ts
/** A fixture's occupied channels. A fixture with no start address has none. */
interface Span {
  universe: number      // normalised: < 1 becomes 1
  start: number
  count: number         // normalised: < 1 becomes 1
  end: number           // start + count - 1, may exceed 512
}

/** Fixtures whose spans are identical. A fixture sharing with nobody is a group of one. */
interface AddressGroup {
  universe: number
  start: number
  count: number
  fixtureIds: number[]  // in rig order
  shared: boolean       // fixtureIds.length > 1
}

type DmxProblem =
  | { kind: 'clash'; universe: number; a: number; b: number }        // fixture ids
  | { kind: 'out-of-bounds'; universe: number; fixtureId: number }

/** One universe, everything the drawer and the strip say about it. */
interface UniverseMap {
  universe: number
  fixtureCount: number
  occupied: number              // distinct channels, counted once
  free: number                  // 512 - occupied, including interior gaps
  runs: { start: number; length: number }[]   // the gaps, ascending
  largestRun: { start: number; length: number } | null
  groups: AddressGroup[]        // ascending by start
  sharedGroupCount: number
  problems: DmxProblem[]
}

interface DmxMap {
  universes: UniverseMap[]      // ascending, only those in use
  unaddressed: number[]         // fixture ids
  problems: DmxProblem[]        // every universe's, flattened
  sharedGroupCount: number
  duplicateNumbers: Set<number> // from lib/lightingRig.ts, unchanged
}
```

**The four conditions, as predicates over this structure:**

| Condition | Test |
|---|---|
| shared | `group.fixtureIds.length > 1` |
| clash | two groups in one universe whose `[start, end]` intervals intersect — groups, not fixtures, so identical spans can never clash |
| out of bounds | `group.end > 512` |
| unaddressed | `fixture.dmx_start_address == null` |

That grouping-before-comparing is what makes FR-020 and FR-021 one line each
instead of a special case: **identical spans collapse into one group before any
pair is compared**, so a shared group is structurally incapable of clashing with
itself (FR-024).

`occupied` is the size of a `Set<number>` unioned over every group's channels
clipped to 1–512 — never a sum (research.md R10).

## 3 · Derived — `lib/dmxPlan.ts`

```ts
interface AddressChange {
  fixtureId: number
  universe: number      // always the fixture's own — never changed (FR-035)
  startAddress: number
}

interface Plan {
  changes: AddressChange[]          // only fixtures whose address actually moves
  movedFixtureCount: number
  skippedUniverses: number[]        // could not fit in 512; left untouched
}

planAutoAssign(fixtures): Plan          // orders groups by rig position
planOptimise(fixtures): Plan            // orders groups by current start, then rig position
planMakeRoom(fixtures, insert): Plan    // places one span, ripples the rest
```

All three call one `packGroups(groups, ordering)`; see
[contracts/dmx-map.md](./contracts/dmx-map.md) §3.

`changes` omits fixtures that do not move, so a plan over a tidy rig is empty and
the surface can honestly say "no gaps to close" (FR-042).

## 4 · The wire — API delta

### Removed

```
POST /api/v1/events/{eventID}/lighting-rigs/{rigID}/fixtures/auto-assign-dmx
```

Gone, with `dbstore.AutoAssignDMX` and `dbstore.ErrUniverseFull`. Its behaviour is
replaced, not relocated: see research.md R3.

### Added

```
PATCH /api/v1/events/{eventID}/lighting-rigs/{rigID}/fixtures/addresses
```

```jsonc
// request
{
  "changes": [
    { "fixture_id": 12, "dmx_universe": 1, "dmx_start_address": 49 },
    { "fixture_id": 13, "dmx_universe": 1, "dmx_start_address": 65 }
  ]
}
// 200 → the rig's full fixture list, as the other lighting routes return
```

Rules the endpoint enforces, and the only ones it has:

- every `fixture_id` belongs to `{rigID}`, which belongs to `{eventID}` — else
  404, matching `requireFixtureForRig`;
- `dmx_universe >= 1` and `1 <= dmx_start_address <= 512` — else 400;
- at most 500 changes in one request — a bound, not a policy;
- **all or nothing**, in one transaction.

It has no opinion about whether the addresses are *good*. Overlaps are the map's
business, and the map lives in the browser.

### Widened

```
POST /api/v1/events/{eventID}/lighting-rigs/{rigID}/fixtures/bulk
```

`BulkFixtureRequest` gains three fields and relaxes one:

| Field | Change | Why |
|---|---|---|
| `inventory_item_id` | `int64` → `*int64` | a batch of custom fixtures (FR-065) |
| `name_stem` | new, optional | fixtures named `"<stem> N"` from 1 (FR-064) |
| `share_address` | new, default false | the whole batch on one address (FR-067) |
| `dmx_start_address` | new, optional | the client picked the address from the map; the server no longer guesses |

When `dmx_start_address` is absent the existing behaviour stands (append after the
highest used address in that universe), so nothing that calls this today changes
meaning.

The 512 guard stays, and with `share_address` it checks one fixture's width rather
than the batch's — twenty pars on one address need seven channels, not a hundred
and forty (FR-067).

## 5 · Frontend types

```ts
// types/index.ts
interface LightingFixture {
  …
  dmx_chain_parent_id?: number     // REMOVED
}

interface BulkFixtureRequest {
  inventory_item_id?: number       // was required
  name_stem?: string               // NEW
  share_address?: boolean          // NEW
  dmx_start_address?: number       // NEW
  …
}
```

## 6 · What holds a draft, and what does not

Consistent with the audio sheets, and stated because the collision prompt makes it
non-obvious:

| Holds a draft | Commits immediately |
|---|---|
| the row editor (`useRowEditor`) | the three bulk gestures |
| the add editor | |

The **collision prompt does not hold a draft of its own**. It is a decision *about*
the draft already in the editor: choosing make room sends the address changes and
then saves the draft; choosing share address or place anyway just saves it. If the
address write fails, the draft is still in the editor and nothing has been saved —
which is the honest outcome, since the rig was not shifted either.

The one ordering that matters: **shift first, then save the fixture.** The reverse
would save a fixture into a collision and then move things around it.
