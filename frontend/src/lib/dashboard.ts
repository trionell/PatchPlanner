import type { Event } from '../types'

/**
 * How the dashboard divides an account's events (Slice 29 US5).
 *
 * The page is a spine of dates rather than a grid of cards, because the date is
 * what you are scanning for — so the partition is the page's whole structure and
 * belongs in a function that can be tested without rendering it.
 */

export interface DashboardEvents {
  /** The hero: the soonest dated event at or after today. */
  next?: Event
  /** Everything else still to come, soonest first, undated last. */
  upcoming: Event[]
  /** Already happened, most recent first. */
  past: Event[]
}

/** `YYYY-MM-DD` in local time, which is the form events store. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function partitionEvents(events: Event[] | undefined, today = new Date()): DashboardEvents {
  const cutoff = isoDay(today)
  const dated: Event[] = []
  const undated: Event[] = []
  for (const event of events ?? []) {
    if (event.startDate) dated.push(event)
    else undated.push(event)
  }

  const future = dated.filter((event) => event.startDate!.slice(0, 10) >= cutoff).sort(byDateAscending)
  const past = dated.filter((event) => event.startDate!.slice(0, 10) < cutoff).sort(byDateDescending)

  // An undated event is never the hero: "the next show" is a claim about when,
  // and an event nobody has dated makes no claim. It still belongs under
  // upcoming, because it has not happened either — just at the end.
  const [next, ...rest] = future
  return {
    next,
    upcoming: [...rest, ...undated.sort((a, b) => a.name.localeCompare(b.name))],
    past,
  }
}

function byDateAscending(a: Event, b: Event): number {
  return a.startDate!.localeCompare(b.startDate!)
}

function byDateDescending(a: Event, b: Event): number {
  return b.startDate!.localeCompare(a.startDate!)
}

/** `02 Oct` — short, and the same width for every month, so the column lines up. */
export function shortDate(date?: string): string | undefined {
  if (!date) return undefined
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/** `Saturday 14 August 2026`, for the hero, where there is room to write it out. */
export function longDate(date?: string): string | undefined {
  if (!date) return undefined
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
