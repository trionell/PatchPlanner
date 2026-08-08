import { describe, expect, it } from 'vitest'
import type { Console, InputCable, StageMulti, Stagebox } from '../types'
import { boxUsage, cablesPicked, inputPatchStatus, outputPatchStatus, overCapacityLine, patchStatusState, type PatchStatus } from './patchCapacity'

const stagebox: Stagebox = { id: 1, event_id: 1, name: 'SB1', model: '', input_count: 32, output_count: 16, connection_type: 'dante', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 }
const multi: StageMulti = { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 16, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0, show_in_output_graph: true }

function cable(overrides: Partial<InputCable>): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}

const status = (overrides: Partial<PatchStatus> = {}): PatchStatus => ({
  rowCount: 16,
  consoleLabels: [],
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

/**
 * The two assemblies extracted from `InputSheet` and `OutputSheet` at their second
 * caller (research.md R6). The wording is what moved, so the wording is what is pinned:
 * a phone strip and a desktop strip stating the same patch differently is the drift the
 * extraction exists to prevent.
 */
describe('inputPatchStatus / outputPatchStatus', () => {
  const desk = { id: 1, event_id: 1, name: 'SD10', input_count: 96, output_count: 48 } as unknown as Console

  it('words an input gap the way the strip has always worded it', () => {
    const status = inputPatchStatus({
      channels: [{ console_id: 1 }, { console_id: 1 }],
      gaps: [{ channel_number: 16, channel_name: 'Playback L/R' }],
      consoles: [desk],
      stageboxes: [],
      stageMultis: [],
      cables: [],
    })
    expect(status.gaps).toEqual(['Ch 16 Playback L/R has no source'])
    expect(status.rowCount).toBe(2)
    expect(status.consoleLabels).toEqual(['SD10 2/96 ch'])
  })

  it('collapses the double space an unnamed channel used to leave', () => {
    const status = inputPatchStatus({
      channels: [{}],
      gaps: [{ channel_number: 4 }],
      consoles: [],
      stageboxes: [],
      stageMultis: [],
      cables: [],
    })
    expect(status.gaps).toEqual(['Ch 4 has no source'])
  })

  it('words an output gap with its own noun', () => {
    const status = outputPatchStatus({
      outputs: [{ console_id: 1 }],
      gaps: [{ output_number: 3, output_name: 'Wedge 2' }],
      consoles: [desk],
      stageboxes: [],
      stageMultis: [],
      cables: [],
    })
    expect(status.gaps).toEqual(['Out 3 Wedge 2 is not patched'])
    expect(status.consoleLabels).toEqual(['SD10 1/48 ou'])
  })

  it('reports a desk the patch has outgrown', () => {
    const small = { ...desk, input_count: 1 }
    const status = inputPatchStatus({
      channels: [{ console_id: 1 }, { console_id: 1 }],
      gaps: [],
      consoles: [small],
      stageboxes: [],
      stageMultis: [],
      cables: [],
    })
    expect(status.overCapacity).toHaveLength(1)
    expect(patchStatusState(status)).toBe('over')
  })
})
