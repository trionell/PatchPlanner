import { describe, expect, it } from 'vitest'
import type { InputCable, StageMulti, Stagebox } from '../types'
import { boxUsage, cablesPicked, overCapacityLine, patchStatusState, type PatchStatus } from './patchCapacity'

const stagebox: Stagebox = { id: 1, event_id: 1, name: 'SB1', model: '', input_count: 32, output_count: 16, connection_type: 'dante', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 }
const multi: StageMulti = { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 16, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 }

function cable(overrides: Partial<InputCable>): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}

const status = (overrides: Partial<PatchStatus> = {}): PatchStatus => ({
  rowCount: 16,
  boxes: [],
  cablesPicked: 0,
  gaps: [],
  overCapacity: [],
  ...overrides,
})

describe('boxUsage', () => {
  it('counts a pass-through jack once, not once per side', () => {
    const cables = [
      cable({ id: 1, to_kind: 'stagebox', to_id: 1, to_port: 2 }),
      cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'channel', to_id: 1 }),
    ]
    expect(boxUsage([stagebox], [], cables)).toEqual([{ name: 'SB1', used: 1, declared: 16 }])
  })

  it('counts distinct jacks across both boxes', () => {
    const cables = [
      cable({ id: 1, to_kind: 'stagebox', to_id: 1, to_port: 0 }),
      cable({ id: 2, to_kind: 'stagebox', to_id: 1, to_port: 1 }),
      cable({ id: 3, to_kind: 'stage_multi', to_id: 5, to_port: 7 }),
    ]
    expect(boxUsage([stagebox], [multi], cables)).toEqual([
      { name: 'SB1', used: 2, declared: 16 },
      { name: 'Multi A', used: 1, declared: 16 },
    ])
  })
})

describe('cablesPicked', () => {
  it('counts only cables with a catalog item, so network hops never inflate it', () => {
    const cables = [cable({ id: 1, cable_item_id: 7 }), cable({ id: 2 }), cable({ id: 3, cable_item_id: 9 })]
    expect(cablesPicked(cables)).toBe(2)
  })
})

describe('overCapacityLine', () => {
  it('states the shortfall when the patch outgrows the desk', () => {
    expect(overCapacityLine('CL5', 40, 32, 'channel')).toBe('CL5 takes 32 — 8 channels have nowhere to land')
  })

  it('reads correctly for a shortfall of one', () => {
    expect(overCapacityLine('CL5', 33, 32, 'channel')).toBe('CL5 takes 32 — 1 channel has nowhere to land')
  })

  it('stays silent when the count is undeclared', () => {
    expect(overCapacityLine('Console', 40, 0, 'channel')).toBeUndefined()
  })

  it('stays silent when the patch fits exactly', () => {
    expect(overCapacityLine('SD10', 96, 96, 'channel')).toBeUndefined()
  })
})

describe('patchStatusState', () => {
  it('is complete with no gaps and no overflow', () => {
    expect(patchStatusState(status())).toBe('complete')
  })

  it('reports gaps when a row is missing a link', () => {
    expect(patchStatusState(status({ gaps: ['Ch 16 Playback L/R has no source'] }))).toBe('gaps')
  })

  it('lets over-capacity outrank gaps, since the fix is in a different place', () => {
    expect(patchStatusState(status({ gaps: ['Ch 16 has no source'], overCapacity: ['CL5 takes 32 — 8 channels have nowhere to land'] }))).toBe('over')
  })
})
