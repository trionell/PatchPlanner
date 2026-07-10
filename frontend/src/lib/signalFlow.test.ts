import { describe, expect, it } from 'vitest'
import type { AudioPatchInput, AudioPatchOutput, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'
import { buildChannelFlow, buildChannelFlows, buildOutputChannelFlow, buildOutputChannelFlows, type FlowContext, type OutputFlowContext } from './signalFlow'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB Stage L', model: '', input_count: 16, output_count: 8, connection_type: 'analog', position_x: 0, position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting', position_x: 0, position_y: 0 },
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

function output(overrides: Partial<AudioPatchOutput>): AudioPatchOutput {
  return { id: 1, event_id: 1, output_number: 1, output_name: 'Main', output_type: 'foh', width: 'mono', ...overrides }
}

function device(overrides: Partial<OutputDevice>): OutputDevice {
  return {
    id: 1, event_id: 1, name: 'Device', input_port_count: 0, output_port_count: 0, position_x: 0, position_y: 0,
    ...overrides,
  }
}

function cable(overrides: Partial<OutputCable>): OutputCable {
  return {
    id: 1, event_id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 1, to_port: 0,
    ...overrides,
  }
}

function outputContext(devices: OutputDevice[], cables: OutputCable[]): OutputFlowContext {
  return {
    stageboxes,
    stageMultis,
    devices,
    cables,
    itemLabelById: new Map([[77, 'Behringer P2'], [401, 'Speakon Cable — 10m'], [402, 'Speakon Cable — 5m']]),
  }
}

