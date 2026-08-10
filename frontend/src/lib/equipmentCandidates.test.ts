import { describe, expect, it } from 'vitest'
import {
  BLANK_LINE,
  batchDefaults,
  linesReady,
  ownedCandidates,
  rentedCandidates,
  type LineValues,
  type PickerCandidate,
} from './equipmentCandidates'
import type { InventoryItem, OwnedItem } from '../types'

function candidate(overrides: Partial<PickerCandidate> = {}): PickerCandidate {
  return {
    id: 1,
    name: 'Mikrofonkabel',
    categoryKey: '4',
    categoryLabel: 'Signalkablage',
    stock: 25,
    lighting: false,
    ...overrides,
  }
}

/**
 * The two quantity paths differ **on purpose**, and this is the file that says
 * so: a batch defaults each line to one, a single add does not. Getting these
 * the same way round is the likeliest way to break the change, and it is
 * invisible from a type.
 */
describe('the two quantity paths', () => {
  it('starts a single add at nothing, so a rented line must be typed before it saves', () => {
    expect(BLANK_LINE.audio).toBe(0)
    expect(BLANK_LINE.light).toBe(0)
    expect(linesReady('rented', [1], { 1: BLANK_LINE })).toBe(false)
  })

  it('starts a batch line at one, in the department its category names', () => {
    expect(batchDefaults(candidate({ lighting: false }))).toEqual({ quantity: 1, audio: 1, light: 0 })
    expect(batchDefaults(candidate({ lighting: true }))).toEqual({ quantity: 1, audio: 0, light: 1 })
  })

  it('makes a batch line ready without typing, which is the point of the default', () => {
    const values: Record<number, LineValues> = { 1: batchDefaults(candidate()), 2: batchDefaults(candidate({ lighting: true })) }
    expect(linesReady('rented', [1, 2], values)).toBe(true)
  })
})

describe('linesReady', () => {
  it('is false with nothing chosen, whatever the values hold', () => {
    expect(linesReady('owned', [], { 1: { quantity: 5, audio: 5, light: 5 } })).toBe(false)
  })

  it('reads an owned line by its quantity alone', () => {
    expect(linesReady('owned', [1], { 1: { quantity: 1, audio: 0, light: 0 } })).toBe(true)
    expect(linesReady('owned', [1], { 1: { quantity: 0, audio: 9, light: 9 } })).toBe(false)
  })

  it('accepts a rented line in either department, and neither is not one', () => {
    expect(linesReady('rented', [1], { 1: { quantity: 0, audio: 2, light: 0 } })).toBe(true)
    expect(linesReady('rented', [1], { 1: { quantity: 0, audio: 0, light: 3 } })).toBe(true)
    expect(linesReady('rented', [1], { 1: { quantity: 9, audio: 0, light: 0 } })).toBe(false)
  })

  it('requires every line, not merely one of them', () => {
    const values = { 1: { quantity: 0, audio: 1, light: 0 }, 2: BLANK_LINE }
    expect(linesReady('rented', [1, 2], values)).toBe(false)
  })

  it('treats a line with no entry as blank rather than ready', () => {
    expect(linesReady('rented', [7], {})).toBe(false)
  })
})

describe('flattening the two catalogs', () => {
  it('groups owned gear by its fixed type and rented gear by its own category', () => {
    const owned = ownedCandidates([
      { id: 1, name: 'Stativ', category_type: 'lighting', quantity_owned: 3, planned_on_events: 0 } as OwnedItem,
    ])
    expect(owned[0]).toMatchObject({ categoryKey: 'lighting', categoryLabel: 'lighting', stock: 3, lighting: true })

    const rented = rentedCandidates([
      {
        id: 9,
        category_id: 4,
        category_name: 'Signalkablage',
        category_type: 'audio',
        name: 'Mikrofonkabel',
        description: '7,5m',
        quantity_available: 25,
        price_ex_vat: 0,
        discontinued: false,
      } as InventoryItem,
    ])
    expect(rented[0]).toMatchObject({
      categoryKey: '4',
      categoryLabel: 'Signalkablage',
      categoryQualifier: 'audio',
      description: '7,5m',
      stock: 25,
      lighting: false,
    })
  })

  it('sends everything that is not lighting to audio — the general department', () => {
    for (const type of ['audio', 'rigging', 'video', 'misc', undefined]) {
      const [one] = rentedCandidates([
        { id: 1, category_id: 1, name: 'x', category_type: type, quantity_available: 1, price_ex_vat: 0, discontinued: false } as InventoryItem,
      ])
      expect(one.lighting).toBe(false)
      expect(batchDefaults(one).audio).toBe(1)
    }
  })

  it('names an uncategorised rented item rather than leaving the rail blank', () => {
    const [one] = rentedCandidates([
      { id: 1, category_id: 0, name: 'x', quantity_available: 1, price_ex_vat: 0, discontinued: false } as InventoryItem,
    ])
    expect(one.categoryLabel).toBe('Uncategorised')
  })
})
