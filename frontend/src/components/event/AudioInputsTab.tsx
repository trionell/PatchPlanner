import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, Table2 } from 'lucide-react'
import { getAudioPatch } from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { nodeName, nodeZone, type PortRef } from '../../lib/inputGraph'
import { itemLabel } from '../../lib/utils'
import type { InputCable, InputChannel, InputDevice, InputSource, InventoryItem, OwnedItem, StageMulti, Stagebox } from '../../types'
import { InputPatchSheet } from '../print/InputPatchSheet'
import { PrintButton } from '../print/PrintButton'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { BusSection } from './BusSection'
import { ChannelSection } from './ChannelSection'
import { InputDeviceSection } from './InputDeviceSection'
import { InputGraphCanvas } from './InputGraphCanvas'
import { SourceSection } from './SourceSection'
import { StageboxMultiSection } from './StageboxMultiSection'

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

  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph')

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

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

  return (
    <>
      <div className="print:hidden space-y-6">
        <BusSection eventId={eventId} groups={groups} dcas={dcas} channels={channels} readOnly={readOnly} />
        <ChannelSection
          eventId={eventId}
          channels={channels}
          sources={sources}
          devices={devices}
          stageboxes={stageboxes}
          stageMultis={stageMultis}
          cables={cables}
          groups={groups}
          dcas={dcas}
          readOnly={readOnly}
        />
        <StageboxMultiSection eventId={eventId} stageboxes={stageboxes} stageMultis={stageMultis} audioItems={allAudioItems} readOnly={readOnly} />
        <InputDeviceSection eventId={eventId} devices={devices} audioItems={allAudioItems} ownedItems={ownedItems} readOnly={readOnly} />
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
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Signal flow</CardTitle>
            <div className="flex gap-2">
              <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-1">
                <Button size="sm" variant={viewMode === 'graph' ? 'default' : 'ghost'} onClick={() => setViewMode('graph')} className="h-8">
                  <LayoutGrid className="mr-2 h-4 w-4" />Graph
                </Button>
                <Button size="sm" variant={viewMode === 'table' ? 'default' : 'ghost'} onClick={() => setViewMode('table')} className="h-8">
                  <Table2 className="mr-2 h-4 w-4" />Table
                </Button>
              </div>
              <PrintButton />
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === 'graph' ? (
              <InputGraphCanvas
                eventId={eventId}
                sources={sources}
                channels={channels}
                devices={devices}
                stageboxes={stageboxes}
                stageMultis={stageMultis}
                cables={cables}
                cableItems={cableItems}
                onChanged={invalidate}
                readOnly={readOnly}
              />
            ) : (
              <InputResourceTable
                sources={sources}
                channels={channels}
                devices={devices}
                stageboxes={stageboxes}
                stageMultis={stageMultis}
                cables={cables}
                itemLabelById={itemLabelById}
                ownedItemLabelById={new Map(ownedItems.map((item) => [item.id, item.name]))}
              />
            )}
          </CardContent>
        </Card>
      </div>
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

const ZONE_LABEL: Record<string, string> = { sources: 'source', processing: 'processing', channels: 'channel' }
const ZONE_BADGE_VARIANT: Record<string, string> = { sources: 'foh', processing: 'warning', channels: 'success' }

interface ResourceRow {
  key: string
  name: string
  zone: string
  ports: string
  from: string
  to: string
  item: string
}

/** Flat "all resources" alternative to the graph — one row per node (not per cable), mirroring the Output graph's OutputResourceTable. */
function InputResourceTable({
  sources,
  channels,
  devices,
  stageboxes,
  stageMultis,
  cables,
  itemLabelById,
  ownedItemLabelById,
}: {
  sources: InputSource[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  itemLabelById: Map<number, string>
  ownedItemLabelById: Map<number, string>
}) {
  const context = { sources, channels, devices, stageboxes, stageMultis }

  function upstreamOf(kinds: PortRef['kind'][], id: number): string {
    const names = new Set(cables.filter((c) => kinds.includes(c.to_kind) && c.to_id === id).map((c) => nodeName(c.from_kind, c.from_id, context)))
    return names.size > 0 ? [...names].join(', ') : '—'
  }
  function downstreamOf(kinds: PortRef['kind'][], id: number): string {
    const counts = new Map<string, number>()
    for (const c of cables) {
      if (!kinds.includes(c.from_kind) || c.from_id !== id) continue
      const name = nodeName(c.to_kind, c.to_id, context)
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    if (counts.size === 0) return '—'
    return [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} (×${count})` : name)).join(', ')
  }

  const rows: ResourceRow[] = []
  for (const source of sources) {
    const ports = source.width === 'stereo' ? 'out · 2' : 'out · 1'
    rows.push({ key: `src-${source.id}`, name: source.name, zone: 'sources', ports, from: '—', to: downstreamOf(['source'], source.id), item: source.mic_item_id ? itemLabelById.get(source.mic_item_id) ?? `#${source.mic_item_id}` : '—' })
  }
  for (const sb of stageboxes) {
    rows.push({ key: `sb-${sb.id}`, name: sb.name, zone: 'processing', ports: `in ${sb.input_count} · out ${sb.input_count}`, from: upstreamOf(['stagebox'], sb.id), to: downstreamOf(['stagebox'], sb.id), item: sb.inventory_item_id ? itemLabelById.get(sb.inventory_item_id) ?? `#${sb.inventory_item_id}` : '—' })
  }
  for (const sm of stageMultis) {
    rows.push({ key: `sm-${sm.id}`, name: sm.name, zone: 'processing', ports: `in ${sm.channels} · out ${sm.channels}`, from: upstreamOf(['stage_multi'], sm.id), to: downstreamOf(['stage_multi'], sm.id), item: sm.inventory_item_id ? itemLabelById.get(sm.inventory_item_id) ?? `#${sm.inventory_item_id}` : '—' })
  }
  for (const device of devices) {
    const item = device.inventory_item_id
      ? itemLabelById.get(device.inventory_item_id) ?? `#${device.inventory_item_id}`
      : device.owned_item_id
        ? ownedItemLabelById.get(device.owned_item_id) ?? `#${device.owned_item_id}`
        : '—'
    rows.push({ key: `dev-${device.id}`, name: device.name, zone: 'processing', ports: `in ${device.input_port_count} · out ${device.output_port_count}`, from: upstreamOf(['device'], device.id), to: downstreamOf(['device'], device.id), item })
  }
  for (const channel of channels) {
    const zone = nodeZone('channel')
    rows.push({ key: `ch-${channel.id}`, name: channel.channel_name || `Ch ${channel.channel_number}`, zone, ports: 'in · 1', from: upstreamOf(['stagebox', 'stage_multi', 'device', 'source'], channel.id), to: '—', item: '—' })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-300">All resources</h4>
        <span className="font-mono text-xs text-zinc-500">{sources.length + devices.length + stageboxes.length + stageMultis.length + channels.length} nodes · {cables.length} cables</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{['Resource', 'Kind', 'Ports', 'From', 'To', 'Item'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.name}</TableCell>
                <TableCell><Badge variant={ZONE_BADGE_VARIANT[row.zone]}>{ZONE_LABEL[row.zone]}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">{row.ports}</TableCell>
                <TableCell className="text-zinc-400">{row.from}</TableCell>
                <TableCell className="text-zinc-400">{row.to}</TableCell>
                <TableCell>{row.item}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
