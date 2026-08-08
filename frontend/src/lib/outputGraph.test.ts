import { describe, expect, it } from 'vitest'
import type { AudioPatchOutput, Console, OutputCable, OutputDevice, StageMulti } from '../types'
import {
  consoleLocalPorts,
  derivedCableColor,
  derivedOutputPortColor,
  isCablelessToKind,
  isStageMultiVisibleInOutputGraph,
  nodeZone,
} from './outputGraph'

function output(overrides: Partial<AudioPatchOutput> = {}): AudioPatchOutput {
  return { id: 1, event_id: 1, output_number: 1, output_name: 'FOH', output_type: 'foh', width: 'mono', color: '#38bdf8', ...overrides }
}
function device(overrides: Partial<OutputDevice> = {}): OutputDevice {
  return { id: 10, event_id: 1, name: 'Amp', input_port_count: 2, output_port_count: 2, link_port_count: 0, position_x: 0, position_y: 0, ...overrides }
}
function cable(overrides: Partial<OutputCable> = {}): OutputCable {
  return { id: 1, event_id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0, ...overrides }
}
function stageMulti(overrides: Partial<StageMulti> = {}): StageMulti {
  return {
    id: 1,
    event_id: 1,
    name: 'Multi A',
    length_m: 30,
    channels: 16,
    connector_type: 'xlr',
    position_x: 0,
    position_y: 0,
    input_position_x: 0,
    input_position_y: 0,
    show_in_output_graph: false,
    ...overrides,
  }
}

describe('derivedCableColor', () => {
  it('takes the colour of the output the run starts from', () => {
    const first = cable({ id: 1 })
    expect(derivedCableColor(first, { outputs: [output()], cables: [first], devices: [device()] })).toBe('#38bdf8')
  })

  it('carries the colour forward through a pass-through jack', () => {
    const intoBox = cable({ id: 1, to_kind: 'stagebox', to_id: 5, to_port: 3 })
    const onward = cable({ id: 2, from_kind: 'stagebox', from_id: 5, from_port: 3, to_kind: 'device', to_id: 10, to_port: 0 })
    expect(derivedCableColor(onward, { outputs: [output()], cables: [intoBox, onward], devices: [device()] })).toBe('#38bdf8')
  })

  it('carries the colour through a device whose sides match in count, by index', () => {
    const intoAmp = cable({ id: 1, to_kind: 'device', to_id: 10, to_port: 1 })
    const outOfAmp = cable({ id: 2, from_kind: 'device', from_id: 10, from_port: 1, to_kind: 'device', to_id: 11, to_port: 0 })
    const colour = derivedCableColor(outOfAmp, {
      outputs: [output()],
      cables: [intoAmp, outOfAmp],
      devices: [device(), device({ id: 11, name: 'Speaker', input_port_count: 1, output_port_count: 0 })],
    })
    expect(colour).toBe('#38bdf8')
  })

  it('is neutral when the run cannot be traced back to an output', () => {
    const orphan = cable({ id: 2, from_kind: 'device', from_id: 10, from_port: 0, to_kind: 'device', to_id: 11, to_port: 0 })
    expect(derivedCableColor(orphan, { outputs: [output()], cables: [orphan], devices: [device()] })).toBeUndefined()
  })

  it('is neutral when the origin output has no colour', () => {
    const first = cable({ id: 1 })
    expect(derivedCableColor(first, { outputs: [output({ color: undefined })], cables: [first], devices: [device()] })).toBeUndefined()
  })
})

describe('console local jacks', () => {
  const desk: Console = {
    id: 3, event_id: 1, name: 'FOH · SD10', role: 'foh', input_count: 96, output_count: 48,
    local_input_count: 8, local_output_count: 4, position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0,
    local_position_x: 260, local_position_y: 320, local_input_position_x: 260, local_input_position_y: 320,
  }

  it('sizes the output graph jacks by local_output_count, on both sides of the pass-through', () => {
    const { inputs, outputs } = consoleLocalPorts(desk)
    // Both sides, equally — the node is drawn as a two-column pass-through since
    // Slice 24, and an in side that is not drawn is a jack a bus cannot reach.
    expect(inputs).toHaveLength(4)
    expect(outputs).toHaveLength(4)
    expect(inputs.every((port) => port.direction === 'in')).toBe(true)
    expect(outputs.every((port) => port.direction === 'out')).toBe(true)
    // local_output_count sizes it, not local_input_count — that is the input
    // graph's number.
    expect(consoleLocalPorts({ ...desk, local_input_count: 32 }).outputs).toHaveLength(4)
  })

  it('labels the two sides distinctly, so the columns cannot be confused', () => {
    const { inputs, outputs } = consoleLocalPorts(desk)
    expect(inputs[0].label).toBe('From desk 1')
    expect(outputs[0].label).toBe('Local out 1')
  })

  it('puts the jack panel in the processing lane, where a stagebox is', () => {
    // The lane is what makes the two visibly interchangeable (FR-009). It moved
    // out of `sources` when the jacks stopped being rows on the desk's own node.
    expect(nodeZone('console_local', desk.id, { devices: [] })).toBe('processing')
    expect(nodeZone('stagebox', 5, { devices: [] })).toBe('processing')
    expect(nodeZone('mixer', 1, { devices: [] })).toBe('sources')
  })

  it('treats routing into a local jack as desk routing, not a cable', () => {
    expect(isCablelessToKind('console_local')).toBe(true)
    expect(isCablelessToKind('device')).toBe(false)
  })
})

