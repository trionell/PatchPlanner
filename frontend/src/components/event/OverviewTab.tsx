import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Eye, Pencil } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getAudioPatch } from '../../api/audioPatch'
import { getEvent, updateEvent } from '../../api/events'
import { listMembers } from '../../api/eventMembers'
import { listMyInventories } from '../../api/inventories'
import { getEventInventory } from '../../api/inventory'
import { getLightingRig } from '../../api/lighting'
import { getRentalSummary } from '../../api/rentals'
import { listPlotTrusses, listStagePlots } from '../../api/stagePlots'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatEventDates } from '../../lib/dashboard'
import { eventSummary } from '../../lib/eventSummary'
import { listEventOwnedEquipment } from '../../api/owned'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { MicroLabel } from '../ui/Label'
import { MobileOverviewPanel } from '../mobile/MobileOverviewPanel'
import { EventInventoryBrowser } from './EventInventoryBrowser'
import { type EventDraft, EventDetailsDrawer } from './EventDetailsDrawer'
import { DmxMeter, NumbersBand, ReadinessRow, RigRibbon } from './OverviewBands'

/**
 * The event, stated (Slice 28 US4).
 *
 * It used to be four text inputs and a notes box — you arrived at your own event
 * and were shown a form for the three facts you were least likely to have
 * forgotten. Meanwhile it is the only screen positioned to answer *how is this
 * show doing*, and eight tabs each held one shard of the answer.
 *
 * So editing moved into a drawer and the tab shows what the plan amounts to:
 * five figures, the rig drawn as the flow canvas one row high, and every work
 * panel's own verdict collected in one line. Nothing here is computed twice —
 * `lib/eventSummary` calls the functions the owning tabs call, so the pills and
 * those tabs' status strips cannot disagree.
 *
 * The queries it needs are the ones the audio, lighting and stage-plot tabs
 * already cache under the same keys, so opening Overview *warms* the tab you are
 * about to open rather than duplicating it (research.md R1).
 */
