import { describe, expect, it } from 'vitest'
import { summariseInventories } from './inventoryList'
import type { Inventory } from '../types'

const catalog = (id: number, name: string, extra: Partial<Inventory> = {}): Inventory => ({
  id,
  name,
  createdAt: '2026-01-14T08:22:00Z',
  ...extra,
})

// The quickstart's fixture, as data.
const fixture: Inventory[] = [
  catalog(1, 'Backline & PA', {
    sourceFilename: 'backline-2026.xlsx',
    sourceFormat: 'generic',
    itemCount: 84,
    categoryCount: 6,
    eventCount: 2,
  }),
  catalog(2, 'LL prislista 2025', {
    sourceFilename: 'LL-2025.xlsx',
    sourceFormat: 'll',
    itemCount: 291,
    categoryCount: 12,
  }),
  catalog(3, 'LL prislista 2026', {
    sourceFilename: 'LL-2026.xlsx',
    sourceFormat: 'll',
    itemCount: 308,
    categoryCount: 12,
    eventCount: 9,
  }),
  catalog(4, 'Ljus – Gasklockorna', { itemCount: 47, categoryCount: 4, eventCount: 1 }),
  catalog(5, 'Sandbox', { itemCount: 3, categoryCount: 1 }),
]

describe('summariseInventories', () => {
  it('totals the fixture the way the strip states it', () => {
    const summary = summariseInventories(fixture)

    expect(summary.visible).toHaveLength(5)
    expect(summary.total).toBe(5)
    expect(summary.items).toBe(733)
    expect(summary.events).toBe(12)
    expect(summary.unused).toBe(2)
  })

  it('treats an absent count as zero, because the server omits zeroes', () => {
    const summary = summariseInventories([catalog(9, 'Fresh')])

    expect(summary.items).toBe(0)
    expect(summary.events).toBe(0)
    expect(summary.unused).toBe(1)
  })

  it('returns everything for an empty search', () => {
    expect(summariseInventories(fixture, '   ').visible).toHaveLength(5)
  })

  it('matches by name', () => {
    const summary = summariseInventories(fixture, '2025')

    expect(summary.visible.map((inventory) => inventory.name)).toEqual(['LL prislista 2025'])
    expect(summary.items).toBe(291)
    expect(summary.unused).toBe(1)
  })

  it('matches by the file the catalog was imported from', () => {
    const summary = summariseInventories(fixture, 'backline-2026')

    expect(summary.visible.map((inventory) => inventory.id)).toEqual([1])
  })

  it('is case-insensitive', () => {
    expect(summariseInventories(fixture, 'sandbox').visible.map((i) => i.id)).toEqual([5])
  })

  // The strip says "0 of 5 catalogs", so `total` must survive a search that
  // matches nothing — it is the count of what exists, not of what is drawn.
  it('keeps the total when nothing matches', () => {
    const summary = summariseInventories(fixture, 'zzz')

    expect(summary.visible).toEqual([])
    expect(summary.total).toBe(5)
    expect(summary.items).toBe(0)
    expect(summary.unused).toBe(0)
  })

  it('handles no data at all', () => {
    const summary = summariseInventories(undefined)

    expect(summary).toEqual({ visible: [], total: 0, items: 0, events: 0, unused: 0 })
  })
})
