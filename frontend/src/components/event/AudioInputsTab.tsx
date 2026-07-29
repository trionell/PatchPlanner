import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createInputChannel, getAudioPatch } from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePatchView } from '../../hooks/usePatchView'
import { buildMobileChannelList } from '../../lib/mobileChannelList'
import { inputPatchStatus } from '../../lib/patchCapacity'
import { itemLabel } from '../../lib/utils'
import type { SegmentNode } from '../../lib/patchSheet'
import type { InputChannel, InventoryItem, OwnedItem } from '../../types'
import { MobileChannelEditSheet } from '../mobile/MobileChannelEditSheet'
import { Boxes, Layers, Printer } from 'lucide-react'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { InputPatchSheet } from '../print/InputPatchSheet'
import { AudioPatchShell } from './AudioPatchShell'
import { ZoomControl } from './graph/ZoomControl'
import type { InputFlowSelection } from './InputFlowInspector'
import { BusesDrawer } from './BusesDrawer'
import { ConsoleSection } from './ConsoleSection'
import { InputDeviceSection } from './InputDeviceSection'
import { InputGraphCanvas } from './InputGraphCanvas'
import { InputSheet } from './InputSheet'
import { PatchStatusRail } from './PatchStatusRail'
import { RigDrawer } from './RigDrawer'

