import { describe, expect, it } from 'vitest'
import type { AudioPatchInput, StageMulti, Stagebox } from '../types'
import { buildChannelFlow, buildChannelFlows, type FlowContext } from './signalFlow'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB Stage L', model: '', input_count: 16, output_count: 8, connection_type: 'analog' },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting' },
]
const context: FlowContext = {
  stageboxes,
  stageMultis,
  micNameById: new Map([[42, 'Shure SM58']]),
  cableLabelById: new Map([[7, 'Mikrofonkabel — 4m']]),
  cableLabel: (value) => (value === 'xlr' ? 'XLR' : value),
}

function input(overrides: Partial<AudioPatchInput>): AudioPatchInput {
  return {
    id: 1,
    event_id: 1,
    channel_number: 1,
    channel_name: 'Vocal',
    signal_type: 'mic',
    preamp_connector: 'xlr',
    cable_type: 'xlr',
    cable_length_m: 10,
    phantom_power: false,
    width: 'mono',
    mixer_behavior: 'stereo_channel',
    source_cabling: 'two_cables',
    ...overrides,
  }
}

describe('buildChannelFlow', () => {
  it('builds a complete chain with no gaps', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, stagebox_id: 1, stagebox_channel: 12 }), context)
    expect(flow.source).toEqual({ label: 'Shure SM58', kind: 'source', missing: false })
    expect(flow.cable.label).toBe('XLR')
    expect(flow.cable.detail).toBe('10 m')
    expect(flow.path).toEqual({ label: 'SB SB Stage L · ch 12', kind: 'stagebox', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('labels a picked catalog cable and ignores legacy fields', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, cable_item_id: 7, cable_type: undefined, cable_length_m: undefined }), context)
    expect(flow.cable).toEqual({ label: 'Mikrofonkabel — 4m', kind: 'cable', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('falls back to an item reference for an unknown cable item', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, cable_item_id: 99 }), context)
    expect(flow.cable.label).toBe('Item #99')
    expect(flow.cable.missing).toBe(false)
  })

  it('renders an empty cable hop without a gap when no cable is set', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, cable_type: undefined, cable_length_m: undefined }), context)
    expect(flow.cable).toEqual({ label: '—', kind: 'cable', missing: false, detail: undefined })
    expect(flow.hasGap).toBe(false)
  })

  it('flags a missing source', () => {
    const flow = buildChannelFlow(input({ stagebox_id: 1, stagebox_channel: 3 }), context)
    expect(flow.source.missing).toBe(true)
    expect(flow.source.label).toBe('No source picked')
    expect(flow.hasGap).toBe(true)
  })

  it('uses a legacy mic_label as an unflagged source', () => {
    const flow = buildChannelFlow(input({ mic_label: 'Old ribbon mic', stagebox_id: 1, stagebox_channel: 3 }), context)
    expect(flow.source).toEqual({ label: 'Old ribbon mic', kind: 'source', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('treats no routing as direct to console, not a gap', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42 }), context)
    expect(flow.path).toEqual({ label: 'Direct to console', kind: 'direct', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('flags a stagebox chosen without a channel', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, stagebox_id: 1 }), context)
    expect(flow.path.missing).toBe(true)
    expect(flow.path.label).toBe('SB SB Stage L — no channel')
    expect(flow.hasGap).toBe(true)
  })

  it('flags a channel number without a box or multi', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, stagebox_channel: 7 }), context)
    expect(flow.path.missing).toBe(true)
    expect(flow.path.label).toBe('ch 7 — no stagebox picked')
    expect(flow.hasGap).toBe(true)
  })

  it('renders stage multi routing', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, stage_multi_id: 5, stage_multi_channel: 4 }), context)
    expect(flow.path).toEqual({ label: 'Multi Multi A · ch 4', kind: 'multi', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('falls back to an item reference when the inventory name is unknown', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 999 }), context)
    expect(flow.source).toEqual({ label: 'Item #999', kind: 'source', missing: false })
  })

  it('omits pathB and sourceCable on an ordinary mono mic channel', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42 }), context)
    expect(flow.pathB).toBeUndefined()
    expect(flow.sourceCable).toBeUndefined()
    expect(flow.hasGap).toBe(false)
  })

  it('traces a stereo channel\'s independently-patched side B', () => {
    const flow = buildChannelFlow(
      input({ mic_item_id: 42, width: 'stereo', stage_multi_id_b: 5, stage_multi_channel_b: 9 }),
      context,
    )
    expect(flow.pathB).toEqual({ label: 'Multi Multi A · ch 9', kind: 'multi', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('flags an incomplete side-B route the same way as side A', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, width: 'stereo', stagebox_id_b: 1 }), context)
    expect(flow.pathB?.missing).toBe(true)
    expect(flow.pathB?.label).toBe('SB SB Stage L — no channel')
    expect(flow.hasGap).toBe(true)
  })

  it('treats stereo with no side-B routing as direct, not a gap', () => {
    const flow = buildChannelFlow(input({ mic_item_id: 42, width: 'stereo' }), context)
    expect(flow.pathB).toEqual({ label: 'Direct to console', kind: 'direct', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('resolves a DI channel\'s source cable', () => {
    const flow = buildChannelFlow(
      input({ signal_type: 'di', mic_item_id: 110, source_cable_item_id: 201 }),
      { ...context, sourceCableLabelById: new Map([[201, 'Linekabel Tele-tele — 2m']]) },
    )
    expect(flow.sourceCable).toEqual({ label: 'Linekabel Tele-tele — 2m', kind: 'cable', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('flags a DI channel with no source cable picked', () => {
    const flow = buildChannelFlow(input({ signal_type: 'di', mic_item_id: 110 }), context)
    expect(flow.sourceCable).toEqual({ label: 'No source cable picked', kind: 'cable', missing: true })
    expect(flow.hasGap).toBe(true)
  })
})

describe('buildChannelFlows', () => {
  it('sorts by channel number and maps every input', () => {
    const flows = buildChannelFlows(
      [
        input({ id: 2, channel_number: 12, mic_item_id: 42 }),
        input({ id: 1, channel_number: 3, mic_item_id: 42 }),
      ],
      context,
    )
    expect(flows.map((flow) => flow.channelNumber)).toEqual([3, 12])
  })
})
