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
