import { describe, expect, it } from 'vitest'
import type { AudioPatchInput, AudioPatchOutput, OutputChainHop, StageMulti, Stagebox } from '../types'
import type { HopLabelContext } from './outputChain'
import { buildChannelFlow, buildChannelFlows, buildOutputChainFlow, buildOutputChainFlows, type FlowContext } from './signalFlow'

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

const outputContext: HopLabelContext = {
  stageboxes,
  stageMultis,
  outputDevices: [{ id: 9, event_id: 1, name: 'IEM amp', inventory_item_id: 77 }],
  itemLabelById: new Map([[77, 'Behringer P2'], [401, 'Speakon Cable — 10m']]),
  ownedItemLabelById: new Map([[3, 'House sub']]),
  cableLabel: (value) => (value === 'nl4' ? 'NL4' : value),
}

function output(overrides: Partial<AudioPatchOutput>): AudioPatchOutput {
  return {
    id: 1, event_id: 1, output_number: 1, output_name: 'Main', output_type: 'foh', width: 'mono', chain: [],
    ...overrides,
  }
}

function hop(overrides: Partial<OutputChainHop>): OutputChainHop {
  return { position: 0, hop_kind: 'device', ...overrides }
}

describe('buildOutputChainFlow', () => {
  it('renders one hop per chain entry in order, with device and cable labels', () => {
    const flow = buildOutputChainFlow(
      output({
        chain: [
          hop({ device_source: 'inventory', inventory_item_id: 77, cable_item_id: 401 }),
          hop({ position: 1, hop_kind: 'route', stagebox_id: 1, stagebox_channel: 5 }),
        ],
      }),
      outputContext,
    )
    expect(flow.hops).toHaveLength(2)
    expect(flow.hops[0].device).toEqual({ label: 'Behringer P2', kind: 'device', missing: false })
    expect(flow.hops[0].cable).toEqual({ label: 'Speakon Cable — 10m', kind: 'cable', missing: false })
    expect(flow.hops[1].device).toEqual({ label: 'SB SB Stage L ch 5', kind: 'route', missing: false })
    expect(flow.hasGap).toBe(false)
  })

  it('resolves a shared device hop via the declared device name', () => {
    const flow = buildOutputChainFlow(output({ chain: [hop({ device_source: 'shared', output_device_id: 9 })] }), outputContext)
    expect(flow.hops[0].device).toEqual({ label: 'IEM amp', kind: 'device', missing: false })
  })

  it('resolves an owned-gear device hop', () => {
    const flow = buildOutputChainFlow(output({ chain: [hop({ device_source: 'owned', owned_item_id: 3 })] }), outputContext)
    expect(flow.hops[0].device).toEqual({ label: 'House sub', kind: 'device', missing: false })
  })

  it('flags a device hop with no device picked yet as a gap', () => {
    const flow = buildOutputChainFlow(output({ chain: [hop({})] }), outputContext)
    expect(flow.hops[0].device.missing).toBe(true)
    expect(flow.hasGap).toBe(true)
  })

  it('does not flag a missing cable as a gap', () => {
    const flow = buildOutputChainFlow(output({ chain: [hop({ device_source: 'inventory', inventory_item_id: 77 })] }), outputContext)
    expect(flow.hops[0].cable).toBeUndefined()
    expect(flow.hasGap).toBe(false)
  })

  it('renders legacy cable text when no catalog pick exists', () => {
    const flow = buildOutputChainFlow(
      output({ chain: [hop({ device_source: 'inventory', inventory_item_id: 77, cable_type: 'nl4', cable_length_m: 5 })] }),
      outputContext,
    )
    expect(flow.hops[0].cable).toEqual({ label: 'NL4 5 m', kind: 'cable', missing: false })
  })

  it('renders a route hop\'s independently-patched side B only on a stereo channel', () => {
    const monoFlow = buildOutputChainFlow(
      output({ width: 'mono', chain: [hop({ hop_kind: 'route', stage_multi_id: 5, stage_multi_channel: 1, stage_multi_id_b: 5, stage_multi_channel_b: 2 })] }),
      outputContext,
    )
    expect(monoFlow.hops[0].sideB).toBeUndefined()

    const stereoFlow = buildOutputChainFlow(
      output({ width: 'stereo', chain: [hop({ hop_kind: 'route', stage_multi_id: 5, stage_multi_channel: 1, stage_multi_id_b: 5, stage_multi_channel_b: 2 })] }),
      outputContext,
    )
    expect(stereoFlow.hops[0].sideB).toEqual({ label: 'Multi Multi A ch 2', kind: 'route', missing: false })
  })

  it('flags a route hop with neither stagebox nor stage-multi set', () => {
    const flow = buildOutputChainFlow(output({ chain: [hop({ hop_kind: 'route' })] }), outputContext)
    expect(flow.hops[0].device.missing).toBe(true)
    expect(flow.hasGap).toBe(true)
  })

  it('omits cableB when unset, even on a stereo channel (default doubling, nothing extra to show)', () => {
    const flow = buildOutputChainFlow(
      output({ width: 'stereo', chain: [hop({ device_source: 'inventory', inventory_item_id: 77, cable_item_id: 401 })] }),
      outputContext,
    )
    expect(flow.hops[0].cableB).toBeUndefined()
  })

  it('renders an independently-picked side-B cable only on a stereo channel', () => {
    const monoFlow = buildOutputChainFlow(
      output({ width: 'mono', chain: [hop({ device_source: 'inventory', inventory_item_id: 77, cable_item_id: 401, cable_item_id_b: 402 })] }),
      { ...outputContext, itemLabelById: new Map([...outputContext.itemLabelById, [402, 'Speakon Cable — 5m']]) },
    )
    expect(monoFlow.hops[0].cableB).toBeUndefined()

    const stereoFlow = buildOutputChainFlow(
      output({ width: 'stereo', chain: [hop({ device_source: 'inventory', inventory_item_id: 77, cable_item_id: 401, cable_item_id_b: 402 })] }),
      { ...outputContext, itemLabelById: new Map([...outputContext.itemLabelById, [402, 'Speakon Cable — 5m']]) },
    )
    expect(stereoFlow.hops[0].cableB).toEqual({ label: 'Speakon Cable — 5m', kind: 'cable', missing: false })
  })
})

describe('buildOutputChainFlows', () => {
  it('sorts by output number and maps every output', () => {
    const flows = buildOutputChainFlows(
      [output({ id: 2, output_number: 3 }), output({ id: 1, output_number: 1 })],
      outputContext,
    )
    expect(flows.map((flow) => flow.outputNumber)).toEqual([1, 3])
  })
})
