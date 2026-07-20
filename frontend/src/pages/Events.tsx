import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { createEvent, listEvents } from '../api/events'
import { EventFormDialog } from '../components/EventFormDialog'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'

export function EventsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const eventsQuery = useQuery({ queryKey: ['events'], queryFn: listEvents })

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">Track event details, patch lists, lighting fixtures, and rentals.</p>
        <Button onClick={() => setOpen(true)}>New Event</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(eventsQuery.data ?? []).map((event) => (
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
                <div className="text-sm text-zinc-300">{event.date || 'Date not set'}</div>
                <p className="line-clamp-3 text-sm text-zinc-500">{event.notes || 'No notes yet.'}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!eventsQuery.data?.length && <p className="text-sm text-zinc-400">No events yet.</p>}

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
