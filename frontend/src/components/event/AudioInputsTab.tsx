import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createInputChannel, getAudioPatch } from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePatchView } from '../../hooks/usePatchView'
import { buildMobileChannelList } from '../../lib/mobileChannelList'
import { itemLabel } from '../../lib/utils'
import type { InputChannel, InventoryItem, OwnedItem } from '../../types'
import { MobileChannelEditSheet } from '../mobile/MobileChannelEditSheet'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { InputPatchSheet } from '../print/InputPatchSheet'
import { AudioPatchShell } from './AudioPatchShell'
import { BusesDrawer } from './BusesDrawer'
import { InputDeviceSection } from './InputDeviceSection'
import { InputGraphCanvas } from './InputGraphCanvas'
import { InputSheet } from './InputSheet'
import { RigDrawer } from './RigDrawer'
import { SourceSection } from './SourceSection'

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
  const [drawer, setDrawer] = useState<'rig' | 'buses' | null>(null)

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
  const groups = audioQuery.data?.groups ?? []
  const dcas = audioQuery.data?.dcas ?? []

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems, ...standItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems, standItems],
  )

  if (isMobile) {
    const items = buildMobileChannelList(channels, { sources, devices, stageboxes, stageMultis, cables, itemLabelById }).map((item) => ({
      id: item.id,
      number: item.channelNumber,
      name: item.name,
      subtitle: `${item.sourceLabel} · ${item.routingLabel}`,
      color: item.color,
    }))
    const editingChannel = typeof editingChannelId === 'number' ? channels.find((c) => c.id === editingChannelId) : undefined
    return (
      <div className="print:hidden">
        <MobileEntityList
          items={items}
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
            channel={editingChannel}
            channels={channels}
            sources={sources}
            stageboxes={stageboxes}
            cables={cables}
            onClose={() => setEditingChannelId(null)}
            onSaved={invalidate}
          />
        )}
      </div>
    )
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
        drawers={
          <>
            <RigDrawer
              open={drawer === 'rig'}
              onClose={() => setDrawer(null)}
              eventId={eventId}
              stageboxes={stageboxes}
              stageMultis={stageMultis}
              audioItems={allAudioItems}
              itemCount={stageboxes.length + stageMultis.length + devices.length}
              readOnly={readOnly}
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
          <div className="space-y-6">
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
              cableItems={cableItems}
              itemLabelById={itemLabelById}
              search={search}
              onEditInFlow={() => setView('flow')}
              onOpenRig={readOnly ? undefined : () => setDrawer('rig')}
              readOnly={readOnly}
            />
            {/* Sources stay here until the Flow inspector can hold a source's
                mic, stand, connector, width and phantom power — see
                specs/023-audio-patch-shell/plan.md § Implementation Sequencing. */}
            <SourceSection
              eventId={eventId}
              sources={sources}
              micItems={micItems}
              standItems={standItems}
              channels={channels}
              devices={devices}
              stageboxes={stageboxes}
              stageMultis={stageMultis}
              cables={cables}
              readOnly={readOnly}
            />
          </div>
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
            search={search}
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
        itemLabelById={itemLabelById}
      />
    </>
  )
}
