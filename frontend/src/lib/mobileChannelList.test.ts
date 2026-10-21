import { describe, expect, it } from 'vitest'
import type { InputCable, InputChannel, InputSource, OutputCable } from '../types'
import { buildMobileChannelList, computeRoutingSave, resolveChannelRouting } from './mobileChannelList'
import { buildMobileOutputList, computeOutputRoutingSave, resolveOutputRouting } from './mobileOutputList'

function inputCable(overrides: Partial<InputCable>): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}

describe('resolveChannelRouting', () => {
  it('resolves a channel fed directly by a source with no stagebox in between', () => {
    const cables = [inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: 'channel', to_id: 1 })]
    expect(resolveChannelRouting(1, cables)).toEqual({ sourceId: 9 })
  })

  it('resolves a channel fed through a stagebox back to its source', () => {
    const cables = [
      inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: 'stagebox', to_id: 5, to_port: 6 }),
      inputCable({ id: 2, from_kind: 'stagebox', from_id: 5, from_port: 6, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    expect(resolveChannelRouting(1, cables)).toEqual({ panel: { kind: 'stagebox', id: 5 }, port: 6, sourceId: 9 })
  })

  it('resolves a channel fed through a desk local jack or aux socket (D9)', () => {
    for (const kind of ['console_local', 'console_aux'] as const) {
      const cables = [
        inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: kind, to_id: 3, to_port: 4 }),
        inputCable({ id: 2, from_kind: kind, from_id: 3, from_port: 4, to_kind: 'channel', to_id: 1, to_port: 0 }),
      ]
      expect(resolveChannelRouting(1, cables)).toEqual({ panel: { kind, id: 3 }, port: 4, sourceId: 9 })
    }
  })

  it('returns an empty routing for an unrouted channel (a gap)', () => {
    expect(resolveChannelRouting(1, [])).toEqual({})
  })
})

