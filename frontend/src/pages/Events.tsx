import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { createEvent, listEvents } from '../api/events'
import { EventFormDrawer } from '../components/EventFormDrawer'
import { EventUnfold } from '../components/events/EventUnfold'
import { TimelineRow } from '../components/events/TimelineRow'
import { YearTrack } from '../components/events/YearTrack'
import { CondensedListRow } from '../components/mobile/CondensedListRow'
import { Badge } from '../components/ui/Badge'
import { Pill } from '../components/ui/SheetTable'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { MobilePanel } from '../components/ui/MobilePanel'
import { MicroLabel } from '../components/ui/Label'
import { useIsMobile } from '../hooks/useIsMobile'
import { formatEventDates, isoDay } from '../lib/dashboard'
import {
  buildTimeline,
  type CollisionMap,
  findCollisions,
  type TimelineTense,
  yearTrack,
} from '../lib/eventTimeline'
import { matchesSearch } from '../lib/patchSearch'
import type { Event } from '../types'

/**
 * Every show you have, on a timeline (Slice 30).
 *
 * This was a grid of `Card`s in creation order — the last surface that never
 * converged. `design/audit.md` A6 exempted it under P1, correctly, as a list of
 * genuinely independent objects. That settled the *frame* and never asked what
 * the page is *for*: finding one show among a hundred, which creation order
 * answers neither for *which is next* nor for *where is last year's file for
 * this festival*.
 *
 * It is now one panel (patterns §1) whose body is a chronological spine. The
 * date gutter is the structure, and the whole of it is derived by
 * `lib/eventTimeline.ts` — so the page's behaviour is tested without rendering
 * anything.
 *
 * The dashboard is unchanged and still answers *what am I doing next*. The
 * division between the two pages is a division of tense.
 */
export function EventsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tense, setTense] = useState<TimelineTense>('all')
  // One row open at a time (patterns §2). Local UI state, not server state.
  const [openRow, setOpenRow] = useState<number | null>(null)
  const [trackYear, setTrackYear] = useState<number | null>(null)
  const eventsQuery = useQuery({ queryKey: ['events'], queryFn: listEvents })

  const today = isoDay(new Date())
  const timeline = useMemo(
    () =>
      buildTimeline(eventsQuery.data, {
        today,
        tense,
        matches: (event) => matchesSearch(search, event.name, event.venue, event.notes),
      }),
    [eventsQuery.data, today, tense, search],
  )

  // Derived from the on-site spans, never stored (P6), and from the same sweep
  // that assigns the year track its lanes — so the brace on the spine and the
  // stacking on the track cannot disagree about what collides.
  const collisions = useMemo(() => findCollisions(eventsQuery.data), [eventsQuery.data])

  // The track shows the year today falls in until the user steps away from it,
  // and falls back to the nearest year that actually has events.
  const year = trackYear ?? (timeline.years.includes(Number(today.slice(0, 4)))
    ? Number(today.slice(0, 4))
    : (timeline.years[timeline.years.length - 1] ?? Number(today.slice(0, 4))))

  // The track redraws against the search — it is a readout of what is below it.
  const matching = useMemo(
    () => (eventsQuery.data ?? []).filter((event) => matchesSearch(search, event.name, event.venue, event.notes)),
    [eventsQuery.data, search],
  )
  const track = useMemo(
    () => yearTrack(matching, year, { today, collisions }),
    [matching, year, today, collisions],
  )

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setOpen(false)
      navigate(`/events/${event.id}`)
    },
  })

  const hasAnyEvents = (eventsQuery.data?.length ?? 0) > 0

  const createDrawer = (
    <EventFormDrawer
      open={open}
      onClose={() => setOpen(false)}
      title="Create event"
      submitLabel="Create event"
      submitting={createMutation.isPending}
      onSubmit={async (values) => createMutation.mutateAsync(values)}
    />
  )

  if (isMobile) {
    return (
      <MobileEvents
        events={eventsQuery.data}
        today={today}
        search={search}
        onSearch={setSearch}
        onOpen={(id) => navigate(`/events/${id}`)}
        onCreate={() => setOpen(true)}
        createDrawer={createDrawer}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <span className="mr-1 text-sm font-semibold text-zinc-100">Events</span>

        {hasAnyEvents && (
          <>
            <div className="inline-flex gap-0.5 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
              {(['upcoming', 'past', 'all'] as const).map((option) => (
                <Button
                  key={option}
                  size="xs"
                  variant={tense === option ? 'default' : 'ghost'}
                  onClick={() => setTense(option)}
                  className="capitalize"
                >
                  {option}
                </Button>
              ))}
            </div>

            <div className="relative min-w-[12rem] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                size="sm"
                className="pl-8"
                placeholder="Name, venue or notes…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </>
        )}

        <div className="flex-1" />
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New event
        </Button>
      </div>

      {/* Absent while loading and when the account is empty: a strip of twelve
          empty months is a claim that you have no shows. */}
      {!eventsQuery.isLoading && hasAnyEvents && (
        <YearTrack
          track={track}
          year={year}
          years={timeline.years}
          today={today}
          onYear={setTrackYear}
          onSelect={(event) => {
            setOpenRow(event.id)
            document.getElementById(`event-${event.id}`)?.scrollIntoView({ block: 'center' })
          }}
        />
      )}

      {eventsQuery.isLoading ? (
        <p className="px-5 py-8 text-sm text-zinc-400">Loading events…</p>
      ) : timeline.counts.total === 0 ? (
        <Empty hasAnyEvents={hasAnyEvents} search={search} onCreate={() => setOpen(true)} />
      ) : (
        <Spine
          timeline={timeline}
          today={today}
          collisions={collisions}
          openRow={openRow}
          onToggleRow={(id) => setOpenRow((current) => (current === id ? null : id))}
        />
      )}

      {timeline.counts.total > 0 && <Strip counts={timeline.counts} clashes={collisions.groups} />}

      {createDrawer}
    </div>
  )
}