describe('derivedOutputPortColor', () => {
  // The defect Slice 25 fixes: Slice 23 gave this graph's cables a colour and its
  // ports none, so a coloured run was cabled in colour and ported in grey.
  it('gives the mixer port the output row\'s own colour', () => {
    expect(derivedOutputPortColor('mixer', 1, 0, { outputs: [output()], cables: [], devices: [] })).toBe('#38bdf8')
  })

  it('colours both sides of a pass-through the run goes through', () => {
    const intoBox = cable({ id: 1, to_kind: 'stagebox', to_id: 5, to_port: 3 })
    const ctx = { outputs: [output()], cables: [intoBox], devices: [device()] }
    // The in side is where the desk's routing lands; the out side is the same
    // jack, so both wear the colour — which is what "end to end" means.
    expect(derivedOutputPortColor('stagebox', 5, 3, ctx)).toBe('#38bdf8')
  })

  it('colours a device port the run reaches', () => {
    const intoAmp = cable({ id: 1, to_kind: 'device', to_id: 10, to_port: 1 })
    const ctx = { outputs: [output()], cables: [intoAmp], devices: [device()] }
    expect(derivedOutputPortColor('device', 10, 1, ctx)).toBe('#38bdf8')
  })

  it('is neutral for a port with no traceable origin', () => {
    expect(derivedOutputPortColor('device', 10, 0, { outputs: [output()], cables: [], devices: [device()] })).toBeUndefined()
  })

  it('is neutral when the origin output has no colour', () => {
    const intoBox = cable({ id: 1, to_kind: 'stagebox', to_id: 5, to_port: 0 })
    const ctx = { outputs: [output({ color: undefined })], cables: [intoBox], devices: [device()] }
    expect(derivedOutputPortColor('stagebox', 5, 0, ctx)).toBeUndefined()
  })

  it('agrees with derivedCableColor, which is now defined in terms of it', () => {
    // The refactor must not have changed the cables: the two answers are the same
    // walk from the same place.
    const first = cable({ id: 1 })
    const ctx = { outputs: [output()], cables: [first], devices: [device()] }
    expect(derivedCableColor(first, ctx)).toBe(derivedOutputPortColor(first.from_kind, first.from_id, first.from_port, ctx))
  })
})

describe('isStageMultiVisibleInOutputGraph', () => {
  it('is visible when the flag is on', () => {
    expect(isStageMultiVisibleInOutputGraph(stageMulti({ show_in_output_graph: true }), [])).toBe(true)
  })

  it('is hidden by default (flag off, uncabled) — the fixture default, not an explicit override', () => {
    expect(isStageMultiVisibleInOutputGraph(stageMulti(), [])).toBe(false)
  })

  it('stays visible when flagged off but cabled as a from', () => {
    const multi = stageMulti({ id: 5, show_in_output_graph: false })
    const wired = cable({ from_kind: 'stage_multi', from_id: 5, to_kind: 'device', to_id: 10 })
    expect(isStageMultiVisibleInOutputGraph(multi, [wired])).toBe(true)
  })

  it('stays visible when flagged off but cabled as a to', () => {
    const multi = stageMulti({ id: 5, show_in_output_graph: false })
    const wired = cable({ from_kind: 'mixer', from_id: 1, to_kind: 'stage_multi', to_id: 5 })
    expect(isStageMultiVisibleInOutputGraph(multi, [wired])).toBe(true)
  })

  it('ignores a cable that belongs to a different stage multi', () => {
    const multi = stageMulti({ id: 5, show_in_output_graph: false })
    const wired = cable({ from_kind: 'stage_multi', from_id: 6, to_kind: 'device', to_id: 10 })
    expect(isStageMultiVisibleInOutputGraph(multi, [wired])).toBe(false)
  })
})
