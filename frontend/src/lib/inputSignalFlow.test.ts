import { describe, expect, it } from 'vitest'
import type { InputCable, InputChannel, InputDevice, InputSource, StageMulti, Stagebox } from '../types'
import { buildInputChannelFlow, buildInputChannelFlows, type InputFlowContext } from './inputSignalFlow'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB Stage L', model: '', input_count: 16, output_count: 8, connection_type: 'analog', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]

function channel(overrides: Partial<InputChannel>): InputChannel {
  return { id: 1, event_id: 1, channel_number: 1, channel_name: 'Vocal', width: 'mono', mixer_behavior: 'stereo_channel', ...overrides }
}
function source(overrides: Partial<InputSource>): InputSource {
  return { id: 1, event_id: 1, name: 'Shure SM58', kind: 'mic', connector_type: 'xlr', phantom_power: true, width: 'mono', position_x: 0, position_y: 0, ...overrides }
}
function device(overrides: Partial<InputDevice>): InputDevice {
  return { id: 1, event_id: 1, name: 'DI', input_port_count: 1, output_port_count: 1, position_x: 0, position_y: 0, ...overrides }
}
function cable(overrides: Partial<InputCable>): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}

function inputContext(sources: InputSource[], devices: InputDevice[], cables: InputCable[]): InputFlowContext {
  return {
    sources,
    channels: [],
    devices,
    stageboxes,
    stageMultis,
    cables,
    itemLabelById: new Map([[7, 'Mikrofonkabel — 4m'], [201, 'Linekabel Tele-tele — 2m']]),
  }
}

