import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getAudioPatch } from '../api/audioPatch'
import { createEvent, listEvents } from '../api/events'
import { listMyInventories } from '../api/inventories'
import { getLightingRig } from '../api/lighting'
import { listOwnedItems } from '../api/owned'
import { getRentalSummary } from '../api/rentals'
import { listStagePlots } from '../api/stagePlots'
import { EventFormDrawer } from '../components/EventFormDrawer'
import { CondensedListRow } from '../components/mobile/CondensedListRow'
import { MobilePanel } from '../components/ui/MobilePanel'
import { RigRibbon, type RibbonNode } from '../components/event/OverviewBands'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { MicroLabel } from '../components/ui/Label'
import { Pill } from '../components/ui/SheetTable'
import { useIsMobile } from '../hooks/useIsMobile'
import { formatEventDates, partitionEvents, shortDate } from '../lib/dashboard'
import { eventSummary, type EventSummary, type ReadinessVerdict } from '../lib/eventSummary'
import type { Event } from '../types'

/**
 * The page you land on (Slice 29 US5).
 *
 * It was five bordered boxes saying twelve, four, two, and here are some links —
 * with three `Badge`s repeating the first word of the label beside them, and a
 * "Quick actions" card holding one button and a sentence of marketing copy.
 *
 * Now it is one show and a spine of dates. The next event is drawn at full size
 * with the shape of its rig, because that is what makes you want to open it; the
 * date is the left column of everything else, because the date is what you are
 * scanning for; and the three counts close the page as the footnote they always
 * were.
 *
 * This is also the one page in the application that animates. `tokens.md` §6
 * permits exactly one pulse and names it; it has lived only on the signed-out
 * start page until now, and it stays off every surface anyone works on.
 */
