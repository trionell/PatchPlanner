import { describe, expect, it } from 'vitest'
import {
  buildTimeline,
  countdownLabel,
  dateOrderError,
  findCollisions,
  type TimelineEventRow,
  type TimelineHeading,
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

describe('dateOrderError', () => {
  it('accepts an event with no dates, and one with only a first day', () => {
    expect(dateOrderError({})).toBeUndefined()
    expect(dateOrderError({ startDate: '2026-08-22' })).toBeUndefined()
  })

  it('accepts four dates in order, including four equal ones', () => {
    expect(
      dateOrderError({
        loadInDate: '2026-09-17',
        startDate: '2026-09-18',
        endDate: '2026-09-20',
        loadOutDate: '2026-09-21',
      }),
    ).toBeUndefined()
    expect(
      dateOrderError({
        loadInDate: '2026-09-18',
        startDate: '2026-09-18',
        endDate: '2026-09-18',
        loadOutDate: '2026-09-18',
      }),
    ).toBeUndefined()
  })

  it('asks for a first day when any other date is set without one', () => {
    expect(dateOrderError({ endDate: '2026-09-20' })).toMatch(/first day/i)
  })

  it('names the pair that is wrong', () => {
    expect(dateOrderError({ loadInDate: '2026-09-19', startDate: '2026-09-18' })).toMatch(/Load-in/)
    expect(dateOrderError({ startDate: '2026-09-18', endDate: '2026-09-16' })).toMatch(/last day/)
    expect(
      dateOrderError({ startDate: '2026-09-18', endDate: '2026-09-20', loadOutDate: '2026-09-19' }),
    ).toMatch(/Load-out/)
  })

  it('catches a load-out before the start when there is no end date — the double fallback', () => {
    expect(dateOrderError({ startDate: '2026-09-18', loadOutDate: '2026-09-17' })).toMatch(/Load-out/)
  })

  it('reports only the chronologically earliest broken pair', () => {
    // Both loadIn > start and end < start are wrong here. One mistyped year
    // breaks everything downstream of it; four messages is noise.
    expect(
      dateOrderError({ loadInDate: '2026-09-19', startDate: '2026-09-18', endDate: '2026-09-01' }),
    ).toMatch(/Load-in/)
  })
})

describe('buildTimeline', () => {
  const TODAY = '2026-07-28'

  function ev(id: number, name: string, dates: Partial<Event> = {}): Event {
    return { id, name, created_at: '', updated_at: '', inventoryId: 1, ...dates }
  }

  const rows = (t: ReturnType<typeof buildTimeline>) =>
    t.items.filter((i): i is TimelineEventRow => i.kind === 'event')
  const headings = (t: ReturnType<typeof buildTimeline>, kind: TimelineHeading['kind']) =>
    t.items.filter((i): i is TimelineHeading => i.kind === kind)
  const kinds = (t: ReturnType<typeof buildTimeline>) => t.items.map((i) => i.kind)

  it('orders oldest first — reading down is moving forward', () => {
    const timeline = buildTimeline(
      [
        ev(1, 'November', { startDate: '2026-11-14' }),
        ev(2, 'Last year', { startDate: '2025-08-16' }),
        ev(3, 'August', { startDate: '2026-08-14' }),
      ],
      { today: TODAY },
    )
    expect(rows(timeline).map((r) => r.event.name)).toEqual(['Last year', 'August', 'November'])
  })

  it('groups under year and month headings, counting the rows beneath each month', () => {
    const timeline = buildTimeline(
      [
        ev(1, 'A', { startDate: '2026-09-04' }),
        ev(2, 'B', { startDate: '2026-09-18' }),
        ev(3, 'C', { startDate: '2026-11-14' }),
      ],
      { today: TODAY },
    )
    expect(headings(timeline, 'month').map((m) => [m.label, m.count])).toEqual([
      ['Sep', 2],
      ['Nov', 1],
    ])
    expect(headings(timeline, 'year')).toHaveLength(1)
  })

  it('files a span crossing a month under its first show day', () => {
    const timeline = buildTimeline([ev(1, 'Nyår', { startDate: '2026-07-31', endDate: '2026-08-02' })], {
      today: TODAY,
    })
    expect(headings(timeline, 'month').map((m) => m.label)).toEqual(['Jul'])
  })

  it('files a span crossing a year under its start year, once', () => {
    const timeline = buildTimeline([ev(1, 'Nyår', { startDate: '2026-12-31', endDate: '2027-01-01' })], {
      today: TODAY,
    })
    expect(headings(timeline, 'year').map((y) => y.label)).toEqual(['2026'])
    expect(rows(timeline)).toHaveLength(1)
  })

  it('puts the today rule between the last started event and the first upcoming one', () => {
    const timeline = buildTimeline(
      [
        ev(1, 'Past', { startDate: '2026-07-11' }),
        ev(2, 'Running', { startDate: '2026-07-27', endDate: '2026-07-29' }),
        ev(3, 'Upcoming', { startDate: '2026-08-14' }),
      ],
      { today: TODAY },
    )
    const order = kinds(timeline)
    const todayAt = order.indexOf('today')
    const names = timeline.items.map((i) => (i.kind === 'event' ? i.event.name : i.kind))
    expect(names.indexOf('Running')).toBeLessThan(todayAt)
    expect(names.indexOf('Upcoming')).toBeGreaterThan(todayAt)
  })

  it('still places the today rule when everything is in the past', () => {
    const timeline = buildTimeline([ev(1, 'Past', { startDate: '2026-07-11' })], { today: TODAY })
    expect(kinds(timeline)).toContain('today')
    expect(kinds(timeline).indexOf('today')).toBe(kinds(timeline).length - 1)
  })

  it('marks exactly one row as next, skipping anything already running', () => {
    const timeline = buildTimeline(
      [
        ev(1, 'Running', { startDate: '2026-07-27', endDate: '2026-07-29' }),
        ev(2, 'Soonest', { startDate: '2026-08-14' }),
        ev(3, 'Later', { startDate: '2026-09-18' }),
      ],
      { today: TODAY },
    )
    expect(rows(timeline).filter((r) => r.isNext).map((r) => r.event.name)).toEqual(['Soonest'])
  })

  it('lists undated events last, under their own heading', () => {
    const timeline = buildTimeline(
      [ev(1, 'Skiss', {}), ev(2, 'Dated', { startDate: '2026-08-14' })],
      { today: TODAY },
    )
    const names = rows(timeline).map((r) => r.event.name)
    expect(names).toEqual(['Dated', 'Skiss'])
    expect(kinds(timeline)).toContain('undated')
    expect(kinds(timeline).indexOf('undated')).toBeGreaterThan(kinds(timeline).indexOf('today'))
  })

  it('filters by tense, and drops undated events from the past view', () => {
    const events = [
      ev(1, 'Past', { startDate: '2026-07-11' }),
      ev(2, 'Upcoming', { startDate: '2026-08-14' }),
      ev(3, 'Skiss', {}),
    ]
    expect(rows(buildTimeline(events, { today: TODAY, tense: 'past' })).map((r) => r.event.name)).toEqual(['Past'])
    expect(rows(buildTimeline(events, { today: TODAY, tense: 'upcoming' })).map((r) => r.event.name)).toEqual([
      'Upcoming',
      'Skiss',
    ])
  })

  it('counts what is listed, so a search narrows the strip too', () => {
    const events = [
      ev(1, 'Gävle', { startDate: '2026-07-11' }),
      ev(2, 'Falun', { startDate: '2026-08-14' }),
      ev(3, 'Skiss', {}),
    ]
    const all = buildTimeline(events, { today: TODAY })
    expect(all.counts).toEqual({ total: 3, running: 0, toCome: 1, done: 1, undated: 1 })

    const searched = buildTimeline(events, { today: TODAY, matches: (e) => e.name === 'Gävle' })
    expect(searched.counts).toEqual({ total: 1, running: 0, toCome: 0, done: 1, undated: 0 })
  })

  it('lists the years that have events, ascending and unique', () => {
    const timeline = buildTimeline(
      [
        ev(1, 'A', { startDate: '2026-09-04' }),
        ev(2, 'B', { startDate: '2025-08-16' }),
        ev(3, 'C', { startDate: '2026-11-14' }),
        ev(4, 'Skiss', {}),
      ],
      { today: TODAY },
    )
    expect(timeline.years).toEqual([2025, 2026])
  })
})

describe('countdownLabel', () => {
  const TODAY = '2026-07-28'
  const ev = (dates: Partial<Event>): Event => ({
    id: 1, name: 'T', created_at: '', updated_at: '', inventoryId: 1, ...dates,
  })

  it('counts days up to a month', () => {
    expect(countdownLabel(ev({ startDate: '2026-08-14' }), TODAY)).toBe('in 17 d')
    expect(countdownLabel(ev({ startDate: '2026-08-22' }), TODAY)).toBe('in 25 d')
  })

  it('counts weeks between a month and two', () => {
    expect(countdownLabel(ev({ startDate: '2026-09-05' }), TODAY)).toBe('in 5 wk')
    expect(countdownLabel(ev({ startDate: '2026-09-18' }), TODAY)).toBe('in 7 wk')
  })

  it('counts months beyond that', () => {
    expect(countdownLabel(ev({ startDate: '2026-11-14' }), TODAY)).toBe('in 4 mo')
  })

  it('counts to load-in, not to the first show day', () => {
    expect(countdownLabel(ev({ loadInDate: '2026-08-13', startDate: '2026-08-14' }), TODAY)).toBe('in 16 d')
  })

  it('says on now while the show is running or rigging', () => {
    expect(countdownLabel(ev({ startDate: '2026-07-27', endDate: '2026-07-29' }), TODAY)).toBe('on now')
    expect(countdownLabel(ev({ loadInDate: TODAY, startDate: '2026-07-30' }), TODAY)).toBe('on now')
  })

  it('measures a past event from its load-out', () => {
    expect(countdownLabel(ev({ startDate: '2026-07-11' }), TODAY)).toBe('17 d ago')
    expect(countdownLabel(ev({ startDate: '2025-08-16' }), TODAY)).toBe('11 mo ago')
  })

  it('says nothing for an undated event', () => {
    expect(countdownLabel(ev({}), TODAY)).toBeUndefined()
  })
})

describe('findCollisions', () => {
  const ev = (id: number, name: string, dates: Partial<Event> = {}): Event => ({
    id, name, created_at: '', updated_at: '', inventoryId: 1, ...dates,
  })

  it('calls it an overlap when the show spans intersect', () => {
    const { byEventId, groups } = findCollisions([
      ev(1, 'Kulturnatt', { loadInDate: '2026-09-03', startDate: '2026-09-04', endDate: '2026-09-06' }),
      ev(2, 'Höstsalongen', { startDate: '2026-09-05' }),
    ])
    expect(groups).toBe(1)
    expect(byEventId.get(1)?.kind).toBe('overlap')
    expect(byEventId.get(2)?.kind).toBe('overlap')
    expect(byEventId.get(1)?.groupId).toBe(byEventId.get(2)?.groupId)
  })

  it('calls it an on-site clash when only the on-site spans meet', () => {
    // The case a date range alone cannot represent: Företagsfest is one evening
    // on the 17th and Bruksrock's first band plays on the 18th. On show dates
    // they do not touch. On the ground you are in Avesta rigging on the 17th.
    const { byEventId, groups } = findCollisions([
      ev(1, 'Företagsfest', { startDate: '2026-09-17' }),
      ev(2, 'Bruksrock', {
        loadInDate: '2026-09-17', startDate: '2026-09-18',
        endDate: '2026-09-20', loadOutDate: '2026-09-21',
      }),
    ])
    expect(groups).toBe(1)
    expect(byEventId.get(1)?.kind).toBe('on-site-clash')
    expect(byEventId.get(2)?.kind).toBe('on-site-clash')
  })

  it('finds nothing when the on-site spans are merely adjacent', () => {
    const { byEventId, groups } = findCollisions([
      ev(1, 'First', { startDate: '2026-09-17' }),
      ev(2, 'Second', { startDate: '2026-09-18' }),
    ])
    expect(groups).toBe(0)
    expect(byEventId.size).toBe(0)
  })

  it('puts three mutually touching events in one group, on three lanes', () => {
    const { byEventId, laneByEventId, groups } = findCollisions([
      ev(1, 'A', { startDate: '2026-09-04', endDate: '2026-09-08' }),
      ev(2, 'B', { startDate: '2026-09-05', endDate: '2026-09-07' }),
      ev(3, 'C', { startDate: '2026-09-06' }),
    ])
    expect(groups).toBe(1)
    expect(new Set([byEventId.get(1)?.groupId, byEventId.get(2)?.groupId, byEventId.get(3)?.groupId]).size).toBe(1)
    expect(new Set([laneByEventId.get(1), laneByEventId.get(2), laneByEventId.get(3)])).toEqual(new Set([0, 1, 2]))
  })

  it('reuses a lane once its occupant has finished', () => {
    const { laneByEventId } = findCollisions([
      ev(1, 'A', { startDate: '2026-09-04', endDate: '2026-09-05' }),
      ev(2, 'B', { startDate: '2026-09-05', endDate: '2026-09-06' }),
      ev(3, 'C', { startDate: '2026-09-20' }),
    ])
    expect(laneByEventId.get(1)).toBe(0)
    expect(laneByEventId.get(2)).toBe(1)
    // Nothing is open by the 20th, so C is back on lane 0.
    expect(laneByEventId.get(3)).toBe(0)
  })

  it('counts separate collisions as separate groups', () => {
    const { groups } = findCollisions([
      ev(1, 'A', { startDate: '2026-09-04', endDate: '2026-09-06' }),
      ev(2, 'B', { startDate: '2026-09-05' }),
      ev(3, 'C', { startDate: '2026-11-14', endDate: '2026-11-16' }),
      ev(4, 'D', { startDate: '2026-11-15' }),
    ])
    expect(groups).toBe(2)
  })

  it('never collides an undated event', () => {
    const { byEventId, groups } = findCollisions([
      ev(1, 'Skiss', {}),
      ev(2, 'Another skiss', {}),
      ev(3, 'Dated', { startDate: '2026-09-04' }),
    ])
    expect(groups).toBe(0)
    expect(byEventId.size).toBe(0)
  })

  it('ignores the user role entirely — a viewer event collides like an owned one', () => {
    const { byEventId } = findCollisions([
      ev(1, 'Mine', { startDate: '2026-09-04', endDate: '2026-09-06' }),
      { ...ev(2, 'Theirs', { startDate: '2026-09-05' }), yourRole: 'viewer' },
    ])
    expect(byEventId.get(2)?.kind).toBe('overlap')
  })

  it('reports overlaps for an event that both overlaps and merely clashes', () => {
    const { byEventId } = findCollisions([
      ev(1, 'Long', { loadInDate: '2026-09-01', startDate: '2026-09-04', endDate: '2026-09-08' }),
      ev(2, 'Overlapping show', { startDate: '2026-09-05' }),
      ev(3, 'Rig-day only', { startDate: '2026-09-02' }),
    ])
    expect(byEventId.get(1)?.kind).toBe('overlap')
    expect(byEventId.get(3)?.kind).toBe('on-site-clash')
  })

  it('gives every dated event a lane, colliding or not', () => {
    const { laneByEventId } = findCollisions([
      ev(1, 'Alone', { startDate: '2026-03-21' }),
      ev(2, 'Also alone', { startDate: '2026-05-09' }),
    ])
    expect(laneByEventId.get(1)).toBe(0)
    expect(laneByEventId.get(2)).toBe(0)
  })
})
