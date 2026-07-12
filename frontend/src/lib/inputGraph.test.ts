import { describe, expect, it } from 'vitest'
import type { InputCable, InputChannel, InputDevice, InputSource, StageMulti, Stagebox } from '../types'
import { derivedPortColor, derivedSourceColor, isCablelessEdge, type PortRef } from './inputGraph'

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'SB Stage L', model: '', input_count: 16, output_count: 8, connection_type: 'analog', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]

function channel(overrides: Partial<InputChannel>): InputChannel {
  return { id: 1, event_id: 1, channel_number: 1, channel_name: 'Vocal', width: 'mono', mixer_behavior: 'stereo_channel', ...overrides }
}
function device(overrides: Partial<InputDevice>): InputDevice {
  return { id: 1, event_id: 1, name: 'DI', input_port_count: 1, output_port_count: 1, position_x: 0, position_y: 0, ...overrides }
}
function cable(overrides: Partial<InputCable>): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}

function sourcePort(id: number, port = 0): PortRef {
  return { kind: 'source', id, port, direction: 'out', label: 'src' }
}
function inputSource(overrides: Partial<InputSource>): InputSource {
  return { id: 1, event_id: 1, name: 'Shure SM58', kind: 'mic', connector_type: 'xlr', phantom_power: true, width: 'mono', position_x: 0, position_y: 0, ...overrides }
}

describe('derivedPortColor', () => {
  it('a channel always shows its own stored color', () => {
    const context = { channels: [channel({ color: '#ef4444' })], devices: [], stageboxes, stageMultis, cables: [] }
    const port: PortRef = { kind: 'channel', id: 1, port: 0, direction: 'in', label: 'Ch 1' }
    expect(derivedPortColor(port, context)).toBe('#ef4444')
  })

  it('a source feeding one colored channel inherits that color', () => {
    const context = {
      channels: [channel({ id: 1, color: '#3b82f6' })],
      devices: [],
      stageboxes,
      stageMultis,
      cables: [cable({})],
    }
    expect(derivedPortColor(sourcePort(1), context)).toBe('#3b82f6')
  })

  it('a source reaching nothing is neutral (undefined)', () => {
    const context = { channels: [], devices: [], stageboxes, stageMultis, cables: [] }
    expect(derivedPortColor(sourcePort(1), context)).toBeUndefined()
  })

  it('a source double-patched to two differently-colored channels is neutral', () => {
    const context = {
      channels: [channel({ id: 1, color: '#ef4444' }), channel({ id: 2, color: '#3b82f6' })],
      devices: [],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, to_id: 1 }),
        cable({ id: 2, to_id: 2 }),
      ],
    }
    expect(derivedPortColor(sourcePort(1), context)).toBeUndefined()
  })

  it('a source double-patched to two same-colored channels returns that color', () => {
    const context = {
      channels: [channel({ id: 1, color: '#22c55e' }), channel({ id: 2, color: '#22c55e' })],
      devices: [],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, to_id: 1 }),
        cable({ id: 2, to_id: 2 }),
      ],
    }
    expect(derivedPortColor(sourcePort(1), context)).toBe('#22c55e')
  })

  it('traces forward through a Stagebox pass-through to the fed channel', () => {
    const context = {
      channels: [channel({ id: 1, color: '#f59e0b' })],
      devices: [],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, from_kind: 'source', from_id: 1, to_kind: 'stagebox', to_id: 1, to_port: 11 }),
        cable({ id: 2, from_kind: 'stagebox', from_id: 1, from_port: 11, to_kind: 'channel', to_id: 1, to_port: 0 }),
      ],
    }
    expect(derivedPortColor(sourcePort(1), context)).toBe('#f59e0b')
    const stageboxOut: PortRef = { kind: 'stagebox', id: 1, port: 11, direction: 'out', label: 'out' }
    const stageboxIn: PortRef = { kind: 'stagebox', id: 1, port: 11, direction: 'in', label: 'in' }
    expect(derivedPortColor(stageboxOut, context)).toBe('#f59e0b')
    expect(derivedPortColor(stageboxIn, context)).toBe('#f59e0b')
  })

  it('traces forward through a same-count Device by matching port index', () => {
    const stereoDI = device({ id: 2, input_port_count: 2, output_port_count: 2 })
    const context = {
      channels: [channel({ id: 1, color: '#a855f7' }), channel({ id: 2, color: '#a855f7' })],
      devices: [stereoDI],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'device', to_id: 2, to_port: 0 }),
        cable({ id: 2, from_kind: 'source', from_id: 2, from_port: 0, to_kind: 'device', to_id: 2, to_port: 1 }),
        cable({ id: 3, from_kind: 'device', from_id: 2, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
        cable({ id: 4, from_kind: 'device', from_id: 2, from_port: 1, to_kind: 'channel', to_id: 2, to_port: 0 }),
      ],
    }
    const deviceInPort0: PortRef = { kind: 'device', id: 2, port: 0, direction: 'in', label: 'In 1' }
    expect(derivedPortColor(deviceInPort0, context)).toBe('#a855f7')
  })

  it('a fan-in device (1 output) falls back to its sole output port for an in-port lookup', () => {
    const fanIn = device({ id: 3, input_port_count: 2, output_port_count: 1 })
    const context = {
      channels: [channel({ id: 1, color: '#14b8a6' })],
      devices: [fanIn],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, from_kind: 'device', from_id: 3, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }),
      ],
    }
    const deviceInPort1: PortRef = { kind: 'device', id: 3, port: 1, direction: 'in', label: 'In 2' }
    expect(derivedPortColor(deviceInPort1, context)).toBe('#14b8a6')
  })
})

