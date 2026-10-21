import { describe, expect, it } from 'vitest'
import { duplicateOf, landsOn, nextOutputNumber } from './outputInspector'
import { outputChainSegments } from './patchSheet'
import type { OutputFlowContext } from './signalFlow'
import type { AudioPatchOutput, Console, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB1', model: '', input_count: 32, output_count: 16, connection_type: 'dante', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 16, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0, show_in_output_graph: true },
]
const itemLabelById = new Map([[7, 'NL4 10 m — Högtalarkabel']])

function output(overrides: Partial<AudioPatchOutput> = {}): AudioPatchOutput {
  return { id: 1, event_id: 1, output_number: 3, output_name: 'Sub', output_type: 'sub', width: 'mono', ...overrides }
}
function outDevice(overrides: Partial<OutputDevice> = {}): OutputDevice {
  return { id: 10, event_id: 1, name: 'PLM 12K44', input_port_count: 4, output_port_count: 0, link_port_count: 0, position_x: 0, position_y: 0, ...overrides }
}
function outCable(overrides: Partial<OutputCable> = {}): OutputCable {
  return { id: 1, event_id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0, ...overrides }
}
function desk(overrides: Partial<Console> = {}): Console {
  return {
    id: 4,
    event_id: 1,
    name: 'FOH · SD10',
    input_count: 96,
    output_count: 24,
    local_input_count: 8,
    local_output_count: 8,
    role: 'foh',
    position_x: 0,
    position_y: 0,
    input_position_x: 0,
    input_position_y: 0,
    local_position_x: 260,
    local_position_y: 320,
    local_input_position_x: 260,
    local_input_position_y: 320,
    aux_socket_count: 0,
    aux_input_position_x: 260,
    aux_input_position_y: 900,
    desk_model: 'generic',
    bus_mode: '',
    ...overrides,
  }
}
function outputContext(overrides: Partial<OutputFlowContext> = {}): OutputFlowContext {
  return { stageboxes, stageMultis, devices: [outDevice()], cables: [], itemLabelById, ...overrides }
}

describe('nextOutputNumber', () => {
  it('is one past the highest number, not one past the last row', () => {
    // The unsorted case is the whole point: `at(-1) + 1` returns 3 here and mints a
    // number that already exists. The raw query guarantees no order.
    const outputs = [output({ id: 1, output_number: 7 }), output({ id: 2, output_number: 2 })]
    expect(nextOutputNumber(outputs)).toBe(8)
  })

  it('fills nothing in — a gap in the numbering stays a gap', () => {
    const outputs = [output({ id: 1, output_number: 1 }), output({ id: 2, output_number: 5 })]
    expect(nextOutputNumber(outputs)).toBe(6)
  })

  it('starts at 1 for an event with no outputs', () => {
    expect(nextOutputNumber([])).toBe(1)
  })
})

describe('duplicateOf', () => {
  it('copies the row and takes the next free number', () => {
    const rows = [output({ id: 1, output_number: 3 }), output({ id: 2, output_number: 4 })]
    expect(duplicateOf(rows[0], rows)).toEqual({
      event_id: 1,
      output_number: 5,
      output_name: 'Sub copy',
      output_type: 'sub',
      color: undefined,
      width: 'mono',
      notes: undefined,
      console_id: undefined,
    })
  })

  it('leaves an unnamed row unnamed, rather than calling it " copy"', () => {
    const row = output({ output_name: '' })
    expect(duplicateOf(row, [row]).output_name).toBe('')
  })

  it('keeps the desk, so a duplicate lands on the same console', () => {
    const row = output({ console_id: 4 })
    expect(duplicateOf(row, [row]).console_id).toBe(4)
  })

  it('keeps "no desk" as no desk', () => {
    const row = output({ console_id: undefined })
    expect(duplicateOf(row, [row]).console_id).toBeUndefined()
  })

  it('carries the tape colour and notes across', () => {
    const row = output({ color: '#22c55e', notes: 'right hang' })
    expect(duplicateOf(row, [row])).toMatchObject({ color: '#22c55e', notes: 'right hang' })
  })
})

describe('landsOn', () => {
  it('names the far end of the run', () => {
    const cables = [
      outCable({ id: 1, to_kind: 'stagebox', to_id: 1, to_port: 2 }),
      outCable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 2, to_kind: 'device', to_id: 10, to_port: 2, cable_item_id: 7 }),
    ]
    const { landings, patched } = landsOn(outputChainSegments(output(), outputContext({ cables })))
    expect(patched).toBe(true)
    // The desk head and the intermediate jack are both dropped: the rail states where
    // the signal ends up, and the sheet's Chain column is what states the whole path.
    expect(landings).toEqual([{ sideLabel: undefined, label: 'PLM 12K44 in 3' }])
  })

  it('reports an unpatched output as not patched, with nothing to name', () => {
    const { landings, patched } = landsOn(outputChainSegments(output(), outputContext({ cables: [] })))
    expect(patched).toBe(false)
    expect(landings).toEqual([])
  })

  it('gives a collapsed stereo pair one landing', () => {
    const cables = [
      outCable({ id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 0 }),
      outCable({ id: 2, from_port: 1, to_kind: 'stagebox', to_id: 1, to_port: 1 }),
    ]
    const model = outputChainSegments(output({ width: 'stereo', output_number: 1, output_name: 'FOH L/R' }), outputContext({ cables }))
    expect(landsOn(model).landings).toEqual([{ sideLabel: undefined, label: 'SB1 : 1–2' }])
  })

  it('gives a diverging stereo pair one landing per side, each labelled', () => {
    const cables = [
      outCable({ id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 0 }),
      outCable({ id: 2, from_port: 1, to_kind: 'stage_multi', to_id: 5, to_port: 3 }),
    ]
    const model = outputChainSegments(output({ width: 'stereo', output_number: 1, output_name: 'FOH' }), outputContext({ cables }))
    const { landings, patched } = landsOn(model)
    expect(patched).toBe(true)
    expect(landings).toEqual([
      { sideLabel: 'FOH L', label: 'SB1 : 1' },
      { sideLabel: 'FOH R', label: 'Multi A : 4' },
    ])
  })

  it('counts a half-patched stereo output as patched, naming only the side that lands', () => {
    const cables = [outCable({ id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 0 })]
    const model = outputChainSegments(output({ width: 'stereo', output_number: 1, output_name: 'FOH' }), outputContext({ cables }))
    const { landings, patched } = landsOn(model)
    expect(patched).toBe(true)
    expect(landings).toEqual([{ sideLabel: 'FOH L', label: 'SB1 : 1' }])
  })

  it('names the desk’s own local jack as the landing, not the desk head', () => {
    // A run out of the desk's own socket has the jack panel as its far end. The head
    // of every output chain is the desk, so a naive "first node" would answer the desk
    // here — the bug the sheet's Edit-in-Flow had (patchSheet chainSourceNode).
    const consoles = [desk()]
    const cables = [outCable({ id: 1, to_kind: 'console_local', to_id: 4, to_port: 2 })]
    const model = outputChainSegments(output({ console_id: 4 }), outputContext({ cables, consoles }), { consoleLabel: 'FOH · SD10', consoles })
    expect(landsOn(model).landings).toEqual([{ sideLabel: undefined, label: 'FOH · SD10 local out 3' }])
  })
})
