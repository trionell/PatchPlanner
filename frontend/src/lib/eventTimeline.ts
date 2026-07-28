import type { Event } from '../types'

/**
 * The Events page's whole structure, as pure functions (Slice 30).
 *
 * Everything the timeline draws — where a row sits, how long an event is,
 * which two events collide, where a mark lands on the year track — is derived
 * here and tested without rendering anything. That is the same shape
 * `lib/dashboard.ts` and `lib/eventSummary.ts` take, and for the same reason:
 * the interesting part of this page is not its markup.
 *
 * **Dates are compared as strings throughout.** Every date in the system is a
 * `YYYY-MM-DD` calendar day with no time and no zone, and ISO dates sort
 * lexicographically, so `a < b` is a correct date comparison and needs no
 * parsing. `lib/dashboard.ts` has relied on this since Slice 29.
 */

/* ------------------------------------------------------------------ dates */

export interface ResolvedDates {
  /** When you arrive. */
  loadIn: string
  /** The first show day — the date the event is known by. */
  first: string
  /** The last show day. */
  last: string
  /** When you leave. */
  loadOut: string
}

/**
 * Fill the chain. An absent value takes its neighbour's.
 *
 * `loadOut` falls back **twice** — to the last show day, and only then to the
 * first. An event with an end date but no load-out loads out on its last show
 * day, not on its first; a single fallback silently shortens every multi-day
 * event whose owner did not fill in load-out.
 *
 * An event with no `startDate` resolves to nothing: it has not been placed in
 * time, so it participates in no comparison, no collision and no bucket.
 */
export function resolveDates(event: Pick<Event, 'loadInDate' | 'startDate' | 'endDate' | 'loadOutDate'>):
  | ResolvedDates
  | undefined {
  const first = day(event.startDate)
  if (!first) return undefined
  const last = day(event.endDate) ?? first
  return {
    loadIn: day(event.loadInDate) ?? first,
    first,
    last,
    loadOut: day(event.loadOutDate) ?? last,
  }
}

/** `YYYY-MM-DD`, tolerating the `…T00:00:00Z` form the API has never sent but a user could paste. */
function day(value?: string): string | undefined {
  const trimmed = value?.slice(0, 10)
  return trimmed ? trimmed : undefined
}

