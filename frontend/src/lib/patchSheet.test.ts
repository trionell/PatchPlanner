import { describe, expect, it } from 'vitest'
import type { AudioPatchOutput, Console, InputCable, InputChannel, InputDevice, InputSource, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'
import { chainSourceNode, inputChainSegments, outputChainSegments, truncateSegments, type ChainSegment } from './patchSheet'
import type { InputFlowContext } from './inputSignalFlow'
import type { OutputFlowContext } from './signalFlow'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB1', model: '', input_count: 32, output_count: 16, connection_type: 'dante', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 16, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0, show_in_output_graph: true },
]
const itemLabelById = new Map([
  [7, 'XLR 10 m — Mikrofonkabel'],
  [90, 'Sennheiser e906 — Instrument mic'],
  [91, 'Neumann KM 184 — Small diaphragm condenser'],
])

function channel(overrides: Partial<InputChannel> = {}): InputChannel {
  return { id: 1, event_id: 1, channel_number: 3, channel_name: 'Snare Top', width: 'mono', mixer_behavior: 'stereo_channel', ...overrides }
}
function source(overrides: Partial<InputSource> = {}): InputSource {
  return { id: 1, event_id: 1, name: 'Snare Top', kind: 'mic', mic_item_id: 90, connector_type: 'xlr', phantom_power: false, width: 'mono', position_x: 0, position_y: 0, ...overrides }
}
function device(overrides: Partial<InputDevice> = {}): InputDevice {
  return { id: 1, event_id: 1, name: 'Radial J48', input_port_count: 1, output_port_count: 1, position_x: 0, position_y: 0, ...overrides }
}
function cable(overrides: Partial<InputCable> = {}): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}
function inputContext(overrides: Partial<InputFlowContext> = {}): InputFlowContext {
  return { sources: [source()], channels: [channel()], devices: [], stageboxes, stageMultis, cables: [], itemLabelById, ...overrides }
}

const labels = (segments: ChainSegment[]) => segments.map((segment) => segment.label)

