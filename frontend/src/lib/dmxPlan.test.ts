import { describe, expect, it } from 'vitest'
import type { AddressChange, LightingFixture } from '../types'
import { UNIVERSE_SIZE, dmxMap, universeMap } from './dmxMap'
import { planAutoAssign, planMakeRoom, planOptimise } from './dmxPlan'

/**
 * The cases in specs/027-lighting-sheet/contracts/dmx-map.md §8, 8–17.
 *
 * Every packing test also asserts the two invariants that can be satisfied in one
 * direction only — no fixture changed universe, and what shared still shares
 * while what did not still does not — via `expectInvariants`.
 */

interface Options {
  universe?: number
  start?: number | null
  count?: number
}

function fixture(id: number, options: Options = {}): LightingFixture {
  return {
    id,
    rig_id: 1,
    position_index: id,
    power_connection: 'grid',
    power_connector_in: 'schuko',
    dmx_universe: options.universe ?? 1,
    dmx_start_address: options.start === null ? undefined : (options.start ?? 1),
    dmx_channel_count: options.count ?? 16,
  }
}

/** The rig as it would be after the plan is applied. */
function applied(fixtures: LightingFixture[], changes: AddressChange[]): LightingFixture[] {
  const byId = new Map(changes.map((change) => [change.fixture_id, change]))
  return fixtures.map((f) => {
    const change = byId.get(f.id)
    return change ? { ...f, dmx_universe: change.dmx_universe, dmx_start_address: change.dmx_start_address } : f
  })
}

/** Which fixtures share an address with which, as a comparable set of pairs. */
function sharingPairs(fixtures: LightingFixture[]): Set<string> {
  const pairs = new Set<string>()
  for (const universe of dmxMap(fixtures).universes) {
    for (const group of universe.groups) {
      for (let i = 0; i < group.fixtureIds.length; i += 1) {
        for (let j = i + 1; j < group.fixtureIds.length; j += 1) {
          pairs.add(`${group.fixtureIds[i]}-${group.fixtureIds[j]}`)
        }
      }
    }
  }
  return pairs
}

function universeOfEach(fixtures: LightingFixture[]): Record<number, number> {
  return Object.fromEntries(fixtures.map((f) => [f.id, f.dmx_universe]))
}

/**
 * FR-032 and FR-033 together. Only asserting the first would pass for a packer
 * that put everything on one address; only asserting the second would pass for
 * one that dissolved every group.
 */
function expectInvariants(before: LightingFixture[], after: LightingFixture[]) {
  expect(universeOfEach(after)).toEqual(universeOfEach(before))
  expect(sharingPairs(after)).toEqual(sharingPairs(before))
}

