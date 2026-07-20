import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getEvent, updateEvent } from '../../api/events'
import { getRentalSummary } from '../../api/rentals'
import { useDraftState } from '../../hooks/useDraftState'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { EventInventoryCard } from './EventInventoryCard'

export function OverviewTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })

  const [overview, setOverview] = useDraftState(
    eventQuery.data,
    (event) => ({ name: event.name, date: event.date ?? '', venue: event.venue ?? '', notes: event.notes ?? '' }),
    { name: '', date: '', venue: '', notes: '' },
  )

  const eventMutation = useMutation({
    mutationFn: (payload: typeof overview) => updateEvent(eventId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    },
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Event overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Name</label>
              <Input value={overview.name} onChange={(e) => setOverview((prev) => ({ ...prev, name: e.target.value }))} disabled={readOnly} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Venue</label>
              <Input value={overview.venue} onChange={(e) => setOverview((prev) => ({ ...prev, venue: e.target.value }))} disabled={readOnly} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Date</label>
              <Input type="date" value={overview.date} onChange={(e) => setOverview((prev) => ({ ...prev, date: e.target.value }))} disabled={readOnly} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Notes</label>
            <textarea
              className="min-h-32 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500 disabled:opacity-60"
              value={overview.notes}
              onChange={(e) => setOverview((prev) => ({ ...prev, notes: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <MiniStat label="Rental items" value={String(rentalQuery.data?.total_items ?? 0)} />
            <MiniStat label="Rental quantity" value={String(rentalQuery.data?.total_quantity ?? 0)} />
            <MiniStat label="Ex VAT total" value={`${(rentalQuery.data?.total_ex_vat ?? 0).toFixed(2)} kr`} />
          </div>
          {!readOnly && (
            <div className="flex justify-end">
              <Button onClick={() => eventMutation.mutate(overview)} disabled={eventMutation.isPending || !overview.name.trim()}>
                {eventMutation.isPending ? 'Saving...' : 'Save event'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <EventInventoryCard eventId={eventId} />
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-zinc-100">{value}</div>
    </div>
  )
}