describe('inputChainSegments', () => {
  it('reads mic → stagebox jack → desk channel in signal order', () => {
    const cables = [
      cable({ id: 1, to_kind: 'stagebox', to_id: 1, to_port: 2, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const model = inputChainSegments(channel(), inputContext({ cables }))
    expect(model.lines).toHaveLength(1)
    expect(labels(model.lines[0].segments)).toEqual(['Sennheiser e906', 'SB1 : 3', 'ch 3'])
    expect(model.hasGap).toBe(false)
  })

  it('makes every hop addressable, so one hop can be repatched alone', () => {
    const cables = [
      cable({ id: 1, to_kind: 'stagebox', to_id: 1, to_port: 2, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const [micHop, jackHop, tail] = inputChainSegments(channel(), inputContext({ cables })).lines[0].segments
    expect(micHop).toMatchObject({ node: { kind: 'source', id: 1, port: 0 }, cableId: 1 })
    expect(jackHop).toMatchObject({ node: { kind: 'stagebox', id: 1, port: 2 }, cableId: 2 })
    // The channel is the row itself, not a hop — nothing to repatch.
    expect(tail.node).toBeUndefined()
  })

  it('keeps a DI box as its own hop, in order, without a port index', () => {
    const cables = [
      cable({ id: 1, to_kind: 'device', to_id: 1, to_port: 0, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'device', from_id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 7, cable_item_id: 7 }),
      cable({ id: 3, from_kind: 'stagebox', from_id: 1, from_port: 7, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const model = inputChainSegments(channel(), inputContext({ cables, devices: [device()] }))
    expect(labels(model.lines[0].segments)).toEqual(['Sennheiser e906', 'Radial J48', 'SB1 : 8', 'ch 3'])
  })

  it('collapses a stereo pair onto one line with a jack range', () => {
    const stereo = channel({ width: 'stereo', channel_number: 6, channel_name: 'OH L/R' })
    const sources = [source({ id: 1, name: 'OH L', mic_item_id: 91 }), source({ id: 2, name: 'OH R', mic_item_id: 91 })]
    const cables = [
      cable({ id: 1, from_id: 1, to_kind: 'stagebox', to_id: 1, to_port: 5, cable_item_id: 7 }),
      cable({ id: 2, from_id: 2, to_kind: 'stagebox', to_id: 1, to_port: 6, cable_item_id: 7 }),
      cable({ id: 3, from_kind: 'stagebox', from_id: 1, from_port: 5, to_kind: 'channel', to_id: 1, to_port: 0 }),
      cable({ id: 4, from_kind: 'stagebox', from_id: 1, from_port: 6, to_kind: 'channel', to_id: 1, to_port: 1 }),
    ]
    const model = inputChainSegments(stereo, inputContext({ sources, channels: [stereo], cables }))
    expect(model.lines).toHaveLength(1)
    expect(labels(model.lines[0].segments)).toEqual(['Neumann KM 184 ×2', 'SB1 : 6–7', 'ch 6'])
    expect(model.lines[0].segments[1].node).toMatchObject({ port: 5, portTo: 6 })
    expect(model.lines[0].segments[1].cableIdTo).toBe(4)
  })

  it('keeps a stereo pair on two labelled lines when its sides genuinely diverge', () => {
    const stereo = channel({ width: 'stereo', channel_number: 11, channel_name: 'Keys L/R' })
    const sources = [source({ id: 1, name: 'Keys L' }), source({ id: 2, name: 'Keys R' })]
    const cables = [
      cable({ id: 1, from_id: 1, to_kind: 'stagebox', to_id: 1, to_port: 2, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'channel', to_id: 1, to_port: 0 }),
      cable({ id: 3, from_id: 2, to_kind: 'stage_multi', to_id: 5, to_port: 4, cable_item_id: 7 }),
      cable({ id: 4, from_kind: 'stage_multi', from_id: 5, from_port: 4, to_kind: 'channel', to_id: 1, to_port: 1 }),
    ]
    const model = inputChainSegments(stereo, inputContext({ sources, channels: [stereo], cables }))
    expect(model.lines).toHaveLength(2)
    expect(labels(model.lines[0].segments)).toEqual(['Sennheiser e906', 'SB1 : 3', 'ch 11'])
    expect(labels(model.lines[1].segments)).toEqual(['Sennheiser e906', 'Multi A : 5', 'ch 11'])
    expect(model.lines.map((line) => line.sideLabel)).toEqual(['Keys L/R L', 'Keys L/R R'])
  })

  it('states a missing source in place instead of leaving the cell empty', () => {
    const model = inputChainSegments(channel(), inputContext({ cables: [] }))
    expect(labels(model.lines[0].segments)).toEqual(['no source', 'ch 3'])
    expect(model.lines[0].segments[0].missing).toBe(true)
    expect(model.hasGap).toBe(true)
  })

  it('reads a run straight into the desk, with no stagebox in the path', () => {
    const desk: Console = {
      id: 3, event_id: 1, name: 'FOH · SD10', role: 'foh', input_count: 96, output_count: 48,
      local_input_count: 8, local_output_count: 8, position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0,
      local_position_x: 260, local_position_y: 320, local_input_position_x: 260, local_input_position_y: 320,
    }
    const talkback = channel({ channel_number: 15, channel_name: 'Talkback' })
    const cables = [
      cable({ id: 1, to_kind: 'console_local', to_id: 3, to_port: 0, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'console_local', from_id: 3, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const model = inputChainSegments(talkback, inputContext({ channels: [talkback], cables, consoles: [desk] }))
    expect(labels(model.lines[0].segments)).toEqual(['Sennheiser e906', 'FOH · SD10 local in 1', 'ch 15'])
    expect(model.hasGap).toBe(false)
  })

  it('falls back to the source name when no mic is picked', () => {
    const cables = [cable({ id: 1 })]
    const model = inputChainSegments(channel(), inputContext({ sources: [source({ mic_item_id: undefined, kind: 'line', name: 'Jack' })], cables }))
    expect(labels(model.lines[0].segments)).toEqual(['Jack', 'ch 3'])
  })

  it('falls back to the source name for an unassigned mic source', () => {
    const cables = [cable({ id: 1 })]
    const model = inputChainSegments(channel(), inputContext({ sources: [source({ mic_item_id: undefined, kind: 'mic', name: 'New source' })], cables }))
    expect(labels(model.lines[0].segments)).toEqual(['New source', 'ch 3'])
  })
})

function output(overrides: Partial<AudioPatchOutput> = {}): AudioPatchOutput {
  return { id: 1, event_id: 1, output_number: 3, output_name: 'Sub', output_type: 'sub', width: 'mono', ...overrides }
}
function outDevice(overrides: Partial<OutputDevice> = {}): OutputDevice {
  return { id: 10, event_id: 1, name: 'PLM 12K44', input_port_count: 4, output_port_count: 0, link_port_count: 0, position_x: 0, position_y: 0, ...overrides }
}
function outCable(overrides: Partial<OutputCable> = {}): OutputCable {
  return { id: 1, event_id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0, ...overrides }
}
function outputContext(overrides: Partial<OutputFlowContext> = {}): OutputFlowContext {
  return { stageboxes, stageMultis, devices: [outDevice()], cables: [], itemLabelById, ...overrides }
}

describe('outputChainSegments', () => {
  it('starts at the desk output and reads out to the destination', () => {
    const cables = [
      outCable({ id: 1, to_kind: 'stagebox', to_id: 1, to_port: 2 }),
      outCable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'device', to_id: 10, to_port: 2, cable_item_id: 7 }),
    ]
    const model = outputChainSegments(output(), outputContext({ cables }))
    expect(labels(model.lines[0].segments)).toEqual(['Mixer : 3', 'SB1 : 3', 'PLM 12K44 in 3'])
  })

  it('names the desk when the event has one', () => {
    const model = outputChainSegments(output(), outputContext({ cables: [outCable()] }), { consoleLabel: 'FOH · SD10' })
    expect(model.lines[0].segments[0].label).toBe('FOH · SD10 : 3')
  })

  it('says an unpatched output is not patched', () => {
    const model = outputChainSegments(output(), outputContext({ cables: [] }))
    expect(labels(model.lines[0].segments)).toEqual(['Mixer : 3', 'not patched'])
    expect(model.hasGap).toBe(true)
  })

  it('collapses a stereo output into one line with a jack range', () => {
    const cables = [
      outCable({ id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 0 }),
      outCable({ id: 2, from_port: 1, to_kind: 'stagebox', to_id: 1, to_port: 1 }),
    ]
    const model = outputChainSegments(output({ width: 'stereo', output_number: 1, output_name: 'FOH L/R' }), outputContext({ cables }))
    expect(model.lines).toHaveLength(1)
    expect(labels(model.lines[0].segments)).toEqual(['Mixer : 1', 'SB1 : 1–2'])
  })
})

describe('truncateSegments', () => {
  const chain: ChainSegment[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((label) => ({ label, kind: 'device', missing: false }))

  it('leaves a short chain alone', () => {
    expect(truncateSegments(chain, 6)).toEqual({ segments: chain, hidden: 0 })
  })

  it('drops from the middle, keeping the first and last hop', () => {
    const { segments, hidden } = truncateSegments(chain, 4)
    expect(labels(segments)).toEqual(['a', 'b', 'e', 'f'])
    expect(hidden).toBe(2)
  })

  it('keeps the first and last hop even at the tightest width', () => {
    const { segments, hidden } = truncateSegments(chain, 2)
    expect(labels(segments)).toEqual(['a', 'f'])
    expect(hidden).toBe(4)
  })
})

describe('chainSourceNode', () => {
  it('picks the source that feeds a channel, which is what Edit in Flow selects', () => {
    // The point of the button is to change where the signal comes from, so it has
    // to land on the source rather than on the channel being edited (Slice 24
    // FR-030).
    const model = inputChainSegments(channel(), inputContext({ cables: [cable({ id: 1 })] }))
    expect(chainSourceNode(model)).toMatchObject({ kind: 'source', id: 1 })
  })

  it('is undefined when nothing is patched, so the button is not offered', () => {
    const model = inputChainSegments(channel(), inputContext({ cables: [] }))
    expect(chainSourceNode(model)).toBeUndefined()
  })

  it('picks the first hop on the output side, since the desk itself is not a node', () => {
    const model = outputChainSegments(output(), outputContext({ cables: [outCable()] }), { consoleLabel: 'FOH · SD10' })
    // The desk heads the line but carries no node — it is the row itself.
    expect(model.lines[0].segments[0].node).toBeUndefined()
    expect(chainSourceNode(model)).toMatchObject({ kind: 'device', id: 10 })
  })

  it('picks the source even when the run goes straight into the desk\'s own socket', () => {
    // The bug this replaced `firstChainNode` for: on this chain the *first* node is
    // the desk's jack panel, so the button opened the console instead of the source.
    const desk: Console = {
      id: 3, event_id: 1, name: 'FOH · SD10', role: 'foh', input_count: 96, output_count: 48,
      local_input_count: 8, local_output_count: 8, position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0,
      local_position_x: 260, local_position_y: 320, local_input_position_x: 260, local_input_position_y: 320,
    }
    const talkback = channel({ channel_number: 15, channel_name: 'Talkback' })
    const cables = [
      cable({ id: 1, to_kind: 'console_local', to_id: 3, to_port: 0, cable_item_id: 7 }),
      cable({ id: 2, from_kind: 'console_local', from_id: 3, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const model = inputChainSegments(talkback, inputContext({ channels: [talkback], cables, consoles: [desk] }))
    expect(model.lines[0].segments[1].node).toMatchObject({ kind: 'console_local' })
    expect(chainSourceNode(model)).toMatchObject({ kind: 'source', id: 1 })
  })
})