export function AudioInputsTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const inventoryQuery = useQuery({
    queryKey: ['inventory-audio-items', eventId],
    queryFn: () => listEventInventoryItems(eventId, { categoryType: 'audio' }),
  })
  const cableQuery = useQuery({
    queryKey: ['inventory-items', eventId, 'role', 'cable'],
    queryFn: () => listEventInventoryItems(eventId, { role: 'cable' }),
  })
  const standQuery = useQuery({
    queryKey: ['inventory-items', eventId, 'role', 'stand'],
    queryFn: () => listEventInventoryItems(eventId, { role: 'stand' }),
  })
  const ownedQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })

  const isMobile = useIsMobile()
  const [editingChannelId, setEditingChannelId] = useState<number | 'new' | null>(null)
  const [view, setView] = usePatchView(eventId, 'inputs')
  const [search, setSearch] = useState('')
  // Which node the graph's inspector is open on. Held here rather than in the
  // canvas so it survives the view toggle in both directions, and so the sheet
  // can set it (Slice 25 FR-001/FR-002). Deliberately not persisted: it is where
  // the planner is looking, not part of the plan.
  const [selection, setSelection] = useState<InputFlowSelection | null>(null)
  // The canvas zoom. Held here because its control lives in the panel's toolbar
  // (Slice 25 FR-020); the canvas reads it for geometry.
  const [zoom, setZoom] = useState(1)
  const [drawer, setDrawer] = useState<'rig' | 'buses' | null>(null)
  // The phone's strip filter. The desktop's lives in `InputSheet`; the phone's
  // branch returns before that, so it holds its own (data-model.md §3).
  const [gapsOnly, setGapsOnly] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addChannelMutation = useMutation({
    mutationFn: (data: Omit<InputChannel, 'id' | 'event_id'>) => createInputChannel(eventId, data),
    onSuccess: invalidate,
  })

  const allAudioItems: InventoryItem[] = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const cableItems: InventoryItem[] = useMemo(() => cableQuery.data ?? [], [cableQuery.data])
  const standItems: InventoryItem[] = useMemo(() => standQuery.data ?? [], [standQuery.data])
  const ownedItems: OwnedItem[] = useMemo(() => ownedQuery.data ?? [], [ownedQuery.data])
  const micItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().startsWith('mikrofon')), [allAudioItems])

  const channels = audioQuery.data?.input_channels ?? []
  const sources = audioQuery.data?.input_sources ?? []
  const devices = audioQuery.data?.input_devices ?? []
  const stageboxes = audioQuery.data?.stageboxes ?? []
  const stageMultis = audioQuery.data?.stage_multis ?? []
  const cables = audioQuery.data?.input_cables ?? []
  const consoles = audioQuery.data?.consoles ?? []
  const groups = audioQuery.data?.groups ?? []
  const dcas = audioQuery.data?.dcas ?? []

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems, ...standItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems, standItems],
  )

  if (isMobile) {
    const listed = buildMobileChannelList(channels, { sources, devices, stageboxes, stageMultis, cables, itemLabelById })
    const gapNumbers = new Set(listed.filter((item) => item.hasGap).map((item) => item.channelNumber))
    const items = listed
      .filter((item) => !gapsOnly || item.hasGap)
      .map((item) => ({
        id: item.id,
        number: item.channelNumber,
        name: item.name,
        subtitle: `${item.sourceLabel} · ${item.routingLabel}`,
        color: item.color,
      }))
    // The same verdict the desk states, from the same assembly (research.md R6).
    const status = inputPatchStatus({
      channels,
      gaps: channels.filter((channel) => gapNumbers.has(channel.channel_number)),
      consoles,
      stageboxes,
      stageMultis,
      cables,
    })
    const editingChannel = typeof editingChannelId === 'number' ? channels.find((c) => c.id === editingChannelId) : undefined
    return (
      <>
      {/* A column, because it is a flex item of the shell's column and the panel
          inside it fills what this gives it (Wave 6c). */}
      <div className="flex min-h-0 flex-1 flex-col print:hidden">
        <MobileEntityList
          title="Audio Inputs"
          /*
            The rig, in the hand (audit.md M5). Every one of these opens something that
            has had a phone form since Wave 6a — `ui/Drawer` branches internally — and
            was simply never rendered, because this branch returned before reaching the
            drawers. A stagebox that arrives at load-in is declared at load-in.

            They are the overflow rather than the bar because each does a thing and is
            finished (contracts/phone-surfaces.md §1), and because a title plus five 44px
            targets is 350px of a 317px bar.
          */
          overflow={[
            ...(readOnly
              ? []
              : [
                  {
                    label: 'Open Rig',
                    hint: String(consoles.length + stageboxes.length + stageMultis.length + devices.length),
                    icon: <Boxes className="h-4 w-4" />,
                    onClick: () => setDrawer('rig'),
                  },
                  {
                    label: 'Groups & DCAs',
                    hint: String(groups.length + dcas.length),
                    icon: <Layers className="h-4 w-4" />,
                    onClick: () => setDrawer('buses'),
                  },
                ]),
            { label: 'Print patch sheet', icon: <Printer className="h-4 w-4" />, onClick: () => window.print() },
          ]}
          strip={
            <PatchStatusRail
              status={status}
              noun="channel"
              gapsOnly={gapsOnly}
              onShowGaps={status.gaps.length > 0 || gapsOnly ? () => setGapsOnly((only) => !only) : undefined}
            />
          }
          items={items}
          filtered={gapsOnly}
          onSelect={setEditingChannelId}
          onAdd={() => setEditingChannelId('new')}
          readOnly={readOnly}
          searchPlaceholder="Find a channel…"
          addLabel="Add channel"
          emptyLabel="No input channels yet."
        />
        {editingChannelId != null && (
          <MobileChannelEditSheet
            eventId={eventId}
            readOnly={readOnly}
            channel={editingChannel}
            channels={channels}
            sources={sources}
            stageboxes={stageboxes}
            cables={cables}
            onClose={() => setEditingChannelId(null)}
            onSaved={invalidate}
          />
        )}

        {/* Not redrawn for the phone: `ui/Drawer` is `ui/Sheet` below 768px, so these
            are the same component trees the desk renders, at `h-10` and 44px. No drawer
            file was edited to get here (audit.md M5). */}
        <RigDrawer
          audioItems={allAudioItems}
          cables={[...cables, ...(audioQuery.data?.output_cables ?? [])]}
          consoleSection={
            <ConsoleSection
              audioItems={allAudioItems}
              channels={channels}
              consoles={consoles}
              eventId={eventId}
              outputs={audioQuery.data?.outputs ?? []}
              ownedItems={ownedItems}
              readOnly={readOnly}
            />
          }
          deviceSections={
            <InputDeviceSection audioItems={allAudioItems} devices={devices} eventId={eventId} ownedItems={ownedItems} readOnly={readOnly} />
          }
          eventId={eventId}
          itemCount={consoles.length + stageboxes.length + stageMultis.length + devices.length}
          onClose={() => setDrawer(null)}
          open={drawer === 'rig'}
          readOnly={readOnly}
          stageMultis={stageMultis}
          stageboxes={stageboxes}
        />
        <BusesDrawer
          channels={channels}
          dcas={dcas}
          eventId={eventId}
          groups={groups}
          onClose={() => setDrawer(null)}
          open={drawer === 'buses'}
          readOnly={readOnly}
        />
      </div>

      {/*
        A sibling of the `print:hidden` wrapper, not inside it (audit.md M11).

        The wrapper is doing its job — a panel must not print — and the bug was that it
        was the *only* thing in this branch, so printing from a phone produced a blank
        page. This is exactly the desktop return's shape (patterns.md §7h).
      */}
      <InputPatchSheet
        cables={cables}
        channels={channels}
        consoles={consoles}
        dcas={dcas}
        devices={devices}
        eventId={eventId}
        groups={groups}
        itemLabelById={itemLabelById}
        sources={sources}
        stageMultis={stageMultis}
        stageboxes={stageboxes}
      />
      </>
    )
  }

  /**
   * The graph node a sheet hop points at (Slice 25 FR-003). The sheet's node kinds
   * come from the chain and the graph's from the canvas, and they do not quite
   * agree: a chain's tail is the channel row itself, which is not a box you can
   * select — the input graph's `channel` nodes are keyed by *desk*, not by channel
   * — and `mixer`/`device_link` do not exist on this graph at all. Those return
   * nothing, and the caller then leaves the view alone rather than switching to a
   * canvas with nothing selected.
   */
  const flowSelectionFor = (node: SegmentNode): InputFlowSelection | null => {
    switch (node.kind) {
      case 'source':
      case 'stagebox':
      case 'stage_multi':
      case 'device':
      case 'console_local':
        return { kind: node.kind, id: node.id }
      default:
        return null
    }
  }

  const openInFlow = (node: SegmentNode) => {
    const next = flowSelectionFor(node)
    if (!next) return
    setSelection(next)
    setView('flow')
  }

  const addChannel = () => {
    const highest = channels.reduce((max, channel) => Math.max(max, channel.channel_number), 0)
    addChannelMutation.mutate({ channel_number: highest + 1, width: 'mono', mixer_behavior: 'stereo_channel' })
  }

  return (
    <>
      <AudioPatchShell
        tab="inputs"
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        onOpenRig={readOnly ? undefined : () => setDrawer('rig')}
        onOpenBuses={readOnly ? undefined : () => setDrawer('buses')}
        onAdd={readOnly ? undefined : addChannel}
        toolbarExtras={view === 'flow' ? <ZoomControl zoom={zoom} onZoomChange={setZoom} /> : undefined}
        drawers={
          <>
            <RigDrawer
              open={drawer === 'rig'}
              onClose={() => setDrawer(null)}
              eventId={eventId}
              stageboxes={stageboxes}
              stageMultis={stageMultis}
              audioItems={allAudioItems}
              cables={[...cables, ...(audioQuery.data?.output_cables ?? [])]}
              itemCount={consoles.length + stageboxes.length + stageMultis.length + devices.length}
              readOnly={readOnly}
              consoleSection={
                <ConsoleSection
                  eventId={eventId}
                  consoles={consoles}
                  channels={channels}
                  outputs={audioQuery.data?.outputs ?? []}
                  audioItems={allAudioItems}
                  ownedItems={ownedItems}
                  readOnly={readOnly}
                />
              }
              deviceSections={
                <InputDeviceSection eventId={eventId} devices={devices} audioItems={allAudioItems} ownedItems={ownedItems} readOnly={readOnly} />
              }
            />
            <BusesDrawer
              open={drawer === 'buses'}
              onClose={() => setDrawer(null)}
              eventId={eventId}
              groups={groups}
              dcas={dcas}
              channels={channels}
              readOnly={readOnly}
            />
          </>
        }
      >
        {view === 'sheet' ? (
          <InputSheet
            eventId={eventId}
            channels={channels}
            sources={sources}
            devices={devices}
            stageboxes={stageboxes}
            stageMultis={stageMultis}
            cables={cables}
            groups={groups}
            dcas={dcas}
            consoles={consoles}
            cableItems={cableItems}
            itemLabelById={itemLabelById}
            search={search}
            onEditInFlow={openInFlow}
            onOpenRig={readOnly ? undefined : () => setDrawer('rig')}
            readOnly={readOnly}
          />
        ) : (
          <InputGraphCanvas
            eventId={eventId}
            sources={sources}
            channels={channels}
            devices={devices}
            stageboxes={stageboxes}
            stageMultis={stageMultis}
            cables={cables}
            cableItems={cableItems}
            consoles={consoles}
            micItems={micItems}
            standItems={standItems}
            itemLabelById={itemLabelById}
            search={search}
            selection={selection}
            onSelectionChange={setSelection}
            zoom={zoom}
            onChanged={invalidate}
            readOnly={readOnly}
          />
        )}
      </AudioPatchShell>
      <InputPatchSheet
        eventId={eventId}
        channels={channels}
        sources={sources}
        devices={devices}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        cables={cables}
        groups={groups}
        dcas={dcas}
        consoles={consoles}
        itemLabelById={itemLabelById}
      />
    </>
  )
}
