import { describe, expect, it } from 'vitest'
import type { AudioPatchOutput, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'
import { buildOutputChannelFlow, buildOutputChannelFlows, type OutputFlowContext } from './signalFlow'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB Stage L', model: '', input_count: 16, output_count: 8, connection_type: 'analog', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]

function output(overrides: Partial<AudioPatchOutput>): AudioPatchOutput {
  return { id: 1, event_id: 1, output_number: 1, output_name: 'Main', output_type: 'foh', width: 'mono', ...overrides }
}

function device(overrides: Partial<OutputDevice>): OutputDevice {
  return {
    id: 1, event_id: 1, name: 'Device', input_port_count: 0, output_port_count: 0, link_port_count: 0, position_x: 0, position_y: 0,
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

  it('continues a path through a destination device\'s link-out ports, daisy-chaining sub -> sub -> top', () => {
    const sub1 = device({ id: 20, name: 'Sub 1', input_port_count: 1, link_port_count: 1 })
    const sub2 = device({ id: 21, name: 'Sub 2', input_port_count: 1, link_port_count: 1 })
    const top = device({ id: 22, name: 'Top', input_port_count: 1 })
    const cables = [
      cable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 20, to_port: 0 }),
      cable({ id: 2, from_kind: 'device_link', from_id: 20, from_port: 0, to_kind: 'device', to_id: 21, to_port: 0, cable_item_id: 401 }),
      cable({ id: 3, from_kind: 'device_link', from_id: 21, from_port: 0, to_kind: 'device', to_id: 22, to_port: 0 }),
    ]
    const flow = buildOutputChannelFlow(output({}), outputContext([sub1, sub2, top], cables))
    expect(flow.paths).toHaveLength(1)
    expect(flow.paths[0].hops).toEqual([
      { label: 'Sub 1 ch 1', kind: 'device', missing: false },
      { label: 'Speakon Cable — 10m', kind: 'cable', missing: false },
      { label: 'Sub 2 ch 1', kind: 'device', missing: false },
      { label: 'Top ch 1', kind: 'device', missing: false },
    ])
    expect(flow.hasGap).toBe(false)
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