/**
 * The rows, their headings, and the today rule.
 *
 * The page scrolls to today on arrival, and does so **without** smooth
 * scrolling: this is a page you land on, and a list that animates itself into
 * position while you are trying to read it is in the way.
 */
function Spine({
  timeline,
  today,
  collisions,
  openRow,
  onToggleRow,
}: {
  timeline: ReturnType<typeof buildTimeline>
  today: string
  collisions: CollisionMap
  openRow: number | null
  onToggleRow: (id: number) => void
}) {
  const todayRef = useRef<HTMLDivElement>(null)
  const anchored = useRef(false)

  useEffect(() => {
    if (anchored.current || !todayRef.current) return
    anchored.current = true
    todayRef.current.scrollIntoView({ block: 'center' })
  }, [timeline])

  return (
    <div className="py-1">
      {timeline.items.map((item, index) => {
        if (item.kind === 'event') {
          const collision = collisions.byEventId.get(item.event.id)
          const previous = timeline.items[index - 1]
          const next = timeline.items[index + 1]
          // The brace joins consecutive rows of one group. Drawing it per row —
          // rounded where the group starts and ends — keeps the markup a flat
          // list rather than needing a wrapper element per group.
          const bracedAbove =
            previous?.kind === 'event' &&
            collisions.byEventId.get(previous.event.id)?.groupId === collision?.groupId
          const bracedBelow =
            next?.kind === 'event' && collisions.byEventId.get(next.event.id)?.groupId === collision?.groupId

          const isOpen = openRow === item.event.id
          return (
            <div key={`e-${item.event.id}`} id={`event-${item.event.id}`}>
            <TimelineRow
              event={item.event}
              phase={item.phase}
              isNext={item.isNext}
              today={today}
              open={isOpen}
              brace={collision ? { above: bracedAbove, below: bracedBelow } : undefined}
              collision={
                collision && (
                  <Pill className="bg-amber-500/15 text-amber-300">
                    {collision.kind === 'overlap' ? 'overlaps' : 'on-site clash'}
                  </Pill>
                )
              }
              onToggle={() => onToggleRow(item.event.id)}
            />
            {/* grid-template-rows 0fr -> 1fr is the only technique that
                animates to a content-determined height without measuring it,
                and it degrades to an instant open under reduced motion for
                free — which is the required behaviour (research.md R6).
                `motion-safe:` is Tailwind's own name for that media query.

                Opening animates; closing is immediate, because the summary
                unmounts in the same commit and takes its four queries with it.
                Keeping it mounted to animate the collapse would leave those
                queries active on every row you had ever looked at, which is a
                worse trade than an asymmetric 150 ms. */}
            <div
              className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-150"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">{isOpen && <EventUnfold event={item.event} />}</div>
            </div>
            </div>
          )
        }
        if (item.kind === 'today') {
          return (
            <div key="today" ref={todayRef} className="flex items-center py-1">
              <span className="w-[84px] shrink-0 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-amber-500">
                Today
              </span>
              <span className="h-px flex-1 bg-amber-500/45" />
            </div>
          )
        }
        if (item.kind === 'year') {
          // Big enough to land as you scroll past, dark enough that you never
          // read it on purpose. The inverse of Overview's numbers band, where
          // the big mono figure is the answer; here it is the ruler.
          return (
            <div key={`${item.anchor}-${index}`} id={item.anchor} className="flex items-center pt-4">
              <span className="w-[84px] shrink-0 pr-2.5 text-right font-mono text-[26px] font-semibold leading-none tabular-nums text-zinc-800">
                {item.label}
              </span>
            </div>
          )
        }
        return (
          <div key={`${item.anchor}-${index}`} id={item.anchor} className="flex items-center gap-2.5 px-3 pb-1 pt-2">
            <MicroLabel className="w-[72px] shrink-0 text-right">{item.label}</MicroLabel>
            <span className="h-px flex-1 bg-zinc-800" />
            <span className="font-mono text-[10px] tabular-nums text-zinc-600">{item.count}</span>
          </div>
        )
      })}
    </div>
  )
}

