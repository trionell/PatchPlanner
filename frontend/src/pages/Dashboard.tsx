import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { createEvent, listEvents } from '../api/events'
import { listMyInventories } from '../api/inventories'
import { EventFormDialog } from '../components/EventFormDialog'
import { useIsMobile } from '../hooks/useIsMobile'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'

export function DashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const eventsQuery = useQuery({ queryKey: ['events'], queryFn: listEvents })
  const inventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories })

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setOpen(false)
      navigate(`/events/${event.id}`)
    },
  })

  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return (eventsQuery.data ?? []).filter((event) => event.date && event.date >= today).length
  }, [eventsQuery.data])

  const recentEvents = useMemo(() => (eventsQuery.data ?? []).slice(0, 5), [eventsQuery.data])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total events" value={String(eventsQuery.data?.length ?? 0)} />
        <StatCard label="Upcoming events" value={String(upcomingEvents)} accent="warning" />
        <StatCard label="Inventories" value={String(inventoriesQuery.data?.length ?? 0)} accent="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentEvents.length === 0 ? (
              <p className="text-sm text-zinc-400">No events yet. Create your first show file to get started.</p>
            ) : (
              recentEvents.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className={cn(
                    'flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 hover:border-amber-500/50',
                    isMobile ? 'gap-2 px-2.5 py-1.5' : 'px-4 py-3 text-sm',
                  )}
                >
                  <div className="min-w-0">
                    <div className={cn('truncate font-medium text-zinc-100', isMobile ? 'text-[13px] leading-tight' : undefined)}>{event.name}</div>
                    <div className={cn('truncate text-zinc-400', isMobile ? 'text-[11px] leading-tight' : undefined)}>{event.venue || 'Venue TBD'}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {event.yourRole && event.yourRole !== 'owner' && (
                      <Badge variant={event.yourRole === 'viewer' ? 'warning' : 'default'}>{event.yourRole}</Badge>
                    )}
                    <Badge variant="warning">{event.date || 'No date'}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-center" onClick={() => setOpen(true)}>
              Create Event
            </Button>
            <p className="text-sm text-zinc-400">Start with event details, then build audio, lighting, and rental plans in one place.</p>
          </CardContent>
        </Card>
      </div>

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

function StatCard({ label, value, accent = 'default' }: { label: string; value: string; accent?: 'default' | 'warning' | 'success' }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="text-sm text-zinc-400">{label}</div>
        <div className="flex items-center justify-between">
          <div className="text-3xl font-semibold text-zinc-100">{value}</div>
          <Badge variant={accent}>{label.split(' ')[0]}</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
