import { describe, expect, it } from 'vitest'
import {
  eventPhase,
  hasDistinctOnSite,
  isCurrent,
  onSiteDays,
  resolveDates,
  showDays,
} from './eventTimeline'
import type { Event } from '../types'

function event(dates: Partial<Event>): Event {
  return { id: 1, name: 'Test', created_at: '', updated_at: '', inventoryId: 1, ...dates }
}

describe('resolveDates', () => {
  it('makes an event with only a start date one day long', () => {
    const dates = resolveDates(event({ startDate: '2026-08-22' }))!
    expect(dates).toEqual({
      loadIn: '2026-08-22',
      first: '2026-08-22',
      last: '2026-08-22',
      loadOut: '2026-08-22',
    })
    expect(showDays(dates)).toBe(1)
    expect(onSiteDays(dates)).toBe(1)
  })

  it('falls back twice for load-out, to the last show day and not the first', () => {
    // The bug this guards: a single fallback would put load-out on the 18th,
    // silently shortening every multi-day event with no load-out recorded.
    const dates = resolveDates(event({ startDate: '2026-09-18', endDate: '2026-09-20' }))!
    expect(dates.loadOut).toBe('2026-09-20')
    expect(onSiteDays(dates)).toBe(3)
  })

  it('keeps all four when all four are given', () => {
    const dates = resolveDates(
      event({
        loadInDate: '2026-09-17',
        startDate: '2026-09-18',
        endDate: '2026-09-20',
        loadOutDate: '2026-09-21',
      }),
    )!
    expect(showDays(dates)).toBe(3)
    expect(onSiteDays(dates)).toBe(5)
  })

  it('resolves a load-in without an end date', () => {
    const dates = resolveDates(event({ loadInDate: '2026-08-21', startDate: '2026-08-22' }))!
    expect(dates).toEqual({
      loadIn: '2026-08-21',
      first: '2026-08-22',
      last: '2026-08-22',
      loadOut: '2026-08-22',
    })
  })

  it('resolves nothing without a start date', () => {
    expect(resolveDates(event({}))).toBeUndefined()
    // An end date with no start is not enough to place an event in time.
    expect(resolveDates(event({ endDate: '2026-09-20' }))).toBeUndefined()
  })

  it('counts a span crossing a month and a year inclusively', () => {
    expect(showDays(resolveDates(event({ startDate: '2026-12-31', endDate: '2027-01-01' }))!)).toBe(2)
    expect(showDays(resolveDates(event({ startDate: '2026-07-31', endDate: '2026-08-02' }))!)).toBe(3)
  })
})

describe('hasDistinctOnSite', () => {
  it('is false when you arrive and leave on the show days', () => {
    expect(hasDistinctOnSite(resolveDates(event({ startDate: '2026-08-22' }))!)).toBe(false)
    expect(
      hasDistinctOnSite(resolveDates(event({ startDate: '2026-09-18', endDate: '2026-09-20' }))!),
    ).toBe(false)
  })

  it('is true when either end differs', () => {
    expect(
      hasDistinctOnSite(resolveDates(event({ loadInDate: '2026-09-17', startDate: '2026-09-18' }))!),
    ).toBe(true)
    expect(
      hasDistinctOnSite(
        resolveDates(event({ startDate: '2026-09-18', endDate: '2026-09-20', loadOutDate: '2026-09-21' }))!,
      ),
    ).toBe(true)
  })
})

describe('eventPhase', () => {
  const TODAY = '2026-07-28'

  it('is upcoming before load-in', () => {
    expect(eventPhase(event({ startDate: '2026-08-14' }), TODAY)).toBe('upcoming')
  })

  it('is load-in on the load-in day, when that precedes the first show', () => {
    const phase = eventPhase(event({ loadInDate: TODAY, startDate: '2026-07-29' }), TODAY)
    expect(phase).toBe('load-in')
    expect(isCurrent(phase)).toBe(true)
  })

  it('is running on a middle day — the defect this slice repairs', () => {
    // A three-day show on its second morning used to be "past", because the
    // only test was startDate < today.
    const phase = eventPhase(event({ startDate: '2026-07-27', endDate: '2026-07-29' }), TODAY)
    expect(phase).toBe('running')
    expect(isCurrent(phase)).toBe(true)
  })

  it('is running on its last show day', () => {
    expect(eventPhase(event({ startDate: '2026-07-26', endDate: TODAY }), TODAY)).toBe('running')
  })

  it('is running on its load-out day, with no show that day', () => {
    // Using endDate rather than loadOutDate for the past test drops this one
    // off the dashboard on the morning of the strike (research.md R2).
    expect(
      eventPhase(event({ startDate: '2026-07-25', endDate: '2026-07-27', loadOutDate: TODAY }), TODAY),
    ).toBe('running')
  })

  it('is past the day after load-out', () => {
    expect(
      eventPhase(event({ startDate: '2026-07-25', endDate: '2026-07-26', loadOutDate: '2026-07-27' }), TODAY),
    ).toBe('past')
  })

  it('is past for a one-day event yesterday', () => {
    expect(eventPhase(event({ startDate: '2026-07-27' }), TODAY)).toBe('past')
  })

  it('is running, not load-in, when load-in is the first show day', () => {
    // Today is the event's only day. It is running; there is no separate rig
    // day to name.
    expect(eventPhase(event({ startDate: TODAY }), TODAY)).toBe('running')
  })

  it('is undated without a start date', () => {
    const phase = eventPhase(event({}), TODAY)
    expect(phase).toBe('undated')
    expect(isCurrent(phase)).toBe(false)
  })
})