/** What the page contains, as the footnote it always was. */
function Strip({ counts, clashes }: { counts: ReturnType<typeof buildTimeline>['counts']; clashes: number }) {
  const parts = [
    `${counts.total} ${counts.total === 1 ? 'event' : 'events'}`,
    counts.running > 0 ? `${counts.running} running` : undefined,
    counts.toCome > 0 ? `${counts.toCome} to come` : undefined,
    counts.done > 0 ? `${counts.done} done` : undefined,
    counts.undated > 0 ? `${counts.undated} undated` : undefined,
  ].filter((part): part is string => Boolean(part))

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-3">
          {index > 0 && <span className="text-zinc-700">·</span>}
          <span className="font-mono tabular-nums">{part}</span>
        </span>
      ))}
      {clashes > 0 && (
        <>
          <span className="flex-1" />
          {/* The one place on this page where a count is also a warning — and
              amber, never red: a clash is a fact about a plan, not an error in
              it. tokens.md reserves red for destructive, over capacity, a
              broken link and 48 V. */}
          <span className="font-mono tabular-nums text-amber-300">
            {clashes} {clashes === 1 ? 'clash' : 'clashes'}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * Two empty states, and they are different states.
 *
 * An unmatched search keeps the whole bar — the text you typed is still there
 * to correct. An account with no events at all has no bar to keep: nothing to
 * filter, nothing to search, and one sentence saying what to do beside the
 * control that does it (patterns §5).
 */
function Empty({
  hasAnyEvents,
  search,
  onCreate,
}: {
  hasAnyEvents: boolean
  search: string
  onCreate: () => void
}) {
  if (hasAnyEvents) {
    return (
      <div className="mx-3 my-4 rounded-xl border border-dashed border-zinc-700 px-6 py-7 text-center">
        <p className="text-sm text-zinc-400">
          {search ? (
            <>
              No event matches <span className="font-mono text-zinc-200">{search}</span>.
            </>
          ) : (
            'No events in this view.'
          )}
        </p>
        <p className="mt-2 text-[13px] text-zinc-500">
          {search ? 'Search covers name, venue and notes.' : 'Try All to see everything.'}
        </p>
      </div>
    )
  }
  return (
    <div className="mx-3 my-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-700 px-6 py-8 text-center">
      <p className="text-sm text-zinc-400">No events yet.</p>
      <p className="max-w-[44ch] text-[13px] text-zinc-500">
        Create your first show file and the patch, the rig and the rental order follow from it.
      </p>
      <Button onClick={onCreate}>
        <Plus className="mr-1.5 h-4 w-4" />
        New event
      </Button>
    </div>
  )
}

/**
 * The phone keeps `CondensedListRow`, and gains the month headings and the
 * today rule — those are structure, not density, and they are worth more on a
 * small screen than a large one. The gutter, the year track and the unfold are
 * desktop only: a 3 px mark is not a touch target and the ribbon does not fit.
 */
function MobileEvents({
  events,
  today,
  search,
  onSearch,
  onOpen,
  onCreate,
  createDrawer,
}: {
  events?: Event[]
  today: string
  search: string
  onSearch: (value: string) => void
  onOpen: (id: number) => void
  onCreate: () => void
  createDrawer: React.ReactNode
}) {
  const timeline = useMemo(
    () =>
      buildTimeline(events, {
        today,
        matches: (event) => matchesSearch(search, event.name, event.venue, event.notes),
      }),
    [events, today, search],
  )

  return (
    <>
      <MobilePanel
        title="Your events"
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Find an event…"
        primaryAction={
          <button
            aria-label="New event"
            className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
            onClick={onCreate}
            type="button"
          >
            <Plus className="h-5 w-5" />
          </button>
        }
      >
        {timeline.items.map((item, index) => {
          if (item.kind === 'event') {
            const formatted = formatEventDates(item.event)
            return (
              <CondensedListRow
                key={`e-${item.event.id}`}
                onClick={() => onOpen(item.event.id)}
                title={item.event.name}
                subtitle={`${item.event.venue || 'Venue TBD'} · ${formatted.short ?? 'Date not set'}`}
                trailing={
                  item.event.yourRole && item.event.yourRole !== 'owner' ? (
                    <Badge variant={item.event.yourRole === 'viewer' ? 'warning' : 'default'}>
                      {item.event.yourRole}
                    </Badge>
                  ) : undefined
                }
              />
            )
          }
          if (item.kind === 'today') {
            return (
              <div key="today" className="flex items-center gap-2 bg-zinc-950/30 px-3 pb-1 pt-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-500">Today</span>
                <span className="h-px flex-1 bg-amber-500/45" />
              </div>
            )
          }
          if (item.kind === 'year') return null
          return (
            <div key={`${item.anchor}-${index}`} className="flex items-center gap-2 bg-zinc-950/30 px-3 pb-1 pt-2.5">
              <MicroLabel>
                {item.kind === 'month' ? `${item.label} ${item.anchor.slice(2, 6)}` : item.label}
              </MicroLabel>
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
          )
        })}
        {timeline.counts.total === 0 && <p className="px-3 py-3 text-sm text-zinc-500">No events yet.</p>}
      </MobilePanel>

      {createDrawer}
    </>
  )
}