export function DashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  const eventsQuery = useQuery({ queryKey: ['events'], queryFn: listEvents })
  const inventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories })
  const ownedQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setOpen(false)
      navigate(`/events/${event.id}`)
    },
  })

  const { running, next, upcoming, past } = useMemo(() => partitionEvents(eventsQuery.data), [eventsQuery.data])
  // A show you are standing in outranks one you are counting down to. Before
  // Slice 30 a multi-day event fell out of every bucket on its second morning
  // and the page silently moved on to the next one.
  const hero = running[0] ?? next
  const totalEvents = eventsQuery.data?.length ?? 0
  const upcomingCount = (next ? 1 : 0) + upcoming.filter((event) => event.startDate).length

  if (isMobile) {
    return (
      <>
        {/* No search: this is the short list, and a search box that has nothing to
            filter is absent (patterns.md §7b). */}
        <MobilePanel
          title="Your events"
          primaryAction={
            <button
              aria-label="New event"
              className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
              onClick={() => setOpen(true)}
              type="button"
            >
              <Plus className="h-5 w-5" />
            </button>
          }
        >
          {[next, ...upcoming, ...past].filter(Boolean).map((event) => (
            <CondensedListRow
              key={event!.id}
              onClick={() => navigate(`/events/${event!.id}`)}
              title={event!.name}
              subtitle={`${event!.venue || 'Venue TBD'} · ${event!.startDate || 'Date not set'}`}
            />
          ))}
          {totalEvents === 0 && <p className="px-3 py-3 text-sm text-zinc-500">No events yet.</p>}
        </MobilePanel>
        <EventFormDrawer
          open={open}
          onClose={() => setOpen(false)}
          title="Create event"
          submitLabel="Create event"
          submitting={createMutation.isPending}
          onSubmit={async (values) => createMutation.mutateAsync(values)}
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <MicroLabel>{running.length > 0 ? 'On now' : next ? 'Next show' : 'Your events'}</MicroLabel>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New event
        </Button>
      </div>

      {hero ? (
        <NextShow event={hero} />
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-5 py-8 text-center">
          <p className="text-sm text-zinc-400">
            {totalEvents === 0
              ? 'No events yet. Create your first show file and the patch, the rig and the rental order follow from it.'
              : 'Nothing coming up. Create the next one, or open a past event to copy from.'}
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <EventRows label="Also coming up" events={upcoming} />
      )}
      {past.length > 0 && <EventRows label="Done" events={past} past />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-[11px] text-zinc-400">
        <span className="font-mono tabular-nums text-zinc-200">{totalEvents} events</span>
        <span className="font-mono tabular-nums text-zinc-500">{upcomingCount} upcoming</span>
        <span className="font-mono tabular-nums text-zinc-500">{inventoriesQuery.data?.length ?? 0} inventories</span>
        <span className="font-mono tabular-nums text-zinc-500">{ownedQuery.data?.length ?? 0} owned items</span>
      </div>

      <EventFormDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Create event"
        submitLabel="Create event"
        submitting={createMutation.isPending}
        onSubmit={async (values) => createMutation.mutateAsync(values)}
      />
    </div>
  )
}

/**
 * The next show, bordered the way the desk is.
 *
 * The desk's border is the canvas's own mark for *the box every other box is
 * arranged around*, and on this page that is exactly what the next event is. The
 * words `Next show` sit above it, so the border is never the only carrier (P4).
 *
 * The ribbon inside it is Overview's `RigRibbon` with `pulse` — the same
 * component, not the same drawing made twice.
 */
function NextShow({ event }: { event: Event }) {
  const eventId = event.id
  const patchQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const rigQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const plotsQuery = useQuery({ queryKey: ['stage-plots', eventId], queryFn: () => listStagePlots(eventId) })

  // The same derivation Overview uses, for exactly one event (research.md R1).
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

  // Overview's ribbon with the pulse turned on. It was a second copy of that
  // markup, which is how both of them ended up with the same broken geometry.
  const nodes: RibbonNode[] = [
    { label: 'sources', value: summary.sources ?? 0, count: summary.sources },
    { label: 'stageboxes', value: summary.stageboxes ?? 0, count: summary.stageboxes },
    { label: 'console', value: summary.consoleName ?? '—', count: summary.consoleName ? 1 : 0, desk: true },
    { label: 'devices', value: summary.outputDevices ?? 0, count: summary.outputDevices },
    { label: 'outputs', value: summary.outputChannels ?? 0, count: summary.outputChannels },
    { label: 'fixtures', value: summary.fixtures ?? 0, count: summary.fixtures },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/55 bg-zinc-950/40">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <Link to={`/events/${eventId}`} className="text-xl font-semibold text-zinc-100 hover:text-amber-300">
            {event.name}
          </Link>
          <p className="mt-0.5 text-sm text-zinc-400">
            {[event.venue || 'Venue TBD', formatEventDates(event).long].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-3xl font-semibold leading-none tabular-nums text-amber-500">
            {summary.runningDay ?? (summary.daysToLoadIn != null ? Math.abs(summary.daysToLoadIn) : '—')}
          </div>
          {/* The figure counts to load-in until the run starts, and then counts
              through it. The label follows the figure rather than the figure
              being explained away. */}
          <MicroLabel className="mt-1 block">
            {summary.runningDay != null && summary.showDays != null && summary.showDays > 1
              ? `day of ${summary.showDays}`
              : 'days to load-in'}
          </MicroLabel>
        </div>
      </div>

      <RigRibbon nodes={nodes} pulse className="px-5 py-5" />

      <div className="flex flex-wrap border-y border-zinc-800 bg-zinc-950/60">
        <Figure label="channels in / out" value={summary.inputChannels} unit={summary.outputChannels != null ? `/ ${summary.outputChannels}` : undefined} />
        <Figure label="cables picked" value={summary.cablesPicked} />
        <Figure label="dmx universes" value={summary.universes} />
        <Figure label="stage plots" value={summary.stagePlots} />
        <Figure
          label="rental, ex vat"
          value={summary.rentalTotalExVAT != null ? Math.round(summary.rentalTotalExVAT) : undefined}
          unit="kr"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          {summary.readiness
            .filter((verdict) => verdict.area !== 'plots')
            .map((verdict) => (
              <Verdict key={verdict.area} verdict={verdict} eventId={eventId} />
            ))}
        </div>
        <Link to={`/events/${eventId}`}>
          <Button size="xs" variant="outline">
            Open the show
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
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

/** `—`, never `0`, while a query is in flight or a plan does not exist. */
function Figure({ label, value, unit }: { label: string; value?: EventSummary['inputChannels']; unit?: string }) {
  return (
    <div className="min-w-[7rem] flex-1 border-l border-zinc-800 px-5 py-3 first:border-l-0">
      <div className="font-mono text-[22px] font-semibold leading-none tabular-nums text-zinc-100">
        {value != null ? value.toLocaleString('sv-SE') : <span className="text-zinc-600">—</span>}
        {unit && value != null && <span className="ml-1 text-[13px] font-medium text-zinc-500">{unit}</span>}
      </div>
      <MicroLabel className="mt-1.5 block">{label}</MicroLabel>
    </div>
  )
}

/** A dated block. No card frame — the date column is the structure. */
function EventRows({ label, events, past }: { label: string; events: Event[]; past?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-3 pb-1.5">
        <MicroLabel>{label}</MicroLabel>
        <span className="h-px flex-1 bg-zinc-800" />
        <span className="font-mono text-[10px] tabular-nums text-zinc-600">{events.length}</span>
      </div>
      {events.map((event) => (
        <Link
          key={event.id}
          to={`/events/${event.id}`}
          className="flex items-center gap-4 border-b border-zinc-800/60 px-3 py-2.5 text-sm transition-colors hover:bg-zinc-900"
        >
          <span
            className={`w-[4.5rem] shrink-0 font-mono text-xs tabular-nums ${past ? 'text-zinc-600' : 'text-zinc-400'}`}
          >
            {shortDate(event.startDate) ?? <span className="text-zinc-600">no date</span>}
          </span>
          <span className={`w-60 shrink-0 truncate ${past ? 'text-zinc-400' : 'font-medium text-zinc-100'}`}>
            {event.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-zinc-500">{event.venue || 'Venue TBD'}</span>
          {event.yourRole && event.yourRole !== 'owner' && (
            <Badge variant={event.yourRole === 'viewer' ? 'warning' : 'default'}>{event.yourRole}</Badge>
          )}
        </Link>
      ))}
    </div>
  )
}
