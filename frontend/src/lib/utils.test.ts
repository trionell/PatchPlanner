import { describe, expect, it } from 'vitest'
import { formatDMXRange, parseChannels, parseInOut, toOptionalNumber } from './utils'

describe('toOptionalNumber', () => {
  it('parses numeric strings', () => {
    expect(toOptionalNumber('42')).toBe(42)
    expect(toOptionalNumber('3.5')).toBe(3.5)
  })
  it('returns undefined for empty or invalid input', () => {
    expect(toOptionalNumber('')).toBeUndefined()
    expect(toOptionalNumber('abc')).toBeUndefined()
  })
})

describe('formatDMXRange', () => {
  it('formats multi-channel ranges', () => {
    expect(formatDMXRange(1, 16)).toBe('1–16')
    expect(formatDMXRange(17, 4)).toBe('17–20')
  })
  it('formats single-channel fixtures without a range', () => {
    expect(formatDMXRange(5, 1)).toBe('5')
    expect(formatDMXRange(5, 0)).toBe('5')
  })
  it('shows a dash when unassigned', () => {
    expect(formatDMXRange(undefined, 8)).toBe('—')
    expect(formatDMXRange(0, 8)).toBe('—')
  })
})

describe('parseInOut', () => {
  it('parses stagebox in/out counts from descriptions', () => {
    expect(parseInOut('Stagebox 32/16 Dante')).toEqual({ inputs: 32, outputs: 16 })
    expect(parseInOut('12 / 6')).toEqual({ inputs: 12, outputs: 6 })
  })
  it('returns null when no pattern matches', () => {
    expect(parseInOut('Digital stagebox')).toBeNull()
  })
})

describe('parseChannels', () => {
  it('takes the larger side of an in/out pair', () => {
    expect(parseChannels('Multikabel 24/8')).toBe(24)
  })
  it('parses "N ch" and "N kanal" fallbacks', () => {
    expect(parseChannels('Multicore 16 ch')).toBe(16)
    expect(parseChannels('24 kanaler')).toBe(24)
  })
  it('returns null when nothing matches', () => {
    expect(parseChannels('Kabeltrumma')).toBeNull()
  })
})
