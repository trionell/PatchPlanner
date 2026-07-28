import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getAudioPatch } from '../../api/audioPatch'
import { getLightingRig } from '../../api/lighting'
import { getRentalSummary } from '../../api/rentals'
import { listStagePlots } from '../../api/stagePlots'
import { eventSummary, type ReadinessVerdict } from '../../lib/eventSummary'
import { RigRibbon, type RibbonNode } from '../event/OverviewBands'
import { Button } from '../ui/Button'
import { MicroLabel } from '../ui/Label'
import { Pill } from '../ui/SheetTable'
import type { Event } from '../../types'

/**
 * A row on the timeline, opened (Slice 30 US3).
 *
 * This is the sheet-and-editor pattern (patterns §2) with the editor replaced
 * by a **summary**. §2 already says a sheet whose every value is derived has no
 * editor, and says so by offering a destination instead: every value here is
 * derived, and the destination is *Open the show*.
 *
 * **Four queries, for one event, only once opened.** The keys are the ones
 * Overview and the dashboard already use, so a row you have opened before costs
 * nothing and a page of two hundred events issues one request until you click.
 * There is deliberately no summary endpoint — these are derivations rather than
 * counts, and a Go copy's failure mode is this block disagreeing with the tab it
 * links to (research.md R7).
 */
export function EventUnfold({ event }: { event: Event }) {
  const eventId = event.id
  const patchQuery = useQuery({
    queryKey: ['audio-patch', eventId],
    queryFn: ({ signal }) => getAudioPatch(eventId, signal),
  })
  const rigQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const plotsQuery = useQuery({ queryKey: ['stage-plots', eventId], queryFn: () => listStagePlots(eventId) })

  const summary = useMemo(
    () =>
      eventSummary({
        event,
        patch: patchQuery.data,
        rig: rigQuery.data,
        rental: rentalQuery.data,
        plots: plotsQuery.data,
      }),
    [event, patchQuery.data, rigQuery.data, rentalQuery.data, plotsQuery.data],
  )

  // The dashboard hero's ribbon with the pulse off. One show pulsing is a hero;
  // a list of them is a Christmas tree, on the one page whose job is scanning.
  const nodes: RibbonNode[] = [
    { label: 'sources', value: summary.sources ?? 0, count: summary.sources },
    { label: 'stageboxes', value: summary.stageboxes ?? 0, count: summary.stageboxes },
    { label: 'console', value: summary.consoleName ?? '—', count: summary.consoleName ? 1 : 0, desk: true },
    { label: 'devices', value: summary.outputDevices ?? 0, count: summary.outputDevices },
    { label: 'outputs', value: summary.outputChannels ?? 0, count: summary.outputChannels },
    { label: 'fixtures', value: summary.fixtures ?? 0, count: summary.fixtures },
  ]

  return (
    <div className="flex items-stretch">
      <div className="w-[84px] shrink-0" />
      <div className="flex-1 border-b border-zinc-800/60 border-l-2 border-l-amber-500 bg-amber-500/[0.04]">
        <RigRibbon nodes={nodes} className="px-4 py-3" />

        <div className="flex flex-wrap border-y border-zinc-800 bg-zinc-950/50">
          {/* The span first: on a multi-day show it is the number that changes
              what the other four mean. A one-day event draws `1 day` rather
              than hiding the figure — an absent figure reads as undeclared
              (patterns §5), and one day is declared. */}
          <Figure
            label={summary.onSiteDays && summary.onSiteDays > (summary.showDays ?? 0) ? 'show days / on site' : 'show days'}
            value={summary.showDays}
            unit={
              summary.onSiteDays && summary.onSiteDays > (summary.showDays ?? 0)
                ? `/ ${summary.onSiteDays}`
                : undefined
            }
          />
          <Figure label="channels in / out" value={summary.inputChannels} unit={summary.outputChannels != null ? `/ ${summary.outputChannels}` : undefined} />
          <Figure label="fixtures" value={summary.fixtures} />
          <Figure label="cables picked" value={summary.cablesPicked} />
          <Figure
            label="rental, ex vat"
            value={summary.rentalTotalExVAT != null ? Math.round(summary.rentalTotalExVAT) : undefined}
            unit="kr"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {summary.readiness
              .filter((verdict) => verdict.area !== 'plots')
              .map((verdict) => (
                <Verdict key={verdict.area} verdict={verdict} eventId={eventId} />
              ))}
          </div>
          {event.notes && <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{event.notes}</span>}
          <Link to={`/events/${eventId}`} className="ml-auto">
            <Button size="xs" variant="outline">
              Open the show
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

const TONE = {
  ok: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  error: 'bg-red-500/15 text-red-300',
  neutral: 'bg-zinc-700 text-zinc-300',
} as const

/** The same words every tab's strip uses. This is not a second opinion. */
function Verdict({ verdict, eventId }: { verdict: ReadinessVerdict; eventId: number }) {
  return (
    <Link
      to={`/events/${eventId}?tab=${verdict.tab}`}
      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{verdict.area}</span>
      <Pill className={TONE[verdict.tone]}>{verdict.label}</Pill>
    </Link>
  )
}

/**
 * Overview's numbers band at 19 px instead of 26.
 *
 * Overview *is* the page; this is an item in a list, and the figure has to sit
 * under the row's own 14 px name without outshouting it.
 */
function Figure({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  return (
    <div className="min-w-[7rem] flex-1 border-l border-zinc-800 px-4 py-2 first:border-l-0">
      <div className="font-mono text-[19px] font-semibold leading-none tabular-nums text-zinc-100">
        {value != null ? value.toLocaleString('sv-SE') : <span className="text-zinc-600">—</span>}
        {unit && value != null && <span className="ml-1 text-xs font-medium text-zinc-500">{unit}</span>}
      </div>
      <MicroLabel className="mt-1.5 block">{label}</MicroLabel>
    </div>
  )
}