describe('derivedSourceColor', () => {
  it('a mono source takes the color of the one channel it feeds', () => {
    const context = { channels: [channel({ id: 1, color: '#3b82f6' })], devices: [], stageboxes, stageMultis, cables: [cable({})] }
    expect(derivedSourceColor(inputSource({}), context)).toBe('#3b82f6')
  })

  it('a stereo source with both sides feeding same-colored channels returns that color', () => {
    const stereoSource = inputSource({ width: 'stereo' })
    const context = {
      channels: [channel({ id: 1, color: '#ef4444' }), channel({ id: 2, color: '#ef4444' })],
      devices: [],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, from_port: 0, to_id: 1 }),
        cable({ id: 2, from_port: 1, to_id: 2 }),
      ],
    }
    expect(derivedSourceColor(stereoSource, context)).toBe('#ef4444')
  })

  it('a stereo source whose two sides feed differently-colored channels is neutral', () => {
    const stereoSource = inputSource({ width: 'stereo' })
    const context = {
      channels: [channel({ id: 1, color: '#ef4444' }), channel({ id: 2, color: '#3b82f6' })],
      devices: [],
      stageboxes,
      stageMultis,
      cables: [
        cable({ id: 1, from_port: 0, to_id: 1 }),
        cable({ id: 2, from_port: 1, to_id: 2 }),
      ],
    }
    expect(derivedSourceColor(stereoSource, context)).toBeUndefined()
  })
})

describe('isCablelessEdge', () => {
  it('a Stage Multi\'s output side is always cableless, regardless of destination kind', () => {
    expect(isCablelessEdge('stage_multi', 'channel')).toBe(true)
    expect(isCablelessEdge('stage_multi', 'stagebox')).toBe(true)
    expect(isCablelessEdge('stage_multi', 'stage_multi')).toBe(true)
    expect(isCablelessEdge('stage_multi', 'device')).toBe(true)
  })

  it('a Stagebox\'s output side is cableless only into a Channel — a real cable elsewhere', () => {
    expect(isCablelessEdge('stagebox', 'channel')).toBe(true)
    expect(isCablelessEdge('stagebox', 'device')).toBe(false)
    expect(isCablelessEdge('stagebox', 'stagebox')).toBe(false)
    expect(isCablelessEdge('stagebox', 'stage_multi')).toBe(false)
  })

  it('a Source or Device feeding a Channel directly is never cableless', () => {
    expect(isCablelessEdge('source', 'channel')).toBe(false)
    expect(isCablelessEdge('device', 'channel')).toBe(false)
  })
})
