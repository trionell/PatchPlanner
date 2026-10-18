import { describe, expect, it } from 'vitest'
import { GENERIC } from '../hooks/useDeskModels'
import { resolveDeskSelection } from '../hooks/useSelectedDesk'
import type { Console, DeskModel, InputChannel } from '../types'
import { inputPatchStatus } from './patchCapacity'
import { isOver, orderChannels, poolUsage, stripLabel } from './deskStrips'

const M32: DeskModel = { ...GENERIC, key: 'm32l', label: 'M32 Live', engine: 'x32', stereo: 'linked', strips: 32, aux_in: 8 }
const LV1: DeskModel = { ...GENERIC, key: 'lv1_64', label: 'LV1 64', engine: 'lv1', stereo: 'strip', strips: 64 }
const desk = { id: 1, name: 'FOH', input_count: 32 } as Console

const ch = (n: number, extra: Partial<InputChannel> = {}): InputChannel =>
  ({ id: n, event_id: 1, channel_number: n, width: 'mono', mixer_behavior: 'stereo_channel', console_id: 1, strip_pool: 'channel', ...extra }) as InputChannel

describe('stripLabel', () => {
  it('prints a linked pair, a stereo strip and aux', () => {
    expect(stripLabel(M32, ch(5, { width: 'stereo' }))).toBe('5–6')
    expect(stripLabel(LV1, ch(6, { width: 'stereo' }))).toBe('6 S')
    expect(stripLabel(M32, ch(3, { strip_pool: 'aux' }))).toBe('Aux 3')
    expect(stripLabel(M32, ch(1, { strip_pool: 'aux', width: 'stereo' }))).toBe('Aux 1–2')
    expect(stripLabel(GENERIC, ch(7))).toBe('7')
  })
})

describe('strip counting', () => {
  it('counts 28 mono and 4 stereo on an X32 as 36 strips', () => {
    const rows = [...Array.from({ length: 28 }, (_, i) => ch(i + 1)), ...Array.from({ length: 4 }, (_, i) => ch(29 + i * 2, { width: 'stereo' }))]
    expect(poolUsage(M32, rows, 'channel')).toBe(36)
    expect(poolUsage(LV1, rows, 'channel')).toBe(32)
  })

  it('flags a row past the pool as over, and never on an undeclared Generic', () => {
    expect(isOver(M32, desk, ch(32, { width: 'stereo' }))).toBe(true)
    expect(isOver(M32, desk, ch(31, { width: 'stereo' }))).toBe(false)
    expect(isOver(M32, desk, ch(9, { strip_pool: 'aux' }))).toBe(true)
    expect(isOver(GENERIC, { input_count: 0 }, ch(500))).toBe(false)
  })

  it('orders channels before aux', () => {
    expect(orderChannels([ch(2, { strip_pool: 'aux' }), ch(5), ch(1)]).map((row) => row.id)).toEqual([1, 5, 2])
  })

  it('states one desk in strips', () => {
    const status = inputPatchStatus({
      channels: [ch(1), ch(3, { width: 'stereo' }), ch(1, { id: 9, strip_pool: 'aux' } as Partial<InputChannel>)],
      desk: { console: { ...desk, name: 'FOH' }, model: M32 },
      deskless: 2,
      gaps: [], consoles: [desk], stageboxes: [], stageMultis: [], cables: [],
    })
    expect(status.consoleLabels).toEqual(['FOH · M32 Live · 3/32 ch · 1/8 aux'])
    expect(status.deskless).toBe(2)
  })

  it('goes over when a row is past the end even though the total fits', () => {
    const status = inputPatchStatus({
      channels: [ch(1), ch(40)],
      desk: { console: desk, model: M32 },
      gaps: [], consoles: [desk], stageboxes: [], stageMultis: [], cables: [],
    })
    expect(status.overCapacity[0]).toContain('1 channel is past the end of FOH · M32 Live')
  })
})

describe('resolveDeskSelection', () => {
  const a = { id: 1 } as Console
  const b = { id: 2 } as Console
  it('falls back to the first desk when the stored one is gone', () => {
    expect(resolveDeskSelection(7, [a, b], false)).toBe(1)
    expect(resolveDeskSelection(2, [a, b], false)).toBe(2)
  })
  it('keeps No desk only while something is on it', () => {
    expect(resolveDeskSelection('none', [a], true)).toBe('none')
    expect(resolveDeskSelection('none', [a], false)).toBe(1)
    expect(resolveDeskSelection(undefined, [], true)).toBe('none')
  })
})