/** Inclusive day count. A one-day event is 1, never 0. */
export function daysBetweenInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00`)
  const end = Date.parse(`${to}T00:00:00`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 1
  return Math.round((end - start) / 86_400_000) + 1
}

/** How many days the show itself runs. */
export function showDays(dates: ResolvedDates): number {
  return daysBetweenInclusive(dates.first, dates.last)
}

/** How many days you are at the venue, load-in to load-out. */
export function onSiteDays(dates: ResolvedDates): number {
  return daysBetweenInclusive(dates.loadIn, dates.loadOut)
}

/**
 * Whether the on-site span says anything the show span does not.
 *
 * This is what decides whether a row states an on-site range at all: an event
 * you arrive at and leave on its show days has nothing to add, and a chip
 * repeating the dates already in the gutter is noise.
 */
export function hasDistinctOnSite(dates: ResolvedDates): boolean {
  return dates.loadIn !== dates.first || dates.loadOut !== dates.last
}

/* ------------------------------------------------------------------ state */

export type EventPhase = 'upcoming' | 'load-in' | 'running' | 'past' | 'undated'

/**
 * Where an event sits relative to today.
 *
 * `load-in` is a labelling refinement of `running`, not a fifth bucket — both
 * mean *current*. The distinction exists only so a countdown can say something
 * true on rig day.
 *
 * The past test uses **load-out**, not the last show day. An event whose last
 * band played last night and whose truck loads out this morning is not
 * something the application should have stopped talking about.
 */
export function eventPhase(event: Event, todayIso: string): EventPhase {
  const dates = resolveDates(event)
  if (!dates) return 'undated'
  if (todayIso > dates.loadOut) return 'past'
  if (todayIso < dates.loadIn) return 'upcoming'
  if (todayIso === dates.loadIn && dates.loadIn < dates.first) return 'load-in'
  return 'running'
}

/** True for both `running` and `load-in` — the two phases that mean *current*. */
export function isCurrent(phase: EventPhase): boolean {
  return phase === 'running' || phase === 'load-in'
}

/* ------------------------------------------------------------- validation */

/**
 * The same ordering rule the server enforces, worded for a person looking at
 * four date fields.
 *
 * Reports only the chronologically earliest broken pair: one mistyped year
 * breaks every comparison downstream of it, and four messages about one typo is
 * noise rather than detail. Named in the same order as the fields, so the
 * message says which two boxes to look at.
 */
export function dateOrderError(values: {
  loadInDate?: string
  startDate?: string
  endDate?: string
  loadOutDate?: string
}): string | undefined {
  if (!values.startDate) {
    if (values.loadInDate || values.endDate || values.loadOutDate) {
      return 'Set a first day before the others.'
    }
    return undefined
  }
  const dates = resolveDates(values)!
  if (dates.loadIn > dates.first) return 'Load-in must not be after the first day.'
  if (dates.last < dates.first) return 'The last day must not be before the first day.'
  if (dates.loadOut < dates.last) return 'Load-out must not be before the last day.'
  return undefined
}

/* --------------------------------------------------------------- the page */

export type TimelineTense = 'all' | 'upcoming' | 'past'

export interface TimelineEventRow {
  kind: 'event'
  event: Event
  phase: EventPhase
  /** The soonest event that has not started. Exactly one row per page carries it. */
  isNext: boolean
}

export interface TimelineHeading {
  kind: 'year' | 'month' | 'undated'
  label: string
  /** How many event rows sit under this heading. Absent on a year. */
  count?: number
  /** Stable anchor, so the year track can scroll to a month. */
  anchor: string
}

export interface TimelineTodayRule {
  kind: 'today'
}

export type TimelineItem = TimelineEventRow | TimelineHeading | TimelineTodayRule

export interface TimelineCounts {
  total: number
  running: number
  toCome: number
  done: number
  undated: number
}

export interface Timeline {
  items: TimelineItem[]
  counts: TimelineCounts
  /** Every year that has an event, ascending — what the year track may step between. */
  years: number[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The Events page's whole structure: rows, headings, and where today falls.
 *
 * **Strictly chronological, oldest first.** Reading down is moving forward.
 * The first draft put the future above the today rule ascending and the past
 * below it descending, which placed the two events nearest today at opposite
 * ends of the page — and needed a special case for an event that is running,
 * since it belongs on both sides of the rule. Chronological order needs none:
 * a running event sorts to exactly where the rule goes.
 *
 * **Undated events sit last**, after time, because they have not been placed in
 * it. Putting them first — as a "these are drafts you just made" bucket — is a
 * claim on a chronological spine that they happened before the oldest event.
 *
 * The counts describe **what is listed**, not what the account holds, so a
 * search narrows them too and the strip can never disagree with the rows above
 * it.
 */
export function buildTimeline(
  events: Event[] | undefined,
  options: { today: string; tense?: TimelineTense; matches?: (event: Event) => boolean },
): Timeline {
  const tense = options.tense ?? 'all'
  const dated: { event: Event; dates: ResolvedDates; phase: EventPhase }[] = []
  const undated: Event[] = []

  for (const event of events ?? []) {
    if (options.matches && !options.matches(event)) continue
    const dates = resolveDates(event)
    if (!dates) {
      if (tense !== 'past') undated.push(event)
      continue
    }
    const phase = eventPhase(event, options.today)
    if (tense === 'upcoming' && phase === 'past') continue
    if (tense === 'past' && phase !== 'past') continue
    dated.push({ event, dates, phase })
  }

  dated.sort((a, b) => a.dates.first.localeCompare(b.dates.first) || a.event.name.localeCompare(b.event.name))
  undated.sort((a, b) => a.name.localeCompare(b.name))

  // The next show is the soonest that has not started — not merely the first
  // future row, since a running event sorts before it.
  const nextId = dated.find((entry) => entry.phase === 'upcoming')?.event.id

  const items: TimelineItem[] = []
  const counts: TimelineCounts = { total: 0, running: 0, toCome: 0, done: 0, undated: undated.length }
  let year = ''
  let month = ''
  let todayPlaced = tense !== 'all'

  for (const entry of dated) {
    // Today cuts in before the first row that has not started yet, which puts
    // it after everything past and everything currently running.
    if (!todayPlaced && entry.phase === 'upcoming') {
      items.push({ kind: 'today' })
      todayPlaced = true
    }

    const entryYear = entry.dates.first.slice(0, 4)
    const entryMonth = entry.dates.first.slice(0, 7)
    if (entryYear !== year) {
      year = entryYear
      month = ''
      items.push({ kind: 'year', label: entryYear, anchor: `y-${entryYear}` })
    }
    if (entryMonth !== month) {
      month = entryMonth
      items.push({
        kind: 'month',
        label: MONTHS[Number(entryMonth.slice(5, 7)) - 1],
        count: dated.filter((other) => other.dates.first.slice(0, 7) === entryMonth).length,
        anchor: `m-${entryMonth}`,
      })
    }

    items.push({ kind: 'event', event: entry.event, phase: entry.phase, isNext: entry.event.id === nextId })
    counts.total += 1
    if (entry.phase === 'past') counts.done += 1
    else if (isCurrent(entry.phase)) counts.running += 1
    else counts.toCome += 1
  }

  // Everything is in the past: the rule still belongs on the page, at the end.
  if (!todayPlaced) items.push({ kind: 'today' })

  if (undated.length > 0) {
    items.push({ kind: 'undated', label: 'No date', count: undated.length, anchor: 'undated' })
    for (const event of undated) {
      items.push({ kind: 'event', event, phase: 'undated', isNext: false })
    }
  }
  counts.total += undated.length

  const years = [...new Set((events ?? []).map((e) => resolveDates(e)?.first.slice(0, 4)).filter(Boolean))]
    .map(Number)
    .sort((a, b) => a - b)

  return { items, counts, years }
}

/** `in 17 d`, `in 5 wk`, `in 4 mo`, `on now`, `17 d ago`. */
export function countdownLabel(event: Event, todayIso: string): string | undefined {
  const dates = resolveDates(event)
  if (!dates) return undefined
  const phase = eventPhase(event, todayIso)
  if (isCurrent(phase)) return 'on now'
  const target = phase === 'past' ? dates.loadOut : dates.loadIn
  const days = Math.abs(daysBetweenInclusive(todayIso, target) - 1)
  const suffix = phase === 'past' ? ' ago' : ''
  const prefix = phase === 'past' ? '' : 'in '
  // Days up to a month, then weeks up to two, then months. Weeks floor and
  // months round: "in 5 wk" should never arrive early, but "in 3 mo" reading
  // 2 would be needlessly pessimistic at that distance.
  if (days <= 28) return `${prefix}${days} d${suffix}`
  if (days <= 56) return `${prefix}${Math.floor(days / 7)} wk${suffix}`
  return `${prefix}${Math.round(days / 30.44)} mo${suffix}`
}
