import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getEvent } from '../api/events'
import { AudioInputsTab } from '../components/event/AudioInputsTab'
import { AudioOutputsTab } from '../components/event/AudioOutputsTab'
import { EquipmentTab } from '../components/event/EquipmentTab'
import { EventMembersDialog } from '../components/event/EventMembersDialog'
import { LightingTab } from '../components/event/LightingTab'
import { OverviewTab } from '../components/event/OverviewTab'
import { ReadOnlyBanner } from '../components/event/ReadOnlyBanner'
import { RentalTab } from '../components/event/RentalTab'
import { SignalFlowTab } from '../components/event/SignalFlowTab'
import { StagePlotTab } from '../components/event/StagePlotTab'
import { Button } from '../components/ui/Button'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'

export function EventDetailPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId), enabled: Number.isFinite(eventId) })
  const [membersOpen, setMembersOpen] = useState(false)

  if (!Number.isFinite(eventId)) return <p className="text-sm text-red-400">Invalid event id.</p>
  if (eventQuery.isLoading) return <p className="text-sm text-zinc-400">Loading event...</p>
  if (eventQuery.isError || !eventQuery.data) return <p className="text-sm text-red-400">Failed to load event.</p>

  const canManageMembers = eventQuery.data.yourRole !== 'viewer'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-semibold">{eventQuery.data.name}</h2>
          <p className="text-sm text-zinc-400">{eventQuery.data.venue || 'Venue TBD'} · {eventQuery.data.date || 'Date TBD'}</p>
        </div>
        <div className="flex items-center gap-4">
          {canManageMembers && (
            <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Invite
            </Button>
          )}
          <Link className="text-sm text-amber-400 hover:text-amber-300" to="/events">← Back to events</Link>
        </div>
      </div>

      <EventMembersDialog eventId={eventId} open={membersOpen} onClose={() => setMembersOpen(false)} />

      {eventQuery.data.yourRole === 'viewer' && <ReadOnlyBanner />}

      <Tabs defaultValue="overview">
        <TabList className="print:hidden">
          <Tab value="overview">Overview</Tab>
          <Tab value="audio-inputs">Audio Inputs</Tab>
          <Tab value="audio-outputs">Audio Outputs</Tab>
          <Tab value="lighting-rig">Lighting Rig</Tab>
          <Tab value="stage-plots">Stage Plots</Tab>
          <Tab value="signal-flow">Signal Flow</Tab>
          <Tab value="equipment">Equipment</Tab>
          <Tab value="rentals">Rental Order</Tab>
        </TabList>

        <TabPanel value="overview"><OverviewTab eventId={eventId} /></TabPanel>
        <TabPanel value="audio-inputs"><AudioInputsTab eventId={eventId} /></TabPanel>
        <TabPanel value="audio-outputs"><AudioOutputsTab eventId={eventId} /></TabPanel>
        <TabPanel value="lighting-rig"><LightingTab eventId={eventId} /></TabPanel>
        <TabPanel value="stage-plots"><StagePlotTab eventId={eventId} /></TabPanel>
        <TabPanel value="signal-flow"><SignalFlowTab eventId={eventId} /></TabPanel>
        <TabPanel value="equipment"><EquipmentTab eventId={eventId} /></TabPanel>
        <TabPanel value="rentals"><RentalTab eventId={eventId} /></TabPanel>
      </Tabs>
    </div>
  )
}
