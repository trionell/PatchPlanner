import { describe, expect, it } from 'vitest'
import type { LightingFixture } from '../types'
import {
  UNIVERSE_SIZE,
  dmxMap,
  dmxStatusState,
  firstRunFitting,
  formatSpan,
  groupsInTheWay,
  spanOf,
  universeMap,
} from './dmxMap'

/**
 * The cases in specs/027-lighting-sheet/contracts/dmx-map.md §8, 1–7 and 18.
 * The packing's cases (8–17) are in dmxPlan.test.ts.
 */

interface Options {
  universe?: number
  start?: number | null
  count?: number
  number?: number
  position?: number
}

function fixture(id: number, options: Options = {}): LightingFixture {
  return {
    id,
    rig_id: 1,
    fixture_number: options.number,
    position_index: options.position ?? id,
    power_connection: 'grid',
    power_connector_in: 'schuko',
    dmx_universe: options.universe ?? 1,
    dmx_start_address: options.start === null ? undefined : (options.start ?? 1),
    dmx_channel_count: options.count ?? 16,
  }
}

describe('spanOf', () => {
  it('gives an unaddressed fixture no span at all, rather than one at address 0', () => {
    expect(spanOf(fixture(1, { start: null }))).toBeNull()
  })

  it('does not clamp end to 512 — clamping would hide the condition the map exists to report', () => {
    expect(spanOf(fixture(1, { start: 505, count: 16 }))?.end).toBe(520)
  })

  it('normalises an impossible universe and channel count', () => {
    const span = spanOf({ ...fixture(1), dmx_universe: 0, dmx_channel_count: 0 })
    expect(span).toEqual({ universe: 1, start: 1, count: 1, end: 1 })
  })
})

describe('the four conditions', () => {
  // Case 1 — one universe holding all four at once (SC-006).
  const mixed = [
    fixture(1, { start: 1, count: 16 }), //                     plain
    fixture(2, { start: 49, count: 15 }), //                    clashes with 3
    fixture(3, { start: 56, count: 15 }), //                    clashes with 2
    fixture(4, { start: 200, count: 7 }), //  shared with 5
    fixture(5, { start: 200, count: 7 }), //  shared with 4
    fixture(6, { start: 505, count: 16 }), //                   out of bounds
    fixture(7, { start: null }), //                             unaddressed
  ]

  it('reports all four independently, none masking another', () => {
    const map = dmxMap(mixed)
    expect(map.sharedGroupCount).toBe(1)
    expect(map.unaddressed).toEqual([7])
    expect(map.problems.filter((problem) => problem.kind === 'clash')).toHaveLength(1)
    expect(map.problems.filter((problem) => problem.kind === 'out-of-bounds')).toHaveLength(1)
  })

  it('marks each fixture with its own condition and no other', () => {
    const { byFixture } = dmxMap(mixed)
    expect(byFixture.get(1)).toMatchObject({ shared: false, outOfBounds: false, clashWith: undefined })
    expect(byFixture.get(2)?.clashWith?.start).toBe(56)
    expect(byFixture.get(4)).toMatchObject({ shared: true, outOfBounds: false, clashWith: undefined })
    expect(byFixture.get(6)?.outOfBounds).toBe(true)
    expect(byFixture.get(7)?.group).toBeUndefined()
  })

  // Case 2 — twenty on one address (SC-005).
  it('treats twenty fixtures on one address as one group taking its channels once', () => {
    const pars = Array.from({ length: 20 }, (_, index) => fixture(index + 1, { universe: 3, start: 1, count: 7 }))
    const map = dmxMap(pars)
    const universe = universeMap(map, 3)!
    expect(universe.groups).toHaveLength(1)
    expect(universe.groups[0].fixtureIds).toHaveLength(20)
    expect(universe.occupied).toBe(7)
    expect(universe.problems).toEqual([])
    expect(map.problems).toEqual([])
  })

  // Case 3 — the strict reading.
  it('calls the same start with a different channel count a clash, not sharing', () => {
    const map = dmxMap([fixture(1, { start: 49, count: 16 }), fixture(2, { start: 49, count: 4 })])
    expect(map.sharedGroupCount).toBe(0)
    expect(map.problems).toHaveLength(1)
    expect(map.problems[0].kind).toBe('clash')
  })

  // Case 4 — sharing and clashing are not mutually exclusive.
  it('keeps a fixture shared while its group clashes with a third', () => {
    const map = dmxMap([
      fixture(1, { start: 1, count: 16 }),
      fixture(2, { start: 1, count: 16 }),
      fixture(3, { start: 8, count: 16 }),
    ])
    expect(map.sharedGroupCount).toBe(1)
    expect(map.byFixture.get(1)).toMatchObject({ shared: true })
    expect(map.byFixture.get(2)).toMatchObject({ shared: true })
    expect(map.byFixture.get(1)?.clashWith?.start).toBe(8)
    // One report for the pair of groups, not one per fixture and not one per channel.
    expect(map.problems).toHaveLength(1)
  })

  // Case 5 — out of bounds still contributes its in-range channels.
  it('counts only the channels an over-running span has inside the universe', () => {
    const map = dmxMap([fixture(1, { start: 505, count: 16 })])
    const universe = universeMap(map, 1)!
    expect(universe.occupied).toBe(8)
    expect(universe.problems[0].kind).toBe('out-of-bounds')
  })

  // Case 6 — the last channel is legal.
  it('allows a single-channel fixture at 512', () => {
    const map = dmxMap([fixture(1, { start: 512, count: 1 })])
    expect(map.problems).toEqual([])
    expect(universeMap(map, 1)!.occupied).toBe(1)
  })
})