describe('planAutoAssign', () => {
  // Case 8 — a shared group survives (SC-007).
  it('keeps twenty fixtures on one address as one block of their own width', () => {
    const pars = Array.from({ length: 20 }, (_, index) => fixture(index + 1, { universe: 3, start: 200, count: 7 }))
    const rig = [fixture(99, { universe: 3, start: 1, count: 16 }), ...pars]
    const after = applied(rig, planAutoAssign(rig).changes)

    expectInvariants(rig, after)
    expect(new Set(pars.map((par) => after.find((f) => f.id === par.id)!.dmx_start_address))).toEqual(new Set([17]))
    expect(universeMap(dmxMap(after), 3)!.occupied).toBe(23)
  })

  // Case 9 — universes are not buckets to be rearranged (SC-008).
  it('never moves a fixture between universes', () => {
    const rig = [
      fixture(1, { universe: 1, start: 100 }),
      fixture(2, { universe: 2, start: 50 }),
      fixture(3, { universe: 3, start: 400 }),
      fixture(4, { universe: 2, start: 200 }),
    ]
    const after = applied(rig, planAutoAssign(rig).changes)
    expectInvariants(rig, after)
    expect(after.map((f) => f.dmx_start_address)).toEqual([1, 1, 1, 17])
  })

  // Case 10 — one over-full universe does not take the rig down with it (SC-009).
  it('leaves an unfittable universe completely alone and packs the others anyway', () => {
    const tooMany = Array.from({ length: 40 }, (_, index) => fixture(100 + index, { universe: 2, start: 1 + index, count: 16 }))
    const rig = [fixture(1, { universe: 1, start: 100 }), fixture(2, { universe: 3, start: 300 }), ...tooMany]
    const plan = planAutoAssign(rig)

    expect(plan.skippedUniverses).toEqual([2])
    expect(plan.changes.some((change) => change.dmx_universe === 2)).toBe(false)
    expect(plan.changes.map((change) => change.fixture_id).sort((a, b) => a - b)).toEqual([1, 2])
  })

  // Case 13 — the two operations differ about unaddressed fixtures.
  it('gives unaddressed fixtures an address', () => {
    const rig = [fixture(1, { start: 1, count: 16 }), fixture(2, { start: null, count: 8 })]
    const after = applied(rig, planAutoAssign(rig).changes)
    expect(after[1].dmx_start_address).toBe(17)
  })

  it('does not make two unaddressed fixtures share, however alike they are', () => {
    const rig = [fixture(1, { start: null, count: 8 }), fixture(2, { start: null, count: 8 })]
    const after = applied(rig, planAutoAssign(rig).changes)
    expect(after.map((f) => f.dmx_start_address)).toEqual([1, 9])
    expect(sharingPairs(after).size).toBe(0)
  })

  it('places a group at the position of its first member without reordering the rest', () => {
    const rig = [
      fixture(1, { start: 400, count: 8 }),
      fixture(2, { start: 100, count: 8 }),
      fixture(3, { start: 400, count: 8 }), // shares with 1, which comes first in the rig
    ]
    const after = applied(rig, planAutoAssign(rig).changes)
    expect(after.map((f) => f.dmx_start_address)).toEqual([1, 9, 1])
  })
})

describe('planOptimise', () => {
  // Case 11 — order preserved, gaps closed (SC-010).
  it('keeps the relative order and closes the gaps', () => {
    const rig = [
      fixture(1, { start: 100, count: 16 }),
      fixture(2, { start: 200, count: 8 }),
      fixture(3, { start: 50, count: 4 }),
    ]
    const after = applied(rig, planOptimise(rig).changes)
    expectInvariants(rig, after)
    // Ordered by where they already were: 3 (50), 1 (100), 2 (200).
    expect(after.find((f) => f.id === 3)!.dmx_start_address).toBe(1)
    expect(after.find((f) => f.id === 1)!.dmx_start_address).toBe(5)
    expect(after.find((f) => f.id === 2)!.dmx_start_address).toBe(21)
  })

  it('lowers the highest occupied channel', () => {
    const rig = [fixture(1, { start: 1, count: 16 }), fixture(2, { start: 400, count: 16 })]
    const before = universeMap(dmxMap(rig), 1)!
    const after = universeMap(dmxMap(applied(rig, planOptimise(rig).changes)), 1)!
    expect(before.runs.at(-1)!.start).toBe(416)
    expect(after.runs.at(-1)!.start).toBe(33)
  })

  // Case 12 — honest about doing nothing (FR-042).
  it('plans no change at all for a universe that already has no gaps', () => {
    const rig = [fixture(1, { start: 1, count: 16 }), fixture(2, { start: 17, count: 8 })]
    expect(planOptimise(rig).changes).toEqual([])
    expect(planOptimise(rig).movedFixtureCount).toBe(0)
  })

  // Case 13, the other half.
  it('leaves unaddressed fixtures unaddressed', () => {
    const rig = [fixture(1, { start: 100, count: 16 }), fixture(2, { start: null, count: 8 })]
    const plan = planOptimise(rig)
    expect(plan.changes.map((change) => change.fixture_id)).toEqual([1])
    expect(applied(rig, plan.changes)[1].dmx_start_address).toBeUndefined()
  })

  it('keeps a shared group shared while compacting around it', () => {
    const rig = [
      fixture(1, { start: 100, count: 7 }),
      fixture(2, { start: 100, count: 7 }),
      fixture(3, { start: 300, count: 16 }),
    ]
    const after = applied(rig, planOptimise(rig).changes)
    expectInvariants(rig, after)
    expect(after.map((f) => f.dmx_start_address)).toEqual([1, 1, 8])
  })

  it('pulls an out-of-bounds span back inside the universe', () => {
    const rig = [fixture(1, { start: 1, count: 16 }), fixture(2, { start: 505, count: 16 })]
    const after = applied(rig, planOptimise(rig).changes)
    expect(dmxMap(after).problems).toEqual([])
    expect(after[1].dmx_start_address).toBe(17)
  })

  it('resolves a clash, because every group gets a block of its own', () => {
    const rig = [fixture(1, { start: 49, count: 15 }), fixture(2, { start: 56, count: 15 })]
    expect(dmxMap(rig).problems).toHaveLength(1)
    expect(dmxMap(applied(rig, planOptimise(rig).changes)).problems).toEqual([])
  })
})

