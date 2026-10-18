import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getEvent } from '../api/events'
import { formatEventDates } from '../lib/dashboard'
import { AudioInputsTab } from '../components/event/AudioInputsTab'
import { AudioOutputsTab } from '../components/event/AudioOutputsTab'
import { DeskRoutingTab } from '../components/event/DeskRoutingTab'
import { EquipmentTab } from '../components/event/EquipmentTab'
import { LightingTab } from '../components/event/LightingTab'
import { OverviewTab } from '../components/event/OverviewTab'
import { ReadOnlyBanner } from '../components/event/ReadOnlyBanner'
import { RentalTab } from '../components/event/RentalTab'
import { SettingsTab } from '../components/event/SettingsTab'
import { SignalFlowTab } from '../components/event/SignalFlowTab'
import { StagePlotTab } from '../components/event/StagePlotTab'
import { useIsMobile } from '../hooks/useIsMobile'
import { SectionSwitcher } from '../components/mobile/SectionSwitcher'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import { DEFAULT_EVENT_TAB, useEventTab } from '../hooks/useEventTab'
import { MOBILE_SECTIONS, type MobileSection } from '../types/mobile'

const SECTION_IDS = MOBILE_SECTIONS.map((entry) => entry.section)

function renderSection(section: MobileSection['section'], eventId: number, readOnly: boolean) {
  switch (section) {
    case 'overview':
      return <OverviewTab eventId={eventId} readOnly={readOnly} />
    case 'audio-inputs':
      return <AudioInputsTab eventId={eventId} readOnly={readOnly} />
    case 'desk-routing':
      return <DeskRoutingTab eventId={eventId} readOnly={readOnly} />
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
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const { tab, openTab } = useEventTab()

  if (!Number.isFinite(eventId)) return <p className="text-sm text-red-400">Invalid event id.</p>
  if (eventQuery.isLoading) return <p className="text-sm text-zinc-400">Loading event...</p>
  if (eventQuery.isError || !eventQuery.data) return <p className="text-sm text-red-400">Failed to load event.</p>

  const readOnly = eventQuery.data.yourRole === 'viewer'

  // Deep-link support (Slice 21 FR-016): a `?section=` param picks the section
  // on mobile instead of always defaulting to Overview. Desktop's own `?tab=`
  // is the same idea and lives in `useEventTab`; the two params are separate
  // because the phone's section list is shorter than the tab strip.
  const sectionParam = searchParams.get('section')
  const currentSection = (SECTION_IDS as string[]).includes(sectionParam ?? '')
    ? (sectionParam as MobileSection['section'])
    : 'overview'
  // Both, for the reason `useEventTab.openTab` sets both: the two params carry the same
  // nine strings, and one of them going stale is how a hand-off stops working.
  const selectSection = (section: MobileSection['section']) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('section', section)
      next.set('tab', section)
      return next
    })
  }

  if (isMobile) {
    return (
      /* A column inside the shell's column: the switcher row is `flex-none` and the
         section takes the rest, so the panel inside it can fill the body (Wave 6c). */
      <div className="flex h-full flex-col gap-3">
        {eventQuery.data.yourRole === 'viewer' && (
          <div className="flex-none">
            <ReadOnlyBanner />
          </div>
        )}
        {/*
          The name and the back link used to be a block above this row: an `h2` repeating
          what the shell's header now carries at every scroll position (Wave 6c), and a
          text link at 12px. Both are gone — the name is in the header, and `← Events` is
          a 44px target beside the switcher, which is where a back control belongs on a
          device with no browser chrome to put it in.

          That returns roughly 48px to all nine sections, on the screen where the panel
          has about 490px to work with.
        */}
        <div className="flex flex-none items-center gap-2">
          <Link
            aria-label="Back to events"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400"
            to="/events"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <SectionSwitcher current={currentSection} onSelect={selectSection} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{renderSection(currentSection, eventId, readOnly)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">{eventQuery.data.name}</h2>
          <p className="text-sm text-zinc-400">{eventQuery.data.venue || 'Venue TBD'} · {formatEventDates(eventQuery.data).long ?? 'Date TBD'}</p>
        </div>
        {/* The *Invite* button stood here from Slice 15 to Slice 38. It named the
            smaller half of the surface it opened, it hid the list from viewers
            entirely, and it was one of two doors to one drawer once Overview grew
            its access row — which is the row that replaced it, at both widths. */}
        <Link className="text-sm text-amber-400 hover:text-amber-300" to="/events">← Back to events</Link>
      </div>

      {eventQuery.data.yourRole === 'viewer' && <ReadOnlyBanner />}

      {/* Controlled from `?tab=` so a tab can hand off to another one, and so
          any tab is reachable by link (FR-084). The phone's `?section=` above
          is the same idea, and predates this. */}
      <Tabs defaultValue={DEFAULT_EVENT_TAB} value={tab} onValueChange={openTab}>
        <TabList className="print:hidden">
          <Tab value="overview">Overview</Tab>
          <Tab value="audio-inputs">Audio Inputs</Tab>
          <Tab value="desk-routing">Desk Routing</Tab>
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
        <TabPanel value="desk-routing"><DeskRoutingTab eventId={eventId} readOnly={readOnly} /></TabPanel>
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
