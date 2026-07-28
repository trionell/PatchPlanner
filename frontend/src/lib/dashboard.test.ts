import { describe, expect, it } from 'vitest'
import { isoDay, partitionEvents, shortDate } from './dashboard'
import type { Event } from '../types'

const TODAY = new Date(2026, 6, 28) // 2026-07-28

function event(id: number, name: string, startDate?: string): Event {
  return { id, name, startDate, created_at: '', updated_at: '', inventoryId: 1 }
}

describe('partitionEvents', () => {
  it('makes the soonest future event the hero', () => {
    const { next, upcoming } = partitionEvents(
      [event(1, 'November', '2026-11-14'), event(2, 'August', '2026-08-14'), event(3, 'October', '2026-10-02')],
      TODAY,
    )
    expect(next?.name).toBe('August')
    expect(upcoming.map((e) => e.name)).toEqual(['October', 'November'])
  })

  it('counts an event happening today as the hero, not as past', () => {
    const { next, past } = partitionEvents([event(1, 'Today', isoDay(TODAY))], TODAY)
    expect(next?.name).toBe('Today')
    expect(past).toHaveLength(0)
  })

  it('never makes an undated event the hero, but keeps it upcoming', () => {
    const { next, upcoming } = partitionEvents([event(1, 'Someday'), event(2, 'Dated', '2026-09-01')], TODAY)
    expect(next?.name).toBe('Dated')
    expect(upcoming.map((e) => e.name)).toEqual(['Someday'])
  })

  it('puts undated events last, name-sorted', () => {
    const { upcoming } = partitionEvents(
      [event(1, 'Zebra'), event(2, 'Apple'), event(3, 'Soon', '2026-08-01'), event(4, 'Later', '2026-09-01')],
      TODAY,
    )
    // 'Soon' is the hero; what remains is the next dated one, then the undated.
    expect(upcoming.map((e) => e.name)).toEqual(['Later', 'Apple', 'Zebra'])
  })

  it('returns no hero when everything is in the past, newest first', () => {
    const { next, upcoming, past } = partitionEvents(
      [event(1, 'March', '2026-03-28'), event(2, 'June', '2026-06-12')],
      TODAY,
    )
    expect(next).toBeUndefined()
    expect(upcoming).toHaveLength(0)
    expect(past.map((e) => e.name)).toEqual(['June', 'March'])
  })

  it('handles an empty account without a hero and without crashing', () => {
    expect(partitionEvents([], TODAY)).toEqual({ next: undefined, upcoming: [], past: [] })
    expect(partitionEvents(undefined, TODAY)).toEqual({ next: undefined, upcoming: [], past: [] })
  })

  it('ignores a timestamp suffix when comparing against today', () => {
    const { next } = partitionEvents([event(1, 'Stamped', '2026-08-14T00:00:00Z')], TODAY)
    expect(next?.name).toBe('Stamped')
  })
})

describe('shortDate', () => {
  it('is fixed-width across months, so the column lines up', () => {
    expect(shortDate('2026-10-02')).toBe('02 Oct')
    expect(shortDate('2026-05-03')).toBe('03 May')
  })

  it('says nothing for an undated event', () => {
    expect(shortDate(undefined)).toBeUndefined()
  })
})