export function OverviewTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const { openTab } = useEventTab()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId) })
  const patchQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const rigQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const trussQuery = useQuery({ queryKey: ['plot-trusses', eventId], queryFn: ({ signal }) => listPlotTrusses(eventId, signal) })
  const plotsQuery = useQuery({ queryKey: ['stage-plots', eventId], queryFn: () => listStagePlots(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const equipmentQuery = useQuery({ queryKey: ['owned-equipment', eventId], queryFn: () => listEventOwnedEquipment(eventId) })
  const membersQuery = useQuery({ queryKey: ['event-members', eventId], queryFn: () => listMembers(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['event-inventory', eventId], queryFn: () => getEventInventory(eventId) })
  const myInventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories })

  const summary = useMemo(
    () =>
      eventSummary({
        event: eventQuery.data,
        patch: patchQuery.data,
        rig: rigQuery.data,
        trusses: trussQuery.data,
        plots: plotsQuery.data,
        rental: rentalQuery.data,
        equipment: equipmentQuery.data,
        members: membersQuery.data,
      }),
    [
      eventQuery.data,
      patchQuery.data,
      rigQuery.data,
      trussQuery.data,
      plotsQuery.data,
      rentalQuery.data,
      equipmentQuery.data,
      membersQuery.data,
    ],
  )

  const saveEvent = useMutation({
    mutationFn: (payload: EventDraft) => updateEvent(eventId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      setEditing(false)
    },
  })

  const event = eventQuery.data
  const ownsInventory = myInventoriesQuery.data?.some((inventory) => inventory.id === inventoryQuery.data?.id) ?? false

  const meta = [
    event?.created_at ? `Created ${event.created_at.slice(0, 10)}` : undefined,
    summary.members != null ? `${summary.members} ${summary.members === 1 ? 'person has' : 'people have'} access` : undefined,
    summary.yourRole ? `You are the ${summary.yourRole}` : undefined,
  ].filter((entry): entry is string => entry != null)

  /*
    The phone (Wave 6c, audit.md M9). Below the queries and the `eventSummary` memo, so
    nothing is fetched or derived twice; the desktop return below is untouched.

    The composition is a component rather than 120 lines inline, which is the one place
    this slice spends a Principle V exception: `MobileOverviewPanel` has exactly one
    caller. The countervailing rule is `components.md` §5 — `components/mobile/` is
    *reached only from inside a `useIsMobile()` branch* — and a phone composition sitting
    in the middle of a desktop tab is how a phone value gets copied onto a desk.
  */
  if (isMobile) {
    return (
      <>
        <MobileOverviewPanel
          inventoryName={inventoryQuery.data?.name}
          inventoryNote={
            inventoryQuery.data?.sourceFilename
              ? `Imported from ${inventoryQuery.data.sourceFilename}`
              : 'No price list imported yet'
          }
          meta={meta}
          notes={event?.notes}
          onEdit={readOnly ? undefined : () => setEditing(true)}
          /* An owner manages the catalog; everyone else browses it read-only — the
             same split the desktop row makes, as one target instead of two. */
          onOpenInventory={
            ownsInventory && inventoryQuery.data
              ? () => navigate(`/inventories/${inventoryQuery.data!.id}`)
              : () => setBrowsing(true)
          }
          onOpenTab={openTab}
          subtitle={[
            event?.venue || 'Venue TBD',
            formatEventDates(event).long ?? 'Date TBD',
            summary.dayLabel ? `(${summary.dayLabel})` : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
          summary={summary}
        />

        <EventDetailsDrawer
          event={event}
          onClose={() => setEditing(false)}
          onSave={(draft) => saveEvent.mutate(draft)}
          open={editing}
          saving={saveEvent.isPending}
        />

        {/* The catalog, read-only, in the sheet `ui/Dialog` becomes below 768px. */}
        <Dialog
          onClose={() => setBrowsing(false)}
          open={browsing}
          title={`${inventoryQuery.data?.name ?? 'Inventory'} (read-only)`}
        >
          <EventInventoryBrowser eventId={eventId} />
        </Dialog>
      </>
    )
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-100">{event?.name ?? 'Event'}</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {[event?.venue || 'Venue TBD', formatEventDates(event).long ?? 'Date TBD'].filter(Boolean).join(' · ')}
              {summary.dayLabel && <span className="ml-2 text-zinc-500">({summary.dayLabel})</span>}
            </p>
          </div>
          {/* Absent for a viewer — the caller passes no handler (P7). */}
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit details
            </Button>
          )}
        </div>

        {event?.notes && (
          <div className="border-t border-zinc-800 px-5 py-4">
            <p className="whitespace-pre-wrap border-l-2 border-zinc-800 pl-3 text-sm text-zinc-400">{event.notes}</p>
          </div>
        )}

        <NumbersBand summary={summary} onOpenTab={openTab} />

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <RigRibbon
            label="Audio"
            nodes={[
              { label: 'sources', value: summary.sources ?? 0, count: summary.sources },
              { label: 'stageboxes', value: summary.stageboxes ?? 0, count: summary.stageboxes },
              { label: 'multis', value: summary.stageMultis ?? 0, count: summary.stageMultis },
              { label: 'console', value: summary.consoleName ?? '—', count: summary.consoleName ? 1 : 0, desk: true },
              { label: 'devices', value: summary.outputDevices ?? 0, count: summary.outputDevices },
              { label: 'outputs', value: summary.outputChannels ?? 0, count: summary.outputChannels },
            ]}
          />
          <RigRibbon
            label="Lighting"
            nodes={[
              { label: 'fixtures', value: summary.fixtures ?? 0, count: summary.fixtures },
              { label: 'universes', value: summary.universes ?? 0, count: summary.universes },
              { label: 'trusses', value: summary.trusses ?? 0, count: summary.trusses },
            ]}
            trailing={<DmxMeter used={summary.dmxUsed} capacity={summary.dmxCapacity} />}
          />
        </div>

        <div className="border-t border-zinc-800 px-5 py-3.5">
          <ReadinessRow verdicts={summary.readiness} onOpenTab={openTab} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-5 py-3.5">
          <MicroLabel className="w-[4.5rem] shrink-0">Inventory</MicroLabel>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-zinc-100">{inventoryQuery.data?.name ?? '—'}</div>
            <div className="truncate text-xs text-zinc-500">
              {inventoryQuery.data?.sourceFilename
                ? `Imported from ${inventoryQuery.data.sourceFilename}`
                : 'No price list imported yet'}
            </div>
          </div>
          {/* An owner manages the catalog; everyone else browses it read-only —
              the behaviour EventInventoryCard had, as a row rather than a card. */}
          {ownsInventory && inventoryQuery.data ? (
            <Link to={`/inventories/${inventoryQuery.data.id}`}>
              <Button size="sm" variant="outline">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Manage
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setBrowsing(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Browse
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800 bg-zinc-950/60 px-5 py-2.5 text-xs text-zinc-500">
          {event?.created_at && <span>Created {event.created_at.slice(0, 10)}</span>}
          {summary.members != null && (
            <span>
              {summary.members} {summary.members === 1 ? 'person has' : 'people have'} access
            </span>
          )}
          {summary.yourRole && <span>You are the {summary.yourRole}</span>}
        </div>
      </Card>

      <EventDetailsDrawer
        open={editing}
        onClose={() => setEditing(false)}
        event={event}
        saving={saveEvent.isPending}
        onSave={(draft) => saveEvent.mutate(draft)}
      />

      <Dialog
        open={browsing}
        onClose={() => setBrowsing(false)}
        title={`${inventoryQuery.data?.name ?? 'Inventory'} (read-only)`}
      >
        <EventInventoryBrowser eventId={eventId} />
      </Dialog>
    </>
  )
}

