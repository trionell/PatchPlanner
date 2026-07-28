import { describe, expect, it } from 'vitest'
import { formatEventDates, isoDay, partitionEvents, shortDate } from './dashboard'
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

  it('counts an event happening today as running, not as past', () => {
    // Slice 30 moved this out of `next` and into `running`: a show you are
    // standing in is not something you are counting down to.
    const { running, next, past } = partitionEvents([event(1, 'Today', isoDay(TODAY))], TODAY)
    expect(running.map((e) => e.name)).toEqual(['Today'])
    expect(next).toBeUndefined()
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
    expect(partitionEvents([], TODAY)).toEqual({ running: [], next: undefined, upcoming: [], past: [] })
    expect(partitionEvents(undefined, TODAY)).toEqual({ running: [], next: undefined, upcoming: [], past: [] })
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

describe('partitionEvents with multi-day events', () => {
  const TODAY = new Date(2026, 6, 28) // 2026-07-28

  function span(name: string, dates: Partial<Event>): Event {
    return { id: 1, name, created_at: '', updated_at: '', inventoryId: 1, ...dates }
  }

  it('keeps a three-day show running on its second morning', () => {
    // The defect this slice repairs. With only a start date, the old test
    // (startDate < today) called this past while the user was in the venue.
    const { running, past } = partitionEvents(
      [span('Sommarscen', { startDate: '2026-07-27', endDate: '2026-07-29' })],
      TODAY,
    )
    expect(running.map((e) => e.name)).toEqual(['Sommarscen'])
    expect(past).toHaveLength(0)
  })

  it('keeps it running on its last show day', () => {
    const { running } = partitionEvents(
      [span('Sommarscen', { startDate: '2026-07-26', endDate: '2026-07-28' })],
      TODAY,
    )
    expect(running).toHaveLength(1)
  })

  it('keeps it running on its load-out day, with no show that day', () => {
    // Using endDate for the past test drops this on the morning of the strike.
    const { running, past } = partitionEvents(
      [span('Bruksrock', { startDate: '2026-07-25', endDate: '2026-07-27', loadOutDate: '2026-07-28' })],
      TODAY,
    )
    expect(running).toHaveLength(1)
    expect(past).toHaveLength(0)
  })

  it('makes it past the day after load-out', () => {
    const { running, past } = partitionEvents(
      [span('Bruksrock', { startDate: '2026-07-25', endDate: '2026-07-26', loadOutDate: '2026-07-27' })],
      TODAY,
    )
    expect(running).toHaveLength(0)
    expect(past).toHaveLength(1)
  })

  it('counts a load-in day as running, before any show has happened', () => {
    const { running, next } = partitionEvents(
      [span('Kulturnatt', { loadInDate: '2026-07-28', startDate: '2026-07-29', endDate: '2026-07-31' })],
      TODAY,
    )
    expect(running.map((e) => e.name)).toEqual(['Kulturnatt'])
    expect(next).toBeUndefined()
  })

  it('leaves an event still upcoming the day before its load-in', () => {
    const { running, next } = partitionEvents(
      [span('Kulturnatt', { loadInDate: '2026-07-29', startDate: '2026-07-30' })],
      TODAY,
    )
    expect(running).toHaveLength(0)
    expect(next?.name).toBe('Kulturnatt')
  })

  it('never puts an undated event in running, next or past', () => {
    const { running, next, upcoming, past } = partitionEvents([span('Skiss', {})], TODAY)
    expect(running).toHaveLength(0)
    expect(next).toBeUndefined()
    expect(past).toHaveLength(0)
    expect(upcoming.map((e) => e.name)).toEqual(['Skiss'])
  })

  it('orders several running events soonest first', () => {
    const { running } = partitionEvents(
      [
        span('Later', { startDate: '2026-07-28', endDate: '2026-07-30' }),
        span('Earlier', { startDate: '2026-07-26', endDate: '2026-07-29' }),
      ],
      TODAY,
    )
    expect(running.map((e) => e.name)).toEqual(['Earlier', 'Later'])
  })
})

describe('formatEventDates', () => {
  function span(dates: Partial<Event>): Event {
    return { id: 1, name: 'Test', created_at: '', updated_at: '', inventoryId: 1, ...dates }
  }

  it('collapses a one-day event rather than repeating itself', () => {
    const { short, long, onSite } = formatEventDates(span({ startDate: '2026-08-22' }))
    expect(short).toBe('22 Aug')
    expect(long).toBe('Sat 22 August 2026')
    expect(onSite).toBeUndefined()
  })

  it('writes a range within one month without repeating the month', () => {
    const { short, long } = formatEventDates(span({ startDate: '2026-09-18', endDate: '2026-09-20' }))
    expect(short).toBe('18–20 Sep')
    expect(long).toBe('Fri 18 – Sun 20 September 2026')
  })

  it('keeps both months when a range crosses one', () => {
    const { short, long } = formatEventDates(span({ startDate: '2026-07-31', endDate: '2026-08-02' }))
    expect(short).toBe('31–02 Aug')
    expect(long).toBe('Fri 31 July – Sun 2 August 2026')
  })

  it('states the on-site span only when it differs from the show span', () => {
    expect(formatEventDates(span({ startDate: '2026-09-18', endDate: '2026-09-20' })).onSite).toBeUndefined()
    expect(
      formatEventDates(
        span({ loadInDate: '2026-09-17', startDate: '2026-09-18', endDate: '2026-09-20', loadOutDate: '2026-09-21' }),
      ).onSite,
    ).toBe('17–21 Sep')
  })

  it('returns nothing for an undated event', () => {
    expect(formatEventDates(span({}))).toEqual({})
    expect(formatEventDates(undefined)).toEqual({})
  })
})