describe('buildOutputChannelFlow', () => {
  it('traces a multi-hop path through two devices, in order, with device and cable labels', () => {
    const amp = device({ id: 9, name: 'Amp', input_port_count: 1, output_port_count: 1 })
    const speaker = device({ id: 10, name: 'Speaker', input_port_count: 1 })
    const cables = [
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 9, to_port: 0, cable_item_id: 401 }),
      cable({ id: 2, from_kind: 'device', from_id: 9, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({}), outputContext([amp, speaker], cables))
    expect(flow.paths).toHaveLength(1)
    expect(flow.paths[0].hops).toEqual([
      { label: 'Speakon Cable — 10m', kind: 'cable', missing: false },
      { label: 'Amp ch 1', kind: 'device', missing: false },
      { label: 'Speaker ch 1', kind: 'device', missing: false },
    ])
    expect(flow.hasGap).toBe(false)
  })

  it('renders a stage-multi hand-off in the middle with no gap for its (always cable-less) input side', () => {
    const speaker = device({ id: 10, name: 'Speaker', input_port_count: 1 })
    const cables = [
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'stage_multi', to_id: 5, to_port: 0 }),
      cable({ id: 2, from_kind: 'stage_multi', from_id: 5, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({}), outputContext([speaker], cables))
    expect(flow.paths[0].hops).toEqual([
      { label: 'Multi A ch 1', kind: 'multi', missing: false },
      { label: 'Speaker ch 1', kind: 'device', missing: false },
    ])
    expect(flow.hasGap).toBe(false)
  })

  it('flags a genuinely unconnected declared input port as a gap', () => {
    // A distro device declares 2 inputs but only 1 is ever wired.
    const distro = device({ id: 11, name: 'Distro', input_port_count: 2 })
    const cables = [cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 11, to_port: 0 })]
    const flow = buildOutputChannelFlow(output({}), outputContext([distro], cables))
    expect(flow.hasGap).toBe(true)
  })

  it('treats an unconnected mixer port as direct, not a gap', () => {
    const flow = buildOutputChannelFlow(output({}), outputContext([], []))
    expect(flow.paths).toEqual([{ sideLabel: undefined, hops: [{ label: 'Direct to output', kind: 'direct', missing: false }] }])
    expect(flow.hasGap).toBe(false)
  })

  it('traces a stereo channel\'s two independent paths', () => {
    const speakerL = device({ id: 10, name: 'Speaker L', input_port_count: 1 })
    const speakerR = device({ id: 11, name: 'Speaker R', input_port_count: 1 })
    const cables = [
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0 }),
      cable({ id: 2, from_kind: 'mixer', from_id: 1, from_port: 1, to_kind: 'device', to_id: 11, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({ width: 'stereo' }), outputContext([speakerL, speakerR], cables))
    expect(flow.paths).toHaveLength(2)
    expect(flow.paths[0]).toEqual({ sideLabel: 'Main L', hops: [{ label: 'Speaker L ch 1', kind: 'device', missing: false }] })
    expect(flow.paths[1]).toEqual({ sideLabel: 'Main R', hops: [{ label: 'Speaker R ch 1', kind: 'device', missing: false }] })
  })

  it('branches into multiple paths when a device fans out to more than one destination', () => {
    const distro = device({ id: 9, name: 'Distro', input_port_count: 1, output_port_count: 2 })
    const speakerL = device({ id: 10, name: 'Speaker L', input_port_count: 1 })
    const speakerR = device({ id: 11, name: 'Speaker R', input_port_count: 1 })
    const cables = [
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 9, to_port: 0 }),
      cable({ id: 2, from_kind: 'device', from_id: 9, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0 }),
      cable({ id: 3, from_kind: 'device', from_id: 9, from_port: 1, to_kind: 'device', to_id: 11, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({}), outputContext([distro, speakerL, speakerR], cables))
    expect(flow.paths).toHaveLength(2)
    expect(flow.paths.map((p) => p.hops.at(-1)?.label).sort()).toEqual(['Speaker L ch 1', 'Speaker R ch 1'])
  })

  it('treats a stagebox as a straight pass-through: only the matching output channel continues, not the box\'s other unrelated channels', () => {
    const speaker = device({ id: 10, name: 'Speaker', input_port_count: 1 })
    const otherDest = device({ id: 11, name: 'Unrelated dest', input_port_count: 1 })
    const cables = [
      // This channel: mixer -> stagebox ch 3 (index 2) -> speaker.
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 2 }),
      cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'device', to_id: 10, to_port: 0 }),
      // A totally different channel also passing through the same
      // stagebox, on a different jack — must not leak into this path.
      cable({ id: 3, from_kind: 'stagebox', from_id: 1, from_port: 5, to_kind: 'device', to_id: 11, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({}), outputContext([speaker, otherDest], cables))
    expect(flow.paths).toHaveLength(1)
    expect(flow.paths[0].hops).toEqual([
      { label: 'SB Stage L ch 3', kind: 'stagebox', missing: false },
      { label: 'Speaker ch 1', kind: 'device', missing: false },
    ])
    expect(flow.hasGap).toBe(false)
  })

  it('a mixer port fans out to more than one physical destination at once (local out and a stagebox jack)', () => {
    const localSpeaker = device({ id: 10, name: 'Local speaker', input_port_count: 1 })
    const monitor = device({ id: 11, name: 'Monitor', input_port_count: 1 })
    const cables = [
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0 }),
      cable({ id: 2, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 0 }),
      cable({ id: 3, from_kind: 'stagebox', from_id: 1, from_port: 0, to_kind: 'device', to_id: 11, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({}), outputContext([localSpeaker, monitor], cables))
    expect(flow.paths).toHaveLength(2)
    expect(flow.paths.map((p) => p.hops.at(-1)?.label).sort()).toEqual(['Local speaker ch 1', 'Monitor ch 1'])
  })
})

describe('buildOutputChannelFlows', () => {
  it('sorts by output number and maps every output', () => {
    const flows = buildOutputChannelFlows(
      [output({ id: 2, output_number: 3 }), output({ id: 1, output_number: 1 })],
      outputContext([], []),
    )
    expect(flows.map((flow) => flow.outputNumber)).toEqual([1, 3])
  })
})
