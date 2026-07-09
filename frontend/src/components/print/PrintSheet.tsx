import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getEvent } from '../../api/events'
import { cn } from '../../lib/utils'

/** Shared cell classes for print sheet tables. */
export const sheetTh = 'border border-zinc-400 px-1.5 py-1 text-left align-bottom font-semibold'
export const sheetTd = 'border border-zinc-400 px-1.5 py-1 align-top'

/**
 * Channel-strip color swatch for print rows. print-color-adjust keeps the
 * background in printed/PDF output even with default browser print settings;
 * text stays black regardless, so an unsupported browser only loses the dot.
 */
export function ColorSwatch({ color }: { color?: string }) {
  if (!color) return null
  return (
    <span
      aria-hidden
      data-testid="color-swatch"
      className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-zinc-400 align-middle"
      style={{ backgroundColor: color, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    />
  )
}

/**
 * Paper rendering wrapper for one planning tab. Hidden on screen (unless
 * `visibleOnScreen`, used by the read-only signal-flow view) and revealed by
 * the print stylesheet; the event header only ever shows in print, where the
 * app chrome that normally carries it is hidden.
 */
export function PrintSheet({
  eventId,
  title,
  empty = false,
  visibleOnScreen = false,
  children,
}: {
  eventId: number
  title: string
  empty?: boolean
  visibleOnScreen?: boolean
  children?: ReactNode
}) {
  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId) })
  const event = eventQuery.data

  return (
    <section className={cn('print-sheet', !visibleOnScreen && 'hidden print:block')}>
      <header className="mb-3 hidden print:block">
        <h2 className="text-lg font-semibold">{title}</h2>
        {event && (
          <p className="text-sm">{[event.name, event.venue, event.date].filter(Boolean).join(' · ')}</p>
        )}
      </header>
      {empty ? <p className="text-sm">Nothing planned on this sheet.</p> : children}
    </section>
  )
}