describe('computeRoutingSave', () => {
  it('is a no-op when the desired routing already matches', () => {
    const cables = [
      inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: 'stagebox', to_id: 5, to_port: 6 }),
      inputCable({ id: 2, from_kind: 'stagebox', from_id: 5, from_port: 6, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const ops = computeRoutingSave(1, cables, { panel: { kind: 'stagebox', id: 5 }, port: 6, sourceId: 9 })
    expect(ops).toEqual({ cablesToDelete: [], cablesToCreate: [] })
  })

  it('moves a channel to a different stagebox input, deleting the old channel-cable and creating a new one', () => {
    const cables = [
      inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: 'stagebox', to_id: 5, to_port: 6 }),
      inputCable({ id: 2, from_kind: 'stagebox', from_id: 5, from_port: 6, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    // Same source, moved to input 7 (port 6, 0-indexed) — the DI-to-cleaner-input scenario.
    const ops = computeRoutingSave(1, cables, { panel: { kind: 'stagebox', id: 5 }, port: 7, sourceId: 9 })
    expect(ops.cablesToDelete.sort()).toEqual([1, 2])
    expect(ops.cablesToCreate).toEqual(
      expect.arrayContaining([
        { from_kind: 'stagebox', from_id: 5, from_port: 7, to_kind: 'channel', to_id: 1, to_port: 0 },
        { from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'stagebox', to_id: 5, to_port: 7 },
      ]),
    )
  })

  it('patches a source into a desk aux socket and on to the channel (D9)', () => {
    const ops = computeRoutingSave(1, [], { panel: { kind: 'console_aux', id: 3 }, port: 2, sourceId: 9 })
    expect(ops.cablesToDelete).toEqual([])
    expect(ops.cablesToCreate).toEqual([
      { from_kind: 'console_aux', from_id: 3, from_port: 2, to_kind: 'channel', to_id: 1, to_port: 0 },
      { from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'console_aux', to_id: 3, to_port: 2 },
    ])
  })

  it('moves a channel from a local jack to a stagebox, unplugging the vacated jack', () => {
    const cables = [
      inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: 'console_local', to_id: 3, to_port: 4 }),
      inputCable({ id: 2, from_kind: 'console_local', from_id: 3, from_port: 4, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    const ops = computeRoutingSave(1, cables, { panel: { kind: 'stagebox', id: 5 }, port: 0, sourceId: 9 })
    expect(ops.cablesToDelete.sort()).toEqual([1, 2])
    expect(ops.cablesToCreate).toHaveLength(2)
  })

  it('routes a channel directly from a source with no stagebox', () => {
    const ops = computeRoutingSave(1, [], { sourceId: 4 })
    expect(ops.cablesToDelete).toEqual([])
    expect(ops.cablesToCreate).toEqual([{ from_kind: 'source', from_id: 4, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 }])
  })
})

function outputCable(overrides: Partial<OutputCable>): OutputCable {
  return { id: 1, event_id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'stagebox', to_id: 1, to_port: 0, ...overrides }
}

describe('resolveOutputRouting / computeOutputRoutingSave', () => {
  it('resolves an output already routed through a stagebox', () => {
    const cables = [outputCable({ from_id: 3, to_id: 5, to_port: 2 })]
    expect(resolveOutputRouting(3, cables)).toEqual({ stageboxId: 5, port: 2 })
  })

  it('moves an output to a different stagebox output, replacing the old cable', () => {
    const cables = [outputCable({ id: 1, from_id: 3, to_id: 5, to_port: 2 })]
    const ops = computeOutputRoutingSave(3, cables, { stageboxId: 5, port: 4 })
    expect(ops.cablesToDelete).toEqual([1])
    expect(ops.cablesToCreate).toEqual([{ from_kind: 'mixer', from_id: 3, from_port: 0, to_kind: 'stagebox', to_id: 5, to_port: 4 }])
  })
})

/**
 * `hasGap` is what the phone's strip filters to, and it is a derived flag rather than a
 * `sourceLabel === '—'` test at the call site: a filter that depends on a display value
 * breaks the next time someone writes "no source" instead of an em dash (research.md R7).
 */
function channel(overrides: Partial<InputChannel>): InputChannel {
  return { id: 1, event_id: 1, channel_number: 1, width: 'mono', mixer_behavior: 'stereo_channel', ...overrides }
}

const emptyContext = {
  sources: [],
  devices: [],
  stageboxes: [],
  stageMultis: [],
  cables: [] as InputCable[],
  itemLabelById: new Map<number, string>(),
}

describe('buildMobileChannelList · hasGap', () => {
  it('is true for a channel with nothing connected to it', () => {
    const [row] = buildMobileChannelList([channel({ channel_name: 'Playback L' })], emptyContext)
    expect(row.hasGap).toBe(true)
    expect(row.sourceLabel).toBe('—')
  })

  it('is false once a source reaches the channel', () => {
    const cables = [inputCable({ from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 })]
    const sources: InputSource[] = [
      { id: 9, event_id: 1, name: 'SM58', kind: 'mic', phantom_power: false, connector_type: 'xlr', width: 'mono', position_x: 0, position_y: 0 },
    ]
    const [row] = buildMobileChannelList([channel({ channel_name: 'Lead Vox' })], { ...emptyContext, cables, sources })
    expect(row.hasGap).toBe(false)
    expect(row.sourceLabel).toBe('SM58')
  })
})

describe('buildMobileOutputList · hasGap', () => {
  it('is true for an output that goes nowhere', () => {
    const [row] = buildMobileOutputList(
      [{ id: 1, event_id: 1, output_number: 1, output_name: 'FOH L', output_type: 'foh', width: 'mono' }],
      { stageboxes: [], stageMultis: [], devices: [], cables: [], itemLabelById: new Map() },
    )
    // Not asserted via `routingLabel`: an unpatched output's first hop is the
    // chain's own "Direct to output", which is exactly why the flag exists rather
    // than a display-string test (research.md R7).
    expect(row.hasGap).toBe(true)
  })
})