describe('buildInputChannelFlow', () => {
  it('builds a direct source-to-channel path with no gap', () => {
    const flow = buildInputChannelFlow(channel({}), inputContext([source({})], [], [cable({ cable_item_id: 7 })]))
    expect(flow.paths).toHaveLength(1)
    expect(flow.paths[0].hops).toEqual([{ label: 'Shure SM58 — Mikrofonkabel — 4m', kind: 'source', missing: false }])
    expect(flow.paths[0].sideLabel).toBeUndefined()
    expect(flow.paths[0].sourceName).toBe('Shure SM58')
    expect(flow.hasGap).toBe(false)
  })

  it('flags a channel with nothing feeding it as a gap', () => {
    const flow = buildInputChannelFlow(channel({}), inputContext([], [], []))
    expect(flow.paths[0].hops).toEqual([])
    expect(flow.paths[0].sourceName).toBeUndefined()
    expect(flow.hasGap).toBe(true)
  })

  it('walks backward through a Stagebox jack, showing the cableless console hop as "built-in"', () => {
    const cables = [
      cable({ id: 1, from_kind: 'source', from_id: 1, to_kind: 'stagebox', to_id: 1, to_port: 11, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 11, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const flow = buildInputChannelFlow(channel({}), inputContext([source({})], [], cables))
    expect(flow.paths[0].hops).toEqual([
      { label: 'Shure SM58 — Mikrofonkabel — 4m', kind: 'source', missing: false },
      { label: 'SB Stage L — built-in', kind: 'stagebox', missing: false },
    ])
    expect(flow.hasGap).toBe(false)
  })

  it('walks backward through a Stage Multi jack the same way', () => {
    const cables = [
      cable({ id: 1, from_kind: 'source', from_id: 1, to_kind: 'stage_multi', to_id: 5, to_port: 3, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'stage_multi', from_id: 5, from_port: 3, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const flow = buildInputChannelFlow(channel({}), inputContext([source({})], [], cables))
    expect(flow.paths[0].hops.map((h) => h.label)).toEqual(['Shure SM58 — Mikrofonkabel — 4m', 'Multi A — built-in'])
    expect(flow.hasGap).toBe(false)
  })

  it('walks backward through a DI Device between the Source and the Channel', () => {
    const cables = [
      cable({ id: 1, from_kind: 'source', from_id: 1, to_kind: 'device', to_id: 1, to_port: 0, cable_item_id: 201 }),
      cable({ id: 2, from_kind: 'device', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const flow = buildInputChannelFlow(
      channel({}),
      inputContext([source({ name: 'Bass Direct Out', kind: 'line', phantom_power: false })], [device({ name: 'DI (Bass)' })], cables),
    )
    expect(flow.paths[0].hops).toEqual([
      { label: 'Bass Direct Out — Linekabel Tele-tele — 2m', kind: 'source', missing: false },
      { label: 'DI (Bass)', kind: 'device', missing: false },
    ])
    expect(flow.hasGap).toBe(false)
  })

  it('resolves both sides of a stereo DI through a shared 2-in/2-out Device by matching port index', () => {
    const stereoDI = device({ id: 2, name: 'Stereo DI', input_port_count: 2, output_port_count: 2 })
    const sourceL = source({ id: 1, name: 'Playback L', kind: 'line', phantom_power: false })
    const sourceR = source({ id: 2, name: 'Playback R', kind: 'line', phantom_power: false })
    const cables = [
      cable({ id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'device', to_id: 2, to_port: 0 }),
      cable({ id: 2, from_kind: 'source', from_id: 2, from_port: 0, to_kind: 'device', to_id: 2, to_port: 1 }),
      cable({ id: 3, from_kind: 'device', from_id: 2, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
      cable({ id: 4, from_kind: 'device', from_id: 2, from_port: 1, to_kind: 'channel', to_id: 2, to_port: 0 }),
    ]
    const flowL = buildInputChannelFlow(channel({ id: 1 }), inputContext([sourceL, sourceR], [stereoDI], cables))
    const flowR = buildInputChannelFlow(channel({ id: 2 }), inputContext([sourceL, sourceR], [stereoDI], cables))
    expect(flowL.paths[0].hops.map((h) => h.label)).toEqual(['Playback L', 'Stereo DI'])
    expect(flowR.paths[0].hops.map((h) => h.label)).toEqual(['Playback R', 'Stereo DI'])
  })

  it('resolves a double-patched Source feeding two Channels independently', () => {
    const cables = [
      cable({ id: 1, from_kind: 'source', from_id: 1, to_kind: 'channel', to_id: 1, to_port: 0 }),
      cable({ id: 2, from_kind: 'source', from_id: 1, to_kind: 'channel', to_id: 2, to_port: 0 }),
    ]
    const ctx = inputContext([source({ name: 'Talkback Mic' })], [], cables)
    const flowA = buildInputChannelFlow(channel({ id: 1 }), ctx)
    const flowB = buildInputChannelFlow(channel({ id: 2 }), ctx)
    expect(flowA.paths[0].hops.map((h) => h.label)).toEqual(['Talkback Mic'])
    expect(flowB.paths[0].hops.map((h) => h.label)).toEqual(['Talkback Mic'])
    expect(flowA.hasGap).toBe(false)
    expect(flowB.hasGap).toBe(false)
  })

  it('traces a single stereo Channel\'s two independent ports (Slice 12 follow-up fix)', () => {
    const sourceL = source({ id: 1, name: 'OH L' })
    const sourceR = source({ id: 2, name: 'OH R' })
    const cables = [
      cable({ id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
      cable({ id: 2, from_kind: 'source', from_id: 2, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 1 }),
    ]
    const flow = buildInputChannelFlow(channel({ width: 'stereo', channel_name: 'OH' }), inputContext([sourceL, sourceR], [], cables))
    expect(flow.paths).toHaveLength(2)
    expect(flow.paths[0]).toEqual({ sideLabel: 'OH L', hops: [{ label: 'OH L', kind: 'source', missing: false }], sourceName: 'OH L' })
    expect(flow.paths[1]).toEqual({ sideLabel: 'OH R', hops: [{ label: 'OH R', kind: 'source', missing: false }], sourceName: 'OH R' })
    expect(flow.hasGap).toBe(false)
  })

  it('flags a stereo Channel as a gap when only one of its two ports is fed', () => {
    const cables = [cable({ id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 })]
    const flow = buildInputChannelFlow(channel({ width: 'stereo' }), inputContext([source({})], [], cables))
    expect(flow.paths[0].hops).not.toEqual([])
    expect(flow.paths[1].hops).toEqual([])
    expect(flow.hasGap).toBe(true)
  })
})

describe('buildInputChannelFlows', () => {
  it('sorts by channel number and maps every channel', () => {
    const flows = buildInputChannelFlows(
      [channel({ id: 2, channel_number: 12 }), channel({ id: 1, channel_number: 3 })],
      inputContext([], [], []),
    )
    expect(flows.map((flow) => flow.channelNumber)).toEqual([3, 12])
  })
})
