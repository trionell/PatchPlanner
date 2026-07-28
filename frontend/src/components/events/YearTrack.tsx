import { eventPhase, isCurrent, type YearTrack as Track } from '../../lib/eventTimeline'
import type { Event } from '../../types'

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * A year, at true scale (Slice 30 US4).
 *
 * A readout of what is below it, not a control acting on the page — which is
 * why it sits above the list rather than in the bar, and why it redraws against
 * the search. Type a client's name and it becomes a picture of when you have
 * worked for them.
 *
 * It is also a jump control: selecting a mark scrolls the spine to that event.
 * Both jobs are the same gesture, so there is only one.
 *
 * The year stepper offers a direction only when that year has events — an arrow
 * into an empty year is a promise the interface cannot keep, which is P7's
 * reasoning applied to a stepper.
 */
export function YearTrack({
  track,
  year,
  years,
  today,
  onYear,
  onSelect,
}: {
  track: Track
  year: number
  years: number[]
  today: string
  onYear: (year: number) => void
  onSelect: (event: Event) => void
}) {
  const earlier = [...years].filter((candidate) => candidate < year).pop()
  const later = years.find((candidate) => candidate > year)
  const laneHeight = 5
  const laneGap = 3
  const bandHeight = track.lanes * laneHeight + (track.lanes - 1) * laneGap

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <StepButton disabled={earlier === undefined} onClick={() => earlier !== undefined && onYear(earlier)}>
          ‹
        </StepButton>
        <span className="font-mono text-xs tabular-nums tracking-[0.04em] text-zinc-200">{year}</span>
        <StepButton disabled={later === undefined} onClick={() => later !== undefined && onYear(later)}>
          ›
        </StepButton>
      </div>

      <div className="min-w-[22rem] flex-1">
        <div className="relative" style={{ height: Math.max(bandHeight, laneHeight) }}>
          {/* The month boundaries are the scale. Faint enough to be a grid
              rather than twelve more marks competing with the events. */}
          {track.monthAt.map((at, index) =>
            index === 0 ? null : (
              <span key={index} className="absolute inset-y-0 w-px bg-zinc-900" style={{ left: `${at}%` }} />
            ),
          )}

          {track.marks.map((mark) => {
            const phase = eventPhase(mark.event, today)
            return (
              <button
                key={mark.event.id}
                type="button"
                title={mark.title}
                onClick={() => onSelect(mark.event)}
                // min-w in CSS, never by clamping the percentage: clamping would
                // push a one-day event in late December off its own date.
                className={`absolute min-w-[3px] rounded-sm ${
                  isCurrent(phase) ? 'bg-amber-500' : phase === 'past' ? 'bg-zinc-700' : 'bg-zinc-500'
                } hover:brightness-125`}
                style={{
                  left: `${mark.left}%`,
                  width: `${mark.width}%`,
                  top: mark.lane * (laneHeight + laneGap),
                  height: laneHeight,
                }}
              />
            )
          })}

          {track.todayAt !== undefined && (
            <span
              className="pointer-events-none absolute -inset-y-0.5 w-px bg-amber-500/60"
              style={{ left: `${track.todayAt}%` }}
            />
          )}
        </div>

        <div className="mt-1 flex">
          {MONTH_LETTERS.map((letter, index) => (
            <span
              key={index}
              className={`flex-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] ${
                track.todayAt !== undefined && index === Number(today.slice(5, 7)) - 1
                  ? 'text-amber-300'
                  : 'text-zinc-600'
              }`}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>

      <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
        {track.marks.length} in {year}
      </span>
    </div>
  )
}

function StepButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
}) {
  if (disabled) {
    return <span className="w-3 text-center font-mono text-xs text-zinc-700">{children}</span>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-3 text-center font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-100"
    >
      {children}
    </button>
  )
}
