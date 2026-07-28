import type { ReactNode } from 'react'
import { formatEventDates } from '../../lib/dashboard'
import { countdownLabel, type EventPhase, isCurrent, resolveDates } from '../../lib/eventTimeline'
import { Badge } from '../ui/Badge'
import { Pill } from '../ui/SheetTable'
import type { Event } from '../../types'

/**
 * One event on the spine (Slice 30 US2).
 *
 * The 84 px gutter carries every time label — day number, weekday, and the
 * month and year headings above it — and the content column carries content.
 * Between them runs the spine: the content column's own left border, with the
 * event's mark sitting on it.
 *
 * **The mark's shape carries the span, not its colour.** One day is a 7 px dot;
 * several days is a 7 × 24 px capsule at the same x, whose inner fill is the
 * show days inside the on-site span. That is P5 applied literally — the
 * phantom-power bar exists because a red dot would have read as a port, and the
 * same reasoning says a span must not be a differently-tinted dot. It survives
 * greyscale, and you can see at a glance which rows are evenings and which are
 * festivals.
 */
export function TimelineRow({
  event,
  phase,
  isNext,
  today,
  open,
  collision,
  onToggle,
}: {
  event: Event
  phase: EventPhase
  isNext: boolean
  today: string
  open?: boolean
  collision?: ReactNode
  onToggle?: () => void
}) {
  const dates = resolveDates(event)
  const formatted = formatEventDates(event)
  const past = phase === 'past'
  const current = isCurrent(phase)
  const multiDay = dates ? dates.loadOut !== dates.loadIn : false

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-stretch text-left"
      aria-expanded={onToggle ? Boolean(open) : undefined}
    >
      <Gutter dates={dates} past={past} />

      <div
        className={[
          'relative flex flex-1 items-center gap-4 border-l border-zinc-800 px-3 py-2.5 pl-5 transition-colors',
          open ? 'bg-amber-500/[0.04]' : 'border-b border-b-zinc-800/60 hover:bg-zinc-900',
          open ? '' : 'border-b',
        ].join(' ')}
      >
        <Mark multiDay={multiDay} accented={isNext || current || Boolean(open)} ringed={isNext} past={past} dates={dates} />

        <span className={`truncate text-sm ${past ? 'text-zinc-400' : 'font-medium text-zinc-100'}`}>
          {event.name}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm ${past ? 'text-zinc-600' : 'text-zinc-500'}`}>
          {event.venue || 'Venue TBD'}
        </span>

        {/* Only when the on-site span says something the show span does not. */}
        {formatted.onSite && (
          <span className="shrink-0 rounded-[3px] bg-zinc-800 px-1.5 py-px font-mono text-[10px] text-zinc-400">
            on site {formatted.onSite}
          </span>
        )}
        {current && <RunLabel event={event} today={today} />}
        {collision}
        {event.yourRole && event.yourRole !== 'owner' && (
          <Badge variant={event.yourRole === 'viewer' ? 'warning' : 'default'}>{event.yourRole}</Badge>
        )}

        <span
          className={`shrink-0 font-mono text-[11px] tabular-nums ${
            isNext ? 'text-amber-300' : past ? 'text-zinc-600' : 'text-zinc-500'
          }`}
        >
          {countdownLabel(event, today) ?? ''}
        </span>
      </div>
    </button>
  )
}

/**
 * The date, right-aligned in a fixed gutter.
 *
 * A span states its range over its weekdays — `18–20` over `FRI–SUN`. When the
 * range crosses a month the weekday line gives way to the months instead, since
 * at that point which months it spans matters more than which weekdays, and
 * 84 px holds one of them and not both.
 */
function Gutter({ dates, past }: { dates?: { first: string; last: string }; past: boolean }) {
  if (!dates) {
    return (
      <div className="w-[84px] shrink-0 py-2 pr-3 text-right">
        <div className="font-mono text-xs text-zinc-600">—</div>
      </div>
    )
  }
  const first = new Date(`${dates.first}T00:00:00`)
  const last = new Date(`${dates.last}T00:00:00`)
  const span = dates.first !== dates.last
  const crossesMonth = span && first.getMonth() !== last.getMonth()

  const day = span
    ? `${pad(first.getDate())}–${pad(last.getDate())}`
    : pad(first.getDate())
  const under = crossesMonth
    ? `${MONTHS[first.getMonth()]}–${MONTHS[last.getMonth()]}`
    : span
      ? `${WEEKDAYS[first.getDay()]}–${WEEKDAYS[last.getDay()]}`
      : WEEKDAYS[first.getDay()]

  return (
    <div className="flex w-[84px] shrink-0 flex-col items-end justify-center py-2 pr-3">
      <span className={`font-mono text-[15px] leading-tight tabular-nums ${past ? 'text-zinc-500' : 'text-zinc-300'}`}>
        {day}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">{under}</span>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pad(day: number): string {
  return String(day).padStart(2, '0')
}

/** The mark on the spine. A dot is a day; a capsule is a span. */
function Mark({
  multiDay,
  accented,
  ringed,
  past,
  dates,
}: {
  multiDay: boolean
  accented: boolean
  ringed: boolean
  past: boolean
  dates?: { loadIn: string; first: string; last: string; loadOut: string }
}) {
  const border = accented ? 'border-amber-500' : past ? 'border-zinc-700' : 'border-zinc-600'

  if (!multiDay || !dates) {
    return (
      <span
        className={`absolute left-[-3.5px] h-[7px] w-[7px] rounded-full border ${border} ${
          accented ? 'bg-amber-500' : 'bg-zinc-950'
        } ${ringed ? 'ring-[3px] ring-amber-500/15' : ''}`}
      />
    )
  }

  // The capsule is the on-site span; the fill inside it is the show days, so a
  // row says "arrive a day early, leave a day late" before you read anything.
  const total = span(dates.loadIn, dates.loadOut)
  const offset = span(dates.loadIn, dates.first) - 1
  const length = span(dates.first, dates.last)

  return (
    <span
      className={`absolute left-[-3.5px] h-6 w-[7px] overflow-hidden rounded-[4px] border ${border} bg-zinc-950 ${
        ringed ? 'ring-[3px] ring-amber-500/15' : ''
      }`}
    >
      <span
        className={`absolute inset-x-0 rounded-[2px] ${accented ? 'bg-amber-500' : past ? 'bg-zinc-700' : 'bg-zinc-600'}`}
        style={{ top: `${(offset / total) * 100}%`, height: `${(length / total) * 100}%` }}
      />
    </span>
  )
}

function span(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000) + 1
}

/** `day 2 of 3` while a show is running, `load-in` on rig day. */
function RunLabel({ event, today }: { event: Event; today: string }) {
  const dates = resolveDates(event)
  if (!dates) return null
  if (today === dates.loadIn && dates.loadIn < dates.first) {
    return <Pill className="bg-amber-500/15 text-amber-300">load-in today</Pill>
  }
  const total = span(dates.first, dates.last)
  if (total === 1) return <Pill className="bg-amber-500/15 text-amber-300">today</Pill>
  const dayOfRun = Math.max(1, span(dates.first, today))
  return <Pill className="bg-amber-500/15 text-amber-300">{`day ${dayOfRun} of ${total}`}</Pill>
}
