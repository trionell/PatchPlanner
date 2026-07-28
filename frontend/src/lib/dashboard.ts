import { resolveDates } from './eventTimeline'
import type { Event } from '../types'

/**
 * How the dashboard divides an account's events (Slice 29 US5, extended in
 * Slice 30).
 *
 * The page is a spine of dates rather than a grid of cards, because the date is
 * what you are scanning for — so the partition is the page's whole structure and
 * belongs in a function that can be tested without rendering it.
 */

export interface DashboardEvents {
  /**
   * Happening right now: today falls between load-in and load-out. Soonest
   * first.
   *
   * This bucket is Slice 30's defect fix. Before it, an event was past the
   * moment its single date was behind today, so a three-day festival vanished
   * from the dashboard on its second morning — while the user was standing in
   * the venue working it.
   */
  running: Event[]
  /** The hero when nothing is running: the soonest event that has not started. */
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
  const running: Event[] = []
  const future: Event[] = []
  const past: Event[] = []
  const undated: Event[] = []

  for (const event of events ?? []) {
    const dates = resolveDates(event)
    if (!dates) {
      undated.push(event)
      continue
    }
    // Past is decided by LOAD-OUT, not by the last show day. An event whose
    // last band played last night and whose truck loads out this morning is
    // not something the dashboard should have stopped talking about
    // (research.md R2).
    if (cutoff > dates.loadOut) past.push(event)
    else if (cutoff >= dates.loadIn) running.push(event)
    else future.push(event)
  }

  running.sort(byStartAscending)
  future.sort(byStartAscending)
  past.sort(byStartDescending)

  // An undated event is never the hero: "the next show" is a claim about when,
  // and an event nobody has dated makes no claim. It still belongs under
  // upcoming, because it has not happened either — just at the end.
  const [next, ...rest] = future
  return {
    running,
    next,
    upcoming: [...rest, ...undated.sort((a, b) => a.name.localeCompare(b.name))],
    past,
  }
}

function byStartAscending(a: Event, b: Event): number {
  return a.startDate!.localeCompare(b.startDate!)
}

function byStartDescending(a: Event, b: Event): number {
  return b.startDate!.localeCompare(a.startDate!)
}

/* -------------------------------------------------------------- formatting */

/**
 * Month and weekday names are tabulated rather than taken from
 * `toLocaleDateString`, because the column has to line up.
 *
 * `shortDate` has claimed since Slice 29 to be "the same width for every month,
 * so the column lines up", and `en-GB` under a current ICU renders September as
 * **`Sept`** — four characters where every other month is three, in a date
 * gutter whose whole job is being scannable. The same ICU puts a comma after
 * the weekday in the long form. Both are reasonable choices for prose and wrong
 * for this, and neither is stable across Node and browser ICU builds.
 */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parse(date: string): Date | undefined {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** `02 Oct` — two-digit day so the column is a fixed width. */
function shortOf(date: Date): string {
  return `${twoDigit(date)} ${MONTHS_SHORT[date.getMonth()]}`
}

/** `Sat 22 August 2026`. */
function longOf(date: Date): string {
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
}

export interface FormattedEventDates {
  /** `18–20 Sep`, or `22 Aug` for a one-day event. */
  short?: string
  /** `Fri 18 – Sun 20 September 2026`, for headings with room to write it out. */
  long?: string
  /**
   * `17–21 Sep` — present **only** when the on-site span says something the
   * show span does not, so a caller can render it without deciding whether it
   * is worth rendering.
   */
  onSite?: string
}

/**
 * An event's show dates, in the forms the application needs.
 *
 * One function, because four surfaces render this — the dashboard, the event
 * heading, Overview and the print sheet — and a date range is exactly the kind
 * of thing four independent implementations get subtly different. It replaces
 * `longDate` and `OverviewTab`'s private `formatEventDate`.
 *
 * A one-day event collapses to a single date rather than repeating itself.
 */
export function formatEventDates(event: Event | undefined): FormattedEventDates {
  const dates = event ? resolveDates(event) : undefined
  if (!dates) return {}
  const first = parse(dates.first)
  const last = parse(dates.last)
  if (!first || !last) return {}

  const sameDay = dates.first === dates.last
  return {
    short: sameDay ? shortOf(first) : `${twoDigit(first)}–${shortOf(last)}`,
    long: sameDay ? longOf(first) : `${openingOf(first, last)} – ${longOf(last)}`,
    onSite: onSiteRange(dates),
  }
}

/**
 * The opening date of a range drops the month when both ends share one —
 * `Fri 18 – Sun 20 September 2026`, not `Fri 18 September – Sun 20 September
 * 2026` — and keeps it when they do not.
 */
function openingOf(first: Date, last: Date): string {
  const opening = `${WEEKDAYS_SHORT[first.getDay()]} ${first.getDate()}`
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
  return sameMonth ? opening : `${opening} ${MONTHS_LONG[first.getMonth()]}`
}

function onSiteRange(dates: { loadIn: string; first: string; last: string; loadOut: string }): string | undefined {
  if (dates.loadIn === dates.first && dates.loadOut === dates.last) return undefined
  const from = parse(dates.loadIn)
  const to = parse(dates.loadOut)
  if (!from || !to) return undefined
  return dates.loadIn === dates.loadOut ? shortOf(from) : `${twoDigit(from)}–${shortOf(to)}`
}

function twoDigit(date: Date): string {
  return String(date.getDate()).padStart(2, '0')
}

/**
 * `02 Oct` — short, and the same width for every month, so the column lines up.
 *
 * Kept for callers rendering a single stored date rather than an event's span.
 * Anything rendering an *event* uses `formatEventDates`.
 */
export function shortDate(date?: string): string | undefined {
  if (!date) return undefined
  const parsed = parse(date)
  return parsed ? shortOf(parsed) : date
}
