import type { AddressChange, LightingFixture } from '../types'
import { UNIVERSE_SIZE, channelCountOf, dmxMap, universeMap, universeOf } from './dmxMap'

/**
 * The rig's three address operations, as one packer (Slice 27 US4, US5).
 *
 * Auto-assign, optimise and make room differ only in how the groups are ordered
 * and whether a span is being inserted. They are one implementation because the
 * rule they share is exactly the one that is easy to get subtly wrong twice:
 * groups move whole, sharing survives, nothing that was separate becomes shared,
 * and no fixture ever leaves its universe.
 *
 * The packing lives here rather than in Go because the browser has to derive the
 * map anyway — for the strip, the sheet's marks, the drawer and the collision
 * prompt — and these operations are that same map plus an ordering. See
 * specs/027-lighting-sheet/research.md R3. The backend's job is the guarantee:
 * a list of changes lands completely or not at all.
 */

/**
 * `AddressChange` is the wire's shape (`types/index.ts`), used here rather than a
 * camel-cased twin: a plan exists to be sent, and two shapes for one thing is the
 * duplication this module was written to avoid.
 *
 * `dmx_universe` is always the fixture's own. These operations never move one
 * between universes (FR-035).
 */
export interface Plan {
  /** Only fixtures whose address actually changes, so a tidy rig plans to nothing. */
  changes: AddressChange[]
  movedFixtureCount: number
  /** Needed more than 512 channels; left completely untouched (FR-036). */
  skippedUniverses: number[]
}

/** One universe's groups, as the packer sees them. */
interface PlanGroup {
  universe: number
  /** Current start, or null for a fixture that has never been addressed. */
  start: number | null
  count: number
  fixtureIds: number[]
  /** Rig position of the earliest member — auto-assign's ordering. */
  position: number
}

const AFTER_EVERYTHING = Number.MAX_SAFE_INTEGER

function startKey(group: PlanGroup): number {
  return group.start ?? AFTER_EVERYTHING
}

/**
 * Walk the groups in the order given, carrying a cursor, placing each at the
 * cursor and advancing by its width (contracts/dmx-map.md §4).
 *
 * Three properties fall out of a group being one item in this list rather than
 * several, and none of them is a rule the packer applies:
 *
 * - every member of a group receives the same address (FR-032);
 * - a group consumes its channels **once** — twenty pars of seven channels
 *   advance the cursor by seven, not a hundred and forty (FR-034);
 * - distinct groups get disjoint blocks, because the cursor only advances
 *   (FR-033).
 *
 * That is why this cannot satisfy FR-032 while violating FR-033, which is the
 * failure the spec calls out as the non-obvious half of the rule.
 *
 * Returns `null` when the universe does not fit, so the caller can leave it
 * entirely alone rather than half-packed.
 */
function packUniverse(universe: number, ordered: PlanGroup[], cursorStart = 1): AddressChange[] | null {
  let cursor = cursorStart
  const changes: AddressChange[] = []
  for (const group of ordered) {
    if (cursor + group.count - 1 > UNIVERSE_SIZE) return null
    if (group.start !== cursor) {
      for (const fixtureId of group.fixtureIds) changes.push({ fixture_id: fixtureId, dmx_universe: universe, dmx_start_address: cursor })
    }
    cursor += group.count
  }
  return changes
}

/**
 * The groups of one universe, built from the map so the grouping rule exists
 * once. `includeUnaddressed` is the difference between the two operations: a
 * fixture with no address has no span, so it never shared with anything and
 * becomes a group of one — which is how "what did not share before must not
 * share after" holds for fixtures that had nothing to share.
 */
function planGroups(
  fixtures: LightingFixture[],
  universe: number,
  includeUnaddressed: boolean,
): PlanGroup[] {
  const map = dmxMap(fixtures)
  const entry = universeMap(map, universe)
  const position = new Map(fixtures.map((fixture, index) => [fixture.id, index]))
  const groups: PlanGroup[] = (entry?.groups ?? []).map((group) => ({
    universe,
    start: group.start,
    count: group.count,
    fixtureIds: group.fixtureIds,
    position: Math.min(...group.fixtureIds.map((id) => position.get(id) ?? 0)),
  }))

  if (includeUnaddressed) {
    for (const fixture of fixtures) {
      if (fixture.dmx_start_address != null) continue
      if (universeOf(fixture) !== universe) continue
      groups.push({
        universe,
        start: null,
        count: channelCountOf(fixture),
        fixtureIds: [fixture.id],
        position: position.get(fixture.id) ?? 0,
      })
    }
  }
  return groups
}

