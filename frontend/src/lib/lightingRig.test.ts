import { describe, expect, it } from 'vitest'
import type { LightingFixture } from '../types'
import { duplicateFixtureNumbers, nextFixtureNumber } from './lightingRig'

function fixture(id: number, fixtureNumber?: number): LightingFixture {
  return {
    id, rig_id: 1, fixture_number: fixtureNumber, position_index: id,
    power_connection: 'grid', power_connector_in: 'schuko',
    dmx_universe: 1, dmx_channel_count: 16,
  }
}

describe('duplicateFixtureNumbers', () => {
  it('returns numbers used by more than one fixture', () => {
    const duplicates = duplicateFixtureNumbers([fixture(1, 101), fixture(2, 101), fixture(3, 102)])
    expect(duplicates).toEqual(new Set([101]))
  })

  it('never counts unset numbers', () => {
    expect(duplicateFixtureNumbers([fixture(1), fixture(2), fixture(3, 101)])).toEqual(new Set())
  })

  it('is empty for all-unique numbering', () => {
    expect(duplicateFixtureNumbers([fixture(1, 101), fixture(2, 102)])).toEqual(new Set())
  })
})

describe('nextFixtureNumber', () => {
  it('suggests one past the highest number in use', () => {
    expect(nextFixtureNumber([fixture(1, 101), fixture(2, 108), fixture(3)])).toBe(109)
  })

  it('suggests 101 for an unnumbered rig', () => {
    expect(nextFixtureNumber([fixture(1), fixture(2)])).toBe(101)
  })
})
