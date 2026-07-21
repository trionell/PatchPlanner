import { describe, expect, it } from 'vitest'
import type { InputCable, OutputCable } from '../types'
import { computeRoutingSave, resolveChannelRouting } from './mobileChannelList'
import { computeOutputRoutingSave, resolveOutputRouting } from './mobileOutputList'

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
    expect(resolveChannelRouting(1, cables)).toEqual({ stageboxId: 5, port: 6, sourceId: 9 })
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
    const ops = computeRoutingSave(1, cables, { stageboxId: 5, port: 6, sourceId: 9 })
    expect(ops).toEqual({ cablesToDelete: [], cablesToCreate: [] })
  })

  it('moves a channel to a different stagebox input, deleting the old channel-cable and creating a new one', () => {
    const cables = [
      inputCable({ id: 1, from_kind: 'source', from_id: 9, to_kind: 'stagebox', to_id: 5, to_port: 6 }),
      inputCable({ id: 2, from_kind: 'stagebox', from_id: 5, from_port: 6, to_kind: 'channel', to_id: 1, to_port: 0 }),
    ]
    // Same source, moved to input 7 (port 6, 0-indexed) — the DI-to-cleaner-input scenario.
    const ops = computeRoutingSave(1, cables, { stageboxId: 5, port: 7, sourceId: 9 })
    expect(ops.cablesToDelete.sort()).toEqual([1, 2])
    expect(ops.cablesToCreate).toEqual(
      expect.arrayContaining([
        { from_kind: 'stagebox', from_id: 5, from_port: 7, to_kind: 'channel', to_id: 1, to_port: 0 },
        { from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'stagebox', to_id: 5, to_port: 7 },
      ]),
    )
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
