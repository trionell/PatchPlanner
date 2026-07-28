import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { createEvent, listEvents } from '../api/events'
import { EventFormDialog } from '../components/EventFormDialog'
import { useIsMobile } from '../hooks/useIsMobile'
import { CondensedListRow } from '../components/mobile/CondensedListRow'
import { matchesSearch } from '../lib/patchSearch'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Search } from 'lucide-react'

export function EventsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const eventsQuery = useQuery({ queryKey: ['events'], queryFn: listEvents })

  // Twelve events fit on a screen and forty do not — the grid stays, because
  // P1 exempts a list of genuinely independent objects, but it needs a way in.
  const events = useMemo(
    () => (eventsQuery.data ?? []).filter((event) => matchesSearch(search, event.name, event.venue, event.notes)),
    [eventsQuery.data, search],
  )

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setOpen(false)
      navigate(`/events/${event.id}`)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[12rem] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="pl-9"
            placeholder="Find an event…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button onClick={() => setOpen(true)}>New Event</Button>
      </div>

      {isMobile ? (
        <div className="space-y-1">
          {events.map((event) => (
            <CondensedListRow
              key={event.id}
              onClick={() => navigate(`/events/${event.id}`)}
              title={event.name}
              subtitle={`${event.venue || 'Venue TBD'} · ${event.startDate || 'Date not set'}`}
              trailing={
                event.yourRole && event.yourRole !== 'owner' ? (
                  <Badge variant={event.yourRole === 'viewer' ? 'warning' : 'default'}>{event.yourRole}</Badge>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <Link key={event.id} to={`/events/${event.id}`}>
              <Card className="h-full transition hover:border-amber-500/50">
                <CardContent className="space-y-3 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-100">{event.name}</h3>
                      <p className="text-sm text-zinc-400">{event.venue || 'Venue TBD'}</p>
                    </div>
                    {event.yourRole && event.yourRole !== 'owner' && (
                      <Badge variant={event.yourRole === 'viewer' ? 'warning' : 'default'}>{event.yourRole}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-zinc-300">{event.startDate || 'Date not set'}</div>
                  <p className="line-clamp-3 text-sm text-zinc-500">{event.notes || 'No notes yet.'}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {events.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-5 py-8 text-center">
          <p className="text-sm text-zinc-400">
            {eventsQuery.data?.length
              ? 'No event matches.'
              : 'No events yet — create your first show file, and the patch, the rig and the rental order follow from it.'}
          </p>
          {!eventsQuery.data?.length && (
            <Button className="mt-4" onClick={() => setOpen(true)}>
              New Event
            </Button>
          )}
        </div>
      )}

      <EventFormDialog
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
