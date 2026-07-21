import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getEvent } from '../api/events'
import { AudioInputsTab } from '../components/event/AudioInputsTab'
import { AudioOutputsTab } from '../components/event/AudioOutputsTab'
import { EquipmentTab } from '../components/event/EquipmentTab'
import { EventMembersDialog } from '../components/event/EventMembersDialog'
import { LightingTab } from '../components/event/LightingTab'
import { OverviewTab } from '../components/event/OverviewTab'
import { ReadOnlyBanner } from '../components/event/ReadOnlyBanner'
import { RentalTab } from '../components/event/RentalTab'
import { SettingsTab } from '../components/event/SettingsTab'
import { SignalFlowTab } from '../components/event/SignalFlowTab'
import { StagePlotTab } from '../components/event/StagePlotTab'
import { useIsMobile } from '../hooks/useIsMobile'
import { SectionSwitcher } from '../components/mobile/SectionSwitcher'
import { Button } from '../components/ui/Button'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import { MOBILE_SECTION_CAPABILITIES, type MobileSectionCapability } from '../types/mobile'

const MOBILE_SECTIONS = MOBILE_SECTION_CAPABILITIES.map((entry) => entry.section)

function renderSection(section: MobileSectionCapability['section'], eventId: number, readOnly: boolean) {
  switch (section) {
    case 'overview':
      return <OverviewTab eventId={eventId} readOnly={readOnly} />
    case 'audio-inputs':
      return <AudioInputsTab eventId={eventId} readOnly={readOnly} />
    case 'audio-outputs':
      return <AudioOutputsTab eventId={eventId} readOnly={readOnly} />
    case 'lighting-rig':
      return <LightingTab eventId={eventId} readOnly={readOnly} />
    case 'stage-plots':
      return <StagePlotTab eventId={eventId} readOnly={readOnly} />
    case 'signal-flow':
      return <SignalFlowTab eventId={eventId} />
    case 'equipment':
      return <EquipmentTab eventId={eventId} readOnly={readOnly} />
    case 'rentals':
      return <RentalTab eventId={eventId} readOnly={readOnly} />
    case 'settings':
      return <SettingsTab eventId={eventId} readOnly={readOnly} />
  }
}

export function EventDetailPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId), enabled: Number.isFinite(eventId) })
  const [membersOpen, setMembersOpen] = useState(false)
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()

  if (!Number.isFinite(eventId)) return <p className="text-sm text-red-400">Invalid event id.</p>
  if (eventQuery.isLoading) return <p className="text-sm text-zinc-400">Loading event...</p>
  if (eventQuery.isError || !eventQuery.data) return <p className="text-sm text-red-400">Failed to load event.</p>

  const canManageMembers = eventQuery.data.yourRole !== 'viewer'
  const readOnly = eventQuery.data.yourRole === 'viewer'

  // Deep-link support (FR-016): a `?section=` param picks the initial
  // section on mobile instead of always defaulting to Overview. Desktop's
  // Tabs stays uncontrolled/unsynced, unchanged from before this feature.
  const sectionParam = searchParams.get('section')
  const currentSection = (MOBILE_SECTIONS as string[]).includes(sectionParam ?? '')
    ? (sectionParam as MobileSectionCapability['section'])
    : 'overview'
  const selectSection = (section: MobileSectionCapability['section']) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('section', section)
      return next
    })
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{eventQuery.data.name}</h2>
            <p className="truncate text-xs text-zinc-400">{eventQuery.data.venue || 'Venue TBD'} · {eventQuery.data.date || 'Date TBD'}</p>
          </div>
          <Link className="shrink-0 text-xs text-amber-400" to="/events">← Events</Link>
        </div>
        {eventQuery.data.yourRole === 'viewer' && <ReadOnlyBanner />}
        <SectionSwitcher current={currentSection} onSelect={selectSection} />
        <div>{renderSection(currentSection, eventId, readOnly)}</div>
      </div>
    )
  }

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
          <Tab value="settings">Settings</Tab>
        </TabList>

        <TabPanel value="overview"><OverviewTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="audio-inputs"><AudioInputsTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="audio-outputs"><AudioOutputsTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="lighting-rig"><LightingTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="stage-plots"><StagePlotTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="signal-flow"><SignalFlowTab eventId={eventId} /></TabPanel>
        <TabPanel value="equipment"><EquipmentTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="rentals"><RentalTab eventId={eventId} readOnly={readOnly} /></TabPanel>
        <TabPanel value="settings"><SettingsTab eventId={eventId} readOnly={readOnly} /></TabPanel>
      </Tabs>
    </div>
  )
}