describe('occupancy', () => {
  it('counts a clash once per channel, not once per fixture', () => {
    const map = dmxMap([fixture(1, { start: 49, count: 15 }), fixture(2, { start: 56, count: 15 })])
    // 49–63 ∪ 56–70 is 49–70: twenty-two channels, where the sum says thirty.
    expect(universeMap(map, 1)!.occupied).toBe(22)
  })

  it('reports free channels as the true total including interior gaps', () => {
    const map = dmxMap([fixture(1, { start: 1, count: 16 }), fixture(2, { start: 100, count: 16 })])
    const universe = universeMap(map, 1)!
    expect(universe.occupied).toBe(32)
    expect(universe.free).toBe(UNIVERSE_SIZE - 32)
    expect(universe.runs).toEqual([
      { start: 17, length: 83 },
      { start: 116, length: UNIVERSE_SIZE - 115 },
    ])
  })

  // Case 7 — the number that looks reassuring answers the wrong question.
  it('separates free channels from the largest free run', () => {
    // Four-channel gaps between five-channel fixtures: lots free, room for nothing.
    const fixtures = Array.from({ length: 20 }, (_, index) =>
      fixture(index + 1, { start: 1 + index * 9, count: 5 }),
    )
    const universe = universeMap(dmxMap(fixtures), 1)!
    expect(universe.free).toBeGreaterThan(400)
    // The last fixture occupies 172–176, so everything below 177 is an interior gap.
    const interiorRuns = universe.runs.filter((run) => run.start < 177)
    expect(interiorRuns).toHaveLength(19)
    expect(interiorRuns.every((run) => run.length === 4)).toBe(true)
    expect(firstRunFitting(universe, 4)?.start).toBe(6)
    expect(firstRunFitting(universe, 16)?.start).toBe(177)
  })

  it('answers address 1 for a universe nothing has been assigned to yet', () => {
    expect(firstRunFitting(undefined, 16)).toEqual({ start: 1, length: UNIVERSE_SIZE })
  })

  it('draws no gap at all in a universe filled to the last channel', () => {
    const universe = universeMap(dmxMap([fixture(1, { start: 1, count: UNIVERSE_SIZE })]), 1)!
    expect(universe.occupied).toBe(UNIVERSE_SIZE)
    expect(universe.runs).toEqual([])
    expect(universe.largestRun).toBeNull()
    expect(universe.problems).toEqual([])
  })
})