describe('planMakeRoom', () => {
  // Case 14 — the ripple stops, which is the whole difference from a bulk shift.
  it('stops at the first group that already clears, preserving a gap beyond it', () => {
    const rig = [
      fixture(1, { start: 1, count: 16 }),
      fixture(2, { start: 17, count: 16 }),
      fixture(3, { start: 100, count: 16 }),
    ]
    const plan = planMakeRoom(rig, { universe: 1, start: 17, count: 16 })
    expect(plan.possible).toBe(true)
    expect(plan.changes).toEqual([{ fixture_id: 2, dmx_universe: 1, dmx_start_address: 33 }])

    const after = applied(rig, plan.changes)
    expect(after.find((f) => f.id === 3)!.dmx_start_address).toBe(100)
    expectInvariants(rig, after)
  })

  // Case 15 — nothing below the insertion point moves.
  it('never moves a fixture below the insertion point', () => {
    const rig = [fixture(1, { start: 1, count: 16 }), fixture(2, { start: 100, count: 16 })]
    const plan = planMakeRoom(rig, { universe: 1, start: 100, count: 16 })
    expect(plan.changes.map((change) => change.fixture_id)).toEqual([2])
  })

  it('moves a group that starts below the insertion but runs into it', () => {
    const rig = [fixture(1, { start: 45, count: 16 })] // 45–60, and we want 49
    const plan = planMakeRoom(rig, { universe: 1, start: 49, count: 16 })
    expect(plan.changes).toEqual([{ fixture_id: 1, dmx_universe: 1, dmx_start_address: 65 }])
  })

  // Case 16 — impossible is reported, not half-done.
  it('returns no changes at all when the ripple would run past 512', () => {
    const rig = [fixture(1, { start: 500, count: 8 })]
    const plan = planMakeRoom(rig, { universe: 1, start: 500, count: 8 })
    expect(plan).toEqual({ changes: [], movedFixtureCount: 0, possible: false })
  })

  // Case 17 — a fixture is not its own obstacle.
  it('excludes the fixture being edited from its own collision', () => {
    const rig = [fixture(1, { start: 49, count: 16 }), fixture(2, { start: 100, count: 16 })]
    const plan = planMakeRoom(rig, { universe: 1, start: 49, count: 16, excludeFixtureId: 1 })
    expect(plan.changes).toEqual([])
  })

  it('moves a shared group whole and leaves it sharing', () => {
    const rig = [
      fixture(1, { start: 20, count: 7 }),
      fixture(2, { start: 20, count: 7 }),
      fixture(3, { start: 200, count: 7 }),
    ]
    const plan = planMakeRoom(rig, { universe: 1, start: 20, count: 16 })
    const after = applied(rig, plan.changes)
    expectInvariants(rig, after)
    expect(after[0].dmx_start_address).toBe(36)
    expect(after[1].dmx_start_address).toBe(36)
    expect(plan.movedFixtureCount).toBe(2)
  })

  it('plans nothing for a universe no fixture is in yet', () => {
    const rig = [fixture(1, { universe: 1, start: 1 })]
    expect(planMakeRoom(rig, { universe: 5, start: 1, count: 16 })).toEqual({
      changes: [],
      movedFixtureCount: 0,
      possible: true,
    })
  })

  it('fills a universe exactly to its last channel without calling it impossible', () => {
    const rig = [fixture(1, { start: 1, count: UNIVERSE_SIZE - 16 })]
    const plan = planMakeRoom(rig, { universe: 1, start: 1, count: 16 })
    expect(plan.possible).toBe(true)
    expect(applied(rig, plan.changes)[0].dmx_start_address).toBe(17)
    expect(dmxMap(applied(rig, plan.changes)).problems).toEqual([])
  })
})