function planAll(
  fixtures: LightingFixture[],
  includeUnaddressed: boolean,
  order: (a: PlanGroup, b: PlanGroup) => number,
): Plan {
  const map = dmxMap(fixtures)
  const changes: AddressChange[] = []
  const skippedUniverses: number[] = []

  for (const entry of map.universes) {
    const groups = planGroups(fixtures, entry.universe, includeUnaddressed)
    groups.sort(order)
    const packed = packUniverse(entry.universe, groups)
    if (packed) changes.push(...packed)
    else skippedUniverses.push(entry.universe)
  }

  return { changes, movedFixtureCount: changes.length, skippedUniverses }
}

/**
 * Renumber the whole thing: each universe repacked from address 1 in the **rig's**
 * order, and fixtures that have no address get one (FR-038).
 */
export function planAutoAssign(fixtures: LightingFixture[]): Plan {
  return planAll(fixtures, true, (a, b) => a.position - b.position)
}

/**
 * Keep the order the addresses are already in and close the gaps (FR-039).
 *
 * Unaddressed fixtures are left alone: giving them addresses is auto-assign's
 * job, and doing it here would make the two operations differ by more than their
 * ordering.
 */
export function planOptimise(fixtures: LightingFixture[]): Plan {
  return planAll(fixtures, false, (a, b) => startKey(a) - startKey(b) || a.position - b.position)
}

export interface Insertion {
  universe: number
  start: number
  count: number
  /** The fixture being edited, whose current channels are not its own obstacle. */
  excludeFixtureId?: number
}

export interface MakeRoomPlan {
  changes: AddressChange[]
  movedFixtureCount: number
  /** False when the ripple would push a fixture past 512; then `changes` is empty. */
  possible: boolean
}

/**
 * Shift the fixtures at and after an address up by just enough to fit a new span
 * (contracts/dmx-map.md §6).
 *
 * The ripple is the whole of it. Moving every group at or after the insertion
 * point by the inserted width is three lines shorter and destroys gaps a planner
 * left on purpose:
 *
 *     before   [1–16] [17–32]           [100–116]
 *     insert   16 channels at 17
 *     bulk     [1–16] [33–48]           [116–132]   ← the gap at 33–99 is gone
 *     ripple   [1–16] [33–48]           [100–116]   ← stopped at the gap
 *
 * So each group moves only as far as it must to clear the one before it, and the
 * walk **stops at the first group that already clears the cursor** — everything
 * above that one is clear of everything below it, because the list is ascending.
 *
 * That soundness argument needs the list to be non-overlapping, which it is
 * unless the universe already contains a clash. If it does, make room may leave
 * one: it fixes the insertion, not the rig. Optimise fixes the rig, and silently
 * repairing unrelated clashes here would move fixtures the planner never asked
 * about.
 */
export function planMakeRoom(fixtures: LightingFixture[], insert: Insertion): MakeRoomPlan {
  const others =
    insert.excludeFixtureId == null
      ? fixtures
      : fixtures.filter((fixture) => fixture.id !== insert.excludeFixtureId)
  const entry = universeMap(dmxMap(others), insert.universe)
  if (!entry) return { changes: [], movedFixtureCount: 0, possible: true }

  const position = new Map(fixtures.map((fixture, index) => [fixture.id, index]))
  const width = Math.max(1, insert.count)

  // Anything not entirely below the insertion — including a group that starts
  // below it and runs into it, which is in the way just as much as one that
  // starts on it.
  const ahead = entry.groups
    .filter((group) => group.end >= insert.start)
    .sort(
      (a, b) =>
        a.start - b.start || (position.get(a.fixtureIds[0]) ?? 0) - (position.get(b.fixtureIds[0]) ?? 0),
    )

  let cursor = insert.start + width
  const changes: AddressChange[] = []
  for (const group of ahead) {
    if (group.start >= cursor) break
    if (cursor + group.count - 1 > UNIVERSE_SIZE) return { changes: [], movedFixtureCount: 0, possible: false }
    for (const fixtureId of group.fixtureIds) {
      changes.push({ fixture_id: fixtureId, dmx_universe: insert.universe, dmx_start_address: cursor })
    }
    cursor += group.count
  }

  return { changes, movedFixtureCount: changes.length, possible: true }
}