describe('universes', () => {
  it('lists only universes a fixture is assigned to, ascending', () => {
    const map = dmxMap([fixture(1, { universe: 3 }), fixture(2, { universe: 1 }), fixture(3, { universe: 3 })])
    expect(map.universes.map((entry) => entry.universe)).toEqual([1, 3])
  })

  it('counts an unaddressed fixture towards the universe it is assigned to', () => {
    const map = dmxMap([fixture(1, { universe: 2, start: 1 }), fixture(2, { universe: 2, start: null })])
    const universe = universeMap(map, 2)!
    expect(universe.fixtureCount).toBe(2)
    expect(universe.groups).toHaveLength(1)
  })
})

// Case 18 — the degenerate values, which must neither crash nor invent a problem.
describe('degenerate values', () => {
  it('normalises a zero channel count and a zero universe without reporting a problem', () => {
    const odd: LightingFixture = { ...fixture(1), dmx_universe: 0, dmx_channel_count: 0, dmx_start_address: 5 }
    const map = dmxMap([odd])
    expect(map.problems).toEqual([])
    expect(map.universes[0].universe).toBe(1)
    expect(map.universes[0].occupied).toBe(1)
  })

  it('handles an empty rig', () => {
    const map = dmxMap([])
    expect(map).toMatchObject({ fixtureCount: 0, universes: [], unaddressed: [], problems: [], sharedGroupCount: 0 })
  })
})

describe('groupsInTheWay', () => {
  it('finds what a proposed span would touch', () => {
    const map = dmxMap([fixture(1, { start: 49, count: 16 }), fixture(2, { start: 100, count: 16 })])
    expect(groupsInTheWay(map, { universe: 1, start: 60, count: 8 }).map((group) => group.start)).toEqual([49])
  })

  it('never lets a fixture collide with itself', () => {
    const map = dmxMap([fixture(1, { start: 49, count: 16 })])
    expect(groupsInTheWay(map, { universe: 1, start: 49, count: 16 }, 1)).toEqual([])
  })

  it('still reports the rest of a shared group when one member is being moved out of it', () => {
    const map = dmxMap([fixture(1, { start: 1, count: 7 }), fixture(2, { start: 1, count: 7 })])
    const inTheWay = groupsInTheWay(map, { universe: 1, start: 1, count: 7 }, 1)
    expect(inTheWay).toHaveLength(1)
    expect(inTheWay[0].fixtureIds).toEqual([2])
  })
})

describe('formatSpan', () => {
  it('zero-pads so a column of addresses is a column', () => {
    expect(formatSpan(49, 16)).toBe('049–064')
    expect(formatSpan(1, 1)).toBe('001')
  })

  it('says so when there is no address', () => {
    expect(formatSpan(undefined, 16)).toBe('—')
  })
})

describe('dmxStatusState', () => {
  const addressed: LightingFixture = fixture(1, { start: 1, count: 16 })

  it('puts errors ahead of unaddressed fixtures', () => {
    const map = dmxMap([addressed, fixture(2, { start: 8, count: 16 }), fixture(3, { start: null })])
    expect(map.problems.length).toBeGreaterThan(0)
    expect(map.unaddressed.length).toBeGreaterThan(0)
    expect(dmxStatusState(map)).toBe('errors')
  })

  it('reports unaddressed work when there is nothing wrong', () => {
    expect(dmxStatusState(dmxMap([addressed, fixture(2, { start: null })]))).toBe('unaddressed')
  })

  it('is clean when every fixture has an address and none of them collide', () => {
    expect(dmxStatusState(dmxMap([addressed, fixture(2, { start: 17, count: 16 })]))).toBe('clean')
  })

  it('is clean with a shared group, which is not a condition to resolve', () => {
    const shared = [fixture(1, { start: 1, count: 7 }), fixture(2, { start: 1, count: 7 })]
    const map = dmxMap(shared)
    expect(map.sharedGroupCount).toBe(1)
    expect(dmxStatusState(map)).toBe('clean')
  })
})
