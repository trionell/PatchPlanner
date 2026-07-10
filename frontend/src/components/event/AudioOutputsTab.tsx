import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, Plus, Table2, Trash2, Unplug } from 'lucide-react'
import {
  createAudioOutput,
  createOutputCable,
  deleteAudioOutput,
  deleteOutputCable,
  deleteOutputDevice,
  getAudioPatch,
  updateAudioOutput,
  updateOutputCable,
  updateOutputDevice,
  updateOutputMixerPosition,
  updateStagebox,
  updateStageMulti,
} from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import {
  cableAtPort,
  devicePorts,
  isCablelessToKind,
  isPortConnected,
  mixerPorts,
  nodeName,
  nodeZone,
  resolvePortRef,
  stageboxPorts,
  stageMultiPorts,
  type PortRef,
  type Zone,
} from '../../lib/outputGraph'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, InventoryItem, OutputCable, OutputDevice, OwnedItem, StageMulti, Stagebox } from '../../types'
import { ProcessingDeviceSection } from './ProcessingDeviceSection'
import { TrueOutputDeviceSection } from './TrueOutputDeviceSection'
import { OutputPatchSheet } from '../print/OutputPatchSheet'
import { PrintButton } from '../print/PrintButton'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { ColorSelect } from './ColorSelect'
import { StageboxMultiSection } from './StageboxMultiSection'

const portKey = (kind: PortRef['kind'], id: number, port: number, direction: 'in' | 'out') => `${kind}|${id}|${port}|${direction}`

function parsePortKey(key: string): { kind: PortRef['kind']; id: number; port: number; direction: 'in' | 'out' } | null {
  const [kind, id, port, direction] = key.split('|')
  if (!kind || !id || !port || !direction) return null
  return { kind: kind as PortRef['kind'], id: Number(id), port: Number(port), direction: direction as 'in' | 'out' }
}

export function AudioOutputsTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: () => getAudioPatch(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })
  const cableQuery = useQuery({ queryKey: ['inventory-items', 'role', 'cable'], queryFn: () => listInventoryItems({ role: 'cable' }) })
  const ownedQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })

  const [outputs, setOutputs] = useDraftState(audioQuery.data, (data) => data.outputs, [] as AudioPatchOutput[])
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph')

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addOutputMutation = useMutation({ mutationFn: (payload: Omit<AudioPatchOutput, 'id'>) => createAudioOutput(eventId, payload), onSuccess: invalidate })
  const saveOutputMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, payload), onSuccess: invalidate })
  const deleteOutputMutation = useMutation({ mutationFn: (id: number) => deleteAudioOutput(eventId, id), onSuccess: invalidate })

  const allAudioItems: InventoryItem[] = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const cableItems: InventoryItem[] = useMemo(() => cableQuery.data ?? [], [cableQuery.data])
  const ownedItems: OwnedItem[] = useMemo(() => ownedQuery.data ?? [], [ownedQuery.data])
  const stageboxes = audioQuery.data?.stageboxes ?? []
  const stageMultis = audioQuery.data?.stage_multis ?? []
  const outputDevices = audioQuery.data?.output_devices ?? []
  const outputCables = audioQuery.data?.output_cables ?? []
  const mixerPositionY = audioQuery.data?.output_mixer_position_y ?? 0

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems],
  )
  const ownedItemLabelById = useMemo(() => new Map(ownedItems.map((item) => [item.id, item.name])), [ownedItems])

  function updateDraft<K extends keyof AudioPatchOutput>(index: number, key: K, value: AudioPatchOutput[K]) {
    setOutputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }
  async function persistOutput(row: AudioPatchOutput) {
    await saveOutputMutation.mutateAsync({ id: row.id, payload: row })
  }
  function updateAndPersistOutput(index: number, patch: Partial<AudioPatchOutput>) {
    const updated = { ...outputs[index], ...patch }
    setOutputs((current) => current.map((row, rowIndex) => (rowIndex === index ? updated : row)))
    void persistOutput(updated)
  }
  const addOutputRow = () => {
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    addOutputMutation.mutate({ event_id: eventId, output_number: lastNumber + 1, output_name: '', output_type: 'foh', width: 'mono', notes: '' })
  }

  return (
    <>
      <div className="print:hidden space-y-6">
        <OutputChannelsSection
          outputs={outputs}
          onUpdateDraft={updateDraft}
          onPersist={(index) => persistOutput(outputs[index])}
          onUpdateAndPersist={updateAndPersistOutput}
          onAdd={addOutputRow}
          onDelete={(id) => deleteOutputMutation.mutate(id)}
        />
        <StageboxMultiSection eventId={eventId} stageboxes={stageboxes} stageMultis={stageMultis} audioItems={allAudioItems} />
        <ProcessingDeviceSection eventId={eventId} devices={outputDevices} audioItems={allAudioItems} ownedItems={ownedItems} />
        <TrueOutputDeviceSection eventId={eventId} devices={outputDevices} audioItems={allAudioItems} ownedItems={ownedItems} />
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Signal flow</CardTitle>
            <div className="flex gap-2">
              <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-1">
                <Button
                  size="sm"
                  variant={viewMode === 'graph' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('graph')}
                  className="h-8"
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />Graph
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('table')}
                  className="h-8"
                >
                  <Table2 className="mr-2 h-4 w-4" />Table
                </Button>
              </div>
              <PrintButton />
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === 'graph' ? (
              <OutputGraphCanvas
                eventId={eventId}
                outputs={outputs}
                stageboxes={stageboxes}
                stageMultis={stageMultis}
                devices={outputDevices}
                cables={outputCables}
                mixerPositionY={mixerPositionY}
                cableItems={cableItems}
                onChanged={invalidate}
              />
            ) : (
              <OutputResourceTable
                outputs={outputs}
                stageboxes={stageboxes}
                stageMultis={stageMultis}
                devices={outputDevices}
                cables={outputCables}
                itemLabelById={itemLabelById}
                ownedItemLabelById={ownedItemLabelById}
              />
            )}
          </CardContent>
        </Card>
      </div>
      <OutputPatchSheet
        eventId={eventId}
        outputs={outputs}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={outputDevices}
        outputCables={outputCables}
        itemLabelById={itemLabelById}
      />
    </>
  )
}

/** Compact table for output-channel (mixer port group) CRUD — feeds the graph's mixer node. */
function OutputChannelsSection({
  outputs,
  onUpdateDraft,
  onPersist,
  onUpdateAndPersist,
  onAdd,
  onDelete,
}: {
  outputs: AudioPatchOutput[]
  onUpdateDraft: <K extends keyof AudioPatchOutput>(index: number, key: K, value: AudioPatchOutput[K]) => void
  onPersist: (index: number) => void
  onUpdateAndPersist: (index: number, patch: Partial<AudioPatchOutput>) => void
  onAdd: () => void
  onDelete: (id: number) => void
}) {
  const { options } = useReferenceData()
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Output channels</CardTitle>
        <Button size="sm" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Add channel</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {['Out#', 'Name', 'Type', 'Width', 'Color', 'Notes', ''].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {outputs.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell><Input type="number" value={row.output_number} onChange={(e) => onUpdateDraft(index, 'output_number', Number(e.target.value))} onBlur={() => onPersist(index)} className="w-20" /></TableCell>
                  <TableCell><Input value={row.output_name ?? ''} onChange={(e) => onUpdateDraft(index, 'output_name', e.target.value)} onBlur={() => onPersist(index)} className="min-w-36" /></TableCell>
                  <TableCell>
                    <div className="space-y-2 min-w-28">
                      <Badge variant={row.output_type === 'aux' ? 'warning' : row.output_type}>{row.output_type}</Badge>
                      <Select value={row.output_type} onChange={(e) => onUpdateDraft(index, 'output_type', e.target.value)} onBlur={() => onPersist(index)}>
                        {options('output_types', row.output_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-24">
                      <Select value={row.width} onChange={(e) => onUpdateAndPersist(index, { width: e.target.value as AudioPatchOutput['width'] })}>
                        <option value="mono">Mono</option>
                        <option value="stereo">Stereo</option>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell><ColorSelect value={row.color} onChange={(color) => onUpdateAndPersist(index, { color })} /></TableCell>
                  <TableCell><Input value={row.notes ?? ''} onChange={(e) => onUpdateDraft(index, 'notes', e.target.value)} onBlur={() => onPersist(index)} className="min-w-36" /></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => onDelete(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

const NODE_WIDTH = 200
const CANVAS_WIDTH = 1180
const CANVAS_HEIGHT = 640
const ZONE_SOURCES_X = 24
const ZONE_DESTINATIONS_X = CANVAS_WIDTH - NODE_WIDTH - 24
const ZONE_PROCESSING_MIN_X = 264
const ZONE_PROCESSING_MAX_X = CANVAS_WIDTH - NODE_WIDTH - 264

interface NodeLayout {
  kind: PortRef['kind']
  id: number
  x: number
  y: number
  zone: Zone
}

/**
 * The interactive Sankey-style canvas: three visually distinct zones —
 * Sources (mixer + source-role devices, left, vertical reorder only),
 * Processing (stageboxes, stage multis, and processing-role devices,
 * free 2D drag), Destinations (destination-role devices, right, vertical
 * reorder only). Every node is draggable within its own zone. Cables
 * render as an SVG bezier overlay tracking live port DOM positions.
 * Connect two ports either by clicking a free port then a compatible
 * free port, or by dragging from one port and releasing on another — a
 * live ghost line follows the pointer during a drag. The catalog picker
 * pops up before a connection commits, except into a stage multi or
 * stagebox's input side (FR-013 — pure console/network routing, never a
 * physical cable). A mixer port is a logical channel, not a physical
 * jack, so it may fan out to more than one destination at once.
 */
function OutputGraphCanvas({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  devices,
  cables,
  mixerPositionY,
  cableItems,
  onChanged,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  mixerPositionY: number
  cableItems: InventoryItem[]
  onChanged: () => Promise<void>
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const portEls = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ id: number; d: string; hasItem: boolean }[]>([])
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null)
  const [dragGhost, setDragGhost] = useState<{ from: PortRef; x: number; y: number } | null>(null)
  const [pickerPair, setPickerPair] = useState<{ from: PortRef; to: PortRef } | null>(null)
  const [infoCable, setInfoCable] = useState<OutputCable | null>(null)
  const [error, setError] = useState<string | null>(null)

  const portContext = { outputs, stageboxes, stageMultis, devices }

  const createCableMutation = useMutation({
    mutationFn: (data: Omit<OutputCable, 'id' | 'event_id'>) => createOutputCable(eventId, data),
    onSuccess: onChanged,
  })
  const updateCableMutation = useMutation({
    mutationFn: ({ id, cableItemId }: { id: number; cableItemId: number | undefined }) => updateOutputCable(eventId, id, cableItemId),
    onSuccess: onChanged,
  })
  const deleteCableMutation = useMutation({
    mutationFn: (id: number) => deleteOutputCable(eventId, id),
    onSuccess: onChanged,
  })
  const moveDeviceMutation = useMutation({
    mutationFn: ({ id, device }: { id: number; device: Omit<OutputDevice, 'id' | 'event_id'> }) => updateOutputDevice(eventId, id, device),
    onSuccess: onChanged,
  })
  const moveStageboxMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<Stagebox, 'id'> }) => updateStagebox(eventId, id, data),
    onSuccess: onChanged,
  })
  const moveStageMultiMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<StageMulti, 'id'> }) => updateStageMulti(eventId, id, data),
    onSuccess: onChanged,
  })
  const moveMixerMutation = useMutation({
    mutationFn: (y: number) => updateOutputMixerPosition(eventId, y),
    onSuccess: onChanged,
  })
  const deleteDeviceMutation = useMutation({
    mutationFn: (id: number) => deleteOutputDevice(eventId, id),
    onSuccess: onChanged,
  })

  const registerPort = (key: string) => (el: HTMLElement | null) => {
    if (el) portEls.current.set(key, el)
    else portEls.current.delete(key)
  }

  // Filtered once per actual `devices` change, not per render — feeding
  // brand-new array references into layout's useMemo every render would
  // defeat its memoization and cause a render loop (see the fixed
  // "Maximum update depth exceeded" crash).
  const sourceDevices = useMemo(() => devices.filter((d) => nodeZone('device', d.id, { devices }) === 'sources'), [devices])
  const destinationDevices = useMemo(() => devices.filter((d) => nodeZone('device', d.id, { devices }) === 'destinations'), [devices])
  const processingDevices = useMemo(() => devices.filter((d) => nodeZone('device', d.id, { devices }) === 'processing'), [devices])

  function effectivePosition(kind: PortRef['kind'], id: number, serverX: number, serverY: number) {
    const override = positions.get(`${kind}:${id}`)
    return override ?? { x: serverX, y: serverY }
  }

  const layout = useMemo<NodeLayout[]>(() => {
    const nodes: NodeLayout[] = []
    const mixerPos = positions.get('mixer:0')
    nodes.push({ kind: 'mixer', id: 0, x: ZONE_SOURCES_X, y: mixerPos?.y ?? mixerPositionY, zone: 'sources' })

    for (const device of sourceDevices) {
      const pos = effectivePosition('device', device.id, ZONE_SOURCES_X, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: ZONE_SOURCES_X, y: pos.y, zone: 'sources' })
    }

    for (const device of destinationDevices) {
      const pos = effectivePosition('device', device.id, ZONE_DESTINATIONS_X, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: ZONE_DESTINATIONS_X, y: pos.y, zone: 'destinations' })
    }

    for (const sb of stageboxes) {
      const pos = effectivePosition('stagebox', sb.id, sb.position_x, sb.position_y)
      nodes.push({ kind: 'stagebox', id: sb.id, x: clampProcessingX(pos.x), y: pos.y, zone: 'processing' })
    }
    for (const sm of stageMultis) {
      const pos = effectivePosition('stage_multi', sm.id, sm.position_x, sm.position_y)
      nodes.push({ kind: 'stage_multi', id: sm.id, x: clampProcessingX(pos.x), y: pos.y, zone: 'processing' })
    }
    for (const device of processingDevices) {
      const pos = effectivePosition('device', device.id, device.position_x, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: clampProcessingX(pos.x), y: pos.y, zone: 'processing' })
    }
    return nodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixerPositionY, sourceDevices, destinationDevices, stageboxes, stageMultis, processingDevices, positions])

  useLayoutEffect(() => {
    const container = canvasRef.current
    if (!container) {
      setPaths([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    const next = cables
      .map((cable) => {
        const fromEl = portEls.current.get(portKey(cable.from_kind, cable.from_id, cable.from_port, 'out'))
        const toEl = portEls.current.get(portKey(cable.to_kind, cable.to_id, cable.to_port, 'in'))
        if (!fromEl || !toEl) return null
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        const x1 = fromRect.left + fromRect.width / 2 - containerRect.left
        const y1 = fromRect.top + fromRect.height / 2 - containerRect.top
        const x2 = toRect.left + toRect.width / 2 - containerRect.left
        const y2 = toRect.top + toRect.height / 2 - containerRect.top
        const dx = Math.max(60, Math.abs(x2 - x1) / 2)
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
        return { id: cable.id, d, hasItem: cable.cable_item_id != null || isCablelessToKind(cable.to_kind) }
      })
      .filter((p): p is { id: number; d: string; hasItem: boolean } => p !== null)
    setPaths(next)
  }, [cables, layout])

  function persistPosition(kind: PortRef['kind'], id: number, x: number, y: number) {
    const onError = (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save position')
    if (kind === 'mixer') {
      moveMixerMutation.mutate(y, { onError })
      return
    }
    if (kind === 'stagebox') {
      const sb = stageboxes.find((s) => s.id === id)
      if (!sb) return
      moveStageboxMutation.mutate({ id, data: { ...sb, position_x: x, position_y: y } }, { onError })
      return
    }
    if (kind === 'stage_multi') {
      const sm = stageMultis.find((s) => s.id === id)
      if (!sm) return
      moveStageMultiMutation.mutate({ id, data: { ...sm, position_x: x, position_y: y } }, { onError })
      return
    }
    const device = devices.find((d) => d.id === id)
    if (!device) return
    moveDeviceMutation.mutate({ id, device: { ...device, position_x: x, position_y: y } }, { onError })
  }

  function startNodeDrag(kind: PortRef['kind'], id: number, mode: 'y-only' | 'free', event: ReactPointerEvent) {
    const node = layout.find((n) => n.kind === kind && n.id === id)
    if (!node) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const origin = { x: node.x, y: node.y }
    let latest = origin
    const key = `${kind}:${id}`

    function onMove(moveEvent: PointerEvent) {
      const dx = mode === 'free' ? moveEvent.clientX - startX : 0
      const dy = moveEvent.clientY - startY
      const x = mode === 'free' ? clampProcessingX(origin.x + dx) : origin.x
      const y = Math.max(8, origin.y + dy)
      latest = { x, y }
      setPositions((current) => new Map(current).set(key, latest))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persistPosition(kind, id, latest.x, latest.y)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function findPortAtPoint(x: number, y: number): PortRef | undefined {
    const el = document.elementFromPoint(x, y)?.closest('[data-port-key]')
    const key = el?.getAttribute('data-port-key')
    if (!key) return undefined
    const parsed = parsePortKey(key)
    if (!parsed) return undefined
    return resolvePortRef(parsed.kind, parsed.id, parsed.port, parsed.direction, portContext)
  }

  function attemptConnect(from: PortRef, to: PortRef) {
    setError(null)
    if (to.kind === 'stagebox' || to.kind === 'stage_multi') {
      createCableMutation.mutate(
        { from_kind: from.kind, from_id: from.id, from_port: from.port, to_kind: to.kind, to_id: to.id, to_port: to.port },
        { onError: (e) => setError(e instanceof Error ? e.message : 'Failed to connect') },
      )
      return
    }
    setPickerPair({ from, to })
  }

  function handlePortClick(port: PortRef) {
    setError(null)
    // A mixer port is a logical channel, not a physical jack — clicking
    // it always starts (or completes) a connection, even if it already
    // carries a cable (fan-out). Every other kind shows the existing
    // cable's info on a plain click instead.
    if (port.kind !== 'mixer' && isPortConnected(port.kind, port.id, port.port, port.direction, cables)) {
      setInfoCable(cableAtPort(port.kind, port.id, port.port, port.direction, cables) ?? null)
      return
    }
    if (!pendingPort) {
      setPendingPort(port)
      return
    }
    if (pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction) {
      setPendingPort(null)
      return
    }
    if (pendingPort.direction === port.direction) {
      setPendingPort(port)
      return
    }
    const from = pendingPort.direction === 'out' ? pendingPort : port
    const to = pendingPort.direction === 'out' ? port : pendingPort
    setPendingPort(null)
    attemptConnect(from, to)
  }

  function handlePortPointerDown(port: PortRef, event: ReactPointerEvent) {
    event.stopPropagation()
    // A non-mixer port already carrying a cable has nothing new to drag
    // — go straight to its info dialog, the same as a plain click,
    // regardless of any movement that follows. A mixer port is exempt
    // (fan-out: dragging from an already-connected channel starts a
    // genuine new connection).
    if (port.kind !== 'mixer' && isPortConnected(port.kind, port.id, port.port, port.direction, cables)) {
      handlePortClick(port)
      return
    }
    const startX = event.clientX
    const startY = event.clientY
    let dragged = false
    setDragGhost({ from: port, x: startX, y: startY })

    function onMove(moveEvent: PointerEvent) {
      if (!dragged && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) dragged = true
      setDragGhost({ from: port, x: moveEvent.clientX, y: moveEvent.clientY })
    }
    function onUp(upEvent: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragGhost(null)
      if (!dragged) {
        handlePortClick(port)
        return
      }
      const target = findPortAtPoint(upEvent.clientX, upEvent.clientY)
      if (!target || target.direction === port.direction) return
      if (target.kind === port.kind && target.id === port.id && target.port === port.port) return
      if (target.kind !== 'mixer' && isPortConnected(target.kind, target.id, target.port, target.direction, cables)) {
        setError(`${target.label} is already connected — disconnect it first.`)
        return
      }
      const from = port.direction === 'out' ? port : target
      const to = port.direction === 'out' ? target : port
      attemptConnect(from, to)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Same reasoning as the `paths` effect above: a DOM measurement, so it
  // belongs in an effect (the only place ref values are safe to read),
  // not computed during render via useMemo.
  const [ghostPath, setGhostPath] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!dragGhost || !canvasRef.current) {
      setGhostPath(null)
      return
    }
    const fromEl = portEls.current.get(portKey(dragGhost.from.kind, dragGhost.from.id, dragGhost.from.port, dragGhost.from.direction))
    if (!fromEl) {
      setGhostPath(null)
      return
    }
    const containerRect = canvasRef.current.getBoundingClientRect()
    const fromRect = fromEl.getBoundingClientRect()
    const x1 = fromRect.left + fromRect.width / 2 - containerRect.left
    const y1 = fromRect.top + fromRect.height / 2 - containerRect.top
    const x2 = dragGhost.x - containerRect.left
    const y2 = dragGhost.y - containerRect.top
    const dx = Math.max(60, Math.abs(x2 - x1) / 2)
    setGhostPath(`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`)
  }, [dragGhost])

  return (
    <div className="space-y-2">
      {error && <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {pendingPort && !dragGhost && (
        <div className="text-xs text-amber-400">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className="grid grid-cols-3 px-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <span>← Sources</span>
        <span className="text-center">Processing</span>
        <span className="text-right">Destinations →</span>
      </div>
      <div className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
        <div ref={canvasRef} className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-52 border-r border-dashed border-zinc-800 bg-white/[0.02]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-52 border-l border-dashed border-zinc-800 bg-white/[0.02]" />
          <svg className="pointer-events-none absolute inset-0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
            {paths.map((p) => (
              <path key={p.id} d={p.d} fill="none" stroke={p.hasItem ? '#f59e0b' : '#71717a'} strokeWidth={2} strokeDasharray={p.hasItem ? undefined : '4 3'} />
            ))}
            {ghostPath && <path d={ghostPath} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" opacity={0.85} />}
          </svg>
          {layout.map((node) => {
            if (node.kind === 'mixer') {
              return (
                <MixerNode
                  key="mixer"
                  x={node.x}
                  y={node.y}
                  outputs={outputs}
                  cables={cables}
                  pendingPort={pendingPort}
                  onPortClick={handlePortClick}
                  onPortPointerDown={handlePortPointerDown}
                  registerPort={registerPort}
                  onDragStart={(e) => startNodeDrag('mixer', 0, 'y-only', e)}
                />
              )
            }
            if (node.kind === 'stagebox') {
              const sb = stageboxes.find((s) => s.id === node.id)
              if (!sb) return null
              return (
                <StageboxNode
                  key={`sb-${sb.id}`}
                  x={node.x}
                  y={node.y}
                  stagebox={sb}
                  cables={cables}
                  pendingPort={pendingPort}
                  onPortClick={handlePortClick}
                  onPortPointerDown={handlePortPointerDown}
                  registerPort={registerPort}
                  onDragStart={(e) => startNodeDrag('stagebox', sb.id, 'free', e)}
                />
              )
            }
            if (node.kind === 'stage_multi') {
              const sm = stageMultis.find((s) => s.id === node.id)
              if (!sm) return null
              return (
                <StageMultiNode
                  key={`sm-${sm.id}`}
                  x={node.x}
                  y={node.y}
                  stageMulti={sm}
                  cables={cables}
                  pendingPort={pendingPort}
                  onPortClick={handlePortClick}
                  onPortPointerDown={handlePortPointerDown}
                  registerPort={registerPort}
                  onDragStart={(e) => startNodeDrag('stage_multi', sm.id, 'free', e)}
                />
              )
            }
            const device = devices.find((d) => d.id === node.id)
            if (!device) return null
            return (
              <DeviceNode
                key={`dev-${device.id}`}
                x={node.x}
                y={node.y}
                device={device}
                cables={cables}
                pendingPort={pendingPort}
                onPortClick={handlePortClick}
                onPortPointerDown={handlePortPointerDown}
                registerPort={registerPort}
                onDragStart={(e) => startNodeDrag('device', device.id, node.zone === 'processing' ? 'free' : 'y-only', e)}
                onDelete={() => deleteDeviceMutation.mutate(device.id)}
              />
            )
          })}
        </div>
      </div>
      {devices.length === 0 && stageboxes.length === 0 && stageMultis.length === 0 && (
        <p className="text-xs text-zinc-500">No devices yet — add one below, then click or drag from a port here to start cabling.</p>
      )}

      {pickerPair && (
        <CableItemPicker
          from={pickerPair.from}
          to={pickerPair.to}
          cableItems={cableItems}
          onCancel={() => setPickerPair(null)}
          onConfirm={(cableItemId) => {
            createCableMutation.mutate(
              {
                from_kind: pickerPair.from.kind,
                from_id: pickerPair.from.id,
                from_port: pickerPair.from.port,
                to_kind: pickerPair.to.kind as 'stagebox' | 'stage_multi' | 'device',
                to_id: pickerPair.to.id,
                to_port: pickerPair.to.port,
                cable_item_id: cableItemId,
              },
              { onError: (e) => setError(e instanceof Error ? e.message : 'Failed to connect') },
            )
            setPickerPair(null)
          }}
        />
      )}

      {infoCable && (
        <CableInfoDialog
          cable={infoCable}
          cableItems={cableItems}
          onClose={() => setInfoCable(null)}
          onChangeItem={(cableItemId) => {
            updateCableMutation.mutate({ id: infoCable.id, cableItemId })
            setInfoCable(null)
          }}
          onDelete={() => {
            deleteCableMutation.mutate(infoCable.id)
            setInfoCable(null)
          }}
        />
      )}
    </div>
  )
}

function clampProcessingX(x: number): number {
  return Math.max(ZONE_PROCESSING_MIN_X, Math.min(ZONE_PROCESSING_MAX_X, x))
}

function PortDot({
  port,
  connected,
  selected,
  onClick,
  onPointerDown,
  registerRef,
}: {
  port: PortRef
  connected: boolean
  selected: boolean
  onClick: () => void
  onPointerDown: (e: ReactPointerEvent) => void
  registerRef: (el: HTMLElement | null) => void
}) {
  return (
    <button
      type="button"
      ref={registerRef}
      data-port-key={portKey(port.kind, port.id, port.port, port.direction)}
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={port.label}
      className={`h-3 w-3 shrink-0 cursor-crosshair rounded-full border transition-colors ${
        selected
          ? 'border-amber-400 bg-amber-400'
          : connected
            ? 'border-amber-500 bg-amber-500/70 hover:bg-amber-400'
            : 'border-zinc-500 bg-zinc-800 hover:border-amber-400 hover:bg-amber-400/30'
      }`}
    />
  )
}

function NodeShell({ x, y, title, badge, onDragStart, onDelete, children }: {
  x: number
  y: number
  title: string
  badge?: string
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  children: ReactNode
}) {
  return (
    <div
      className="absolute rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg"
      style={{ left: x, top: y, width: NODE_WIDTH }}
    >
      <div
        className={`flex items-center justify-between gap-2 rounded-t-lg border-b border-zinc-800 px-2 py-1.5 ${onDragStart ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
        onPointerDown={onDragStart}
      >
        <span className="truncate text-xs font-semibold text-zinc-100">{title}</span>
        <div className="flex items-center gap-1">
          {badge && <Badge className="shrink-0">{badge}</Badge>}
          {onDelete && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
              className="text-zinc-500 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1 p-2">{children}</div>
    </div>
  )
}

function PortRow({ label, port, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, align }: {
  label: string
  port: PortRef
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  align: 'left' | 'right'
}) {
  const key = portKey(port.kind, port.id, port.port, port.direction)
  const connected = isPortConnected(port.kind, port.id, port.port, port.direction, cables)
  const selected = !!pendingPort && pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction
  const dot = (
    <PortDot
      port={port}
      connected={connected}
      selected={selected}
      onClick={() => onPortClick(port)}
      onPointerDown={(e) => onPortPointerDown(port, e)}
      registerRef={registerPort(key)}
    />
  )
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-zinc-300 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      {dot}
      <span className="truncate">{label}</span>
    </div>
  )
}

function MixerNode({ x, y, outputs, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart }: {
  x: number
  y: number
  outputs: AudioPatchOutput[]
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
}) {
  const ports = mixerPorts(outputs)
  return (
    <NodeShell x={x} y={y} title="Mixer" onDragStart={onDragStart}>
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" />
      ))}
      {ports.length === 0 && <p className="text-[11px] text-zinc-600">No output channels yet</p>}
    </NodeShell>
  )
}

function StageboxNode({ x, y, stagebox, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart }: {
  x: number
  y: number
  stagebox: Stagebox
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
}) {
  const { inputs, outputs } = stageboxPorts(stagebox)
  return (
    <NodeShell x={x} y={y} title={stagebox.name} badge="SB" onDragStart={onDragStart}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function StageMultiNode({ x, y, stageMulti, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart }: {
  x: number
  y: number
  stageMulti: StageMulti
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
}) {
  const { inputs, outputs } = stageMultiPorts(stageMulti)
  return (
    <NodeShell x={x} y={y} title={stageMulti.name} badge="Multi" onDragStart={onDragStart}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function DeviceNode({ x, y, device, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, onDelete }: {
  x: number
  y: number
  device: OutputDevice
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
  onDelete: () => void
}) {
  const { inputs, outputs } = devicePorts(device)
  return (
    <NodeShell x={x} y={y} title={device.name} onDragStart={onDragStart} onDelete={onDelete}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function CableItemPicker({ from, to, cableItems, onCancel, onConfirm }: {
  from: PortRef
  to: PortRef
  cableItems: InventoryItem[]
  onCancel: () => void
  onConfirm: (cableItemId: number | undefined) => void
}) {
  const [selected, setSelected] = useState<number | undefined>(undefined)
  return (
    <Dialog open onClose={onCancel} title="Pick a cable">
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">Connecting <span className="text-zinc-200">{from.label}</span> to <span className="text-zinc-200">{to.label}</span>.</p>
        <Select value={selected ?? ''} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">No cable picked yet</option>
          {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(selected)}>Connect</Button>
        </div>
      </div>
    </Dialog>
  )
}

function CableInfoDialog({ cable, cableItems, onClose, onChangeItem, onDelete }: {
  cable: OutputCable
  cableItems: InventoryItem[]
  onClose: () => void
  onChangeItem: (cableItemId: number | undefined) => void
  onDelete: () => void
}) {
  const [selected, setSelected] = useState<number | undefined>(cable.cable_item_id)
  const isBuiltIn = isCablelessToKind(cable.to_kind)
  return (
    <Dialog open onClose={onClose} title="Cable">
      <div className="space-y-4">
        {isBuiltIn ? (
          <p className="text-sm text-zinc-400">
            This run is pure console/network routing — it has no separate cable to pick (the physical link itself is tracked separately, if it's rented at all).
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Catalog item for this run.</p>
            <Select value={selected ?? ''} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">No cable picked</option>
              {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
            </Select>
          </>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="destructive" onClick={onDelete}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {!isBuiltIn && <Button onClick={() => onChangeItem(selected)}>Save</Button>}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

const ZONE_LABEL: Record<Zone, string> = { sources: 'source', processing: 'processing', destinations: 'destination' }
const ZONE_BADGE_VARIANT: Record<Zone, string> = { sources: 'foh', processing: 'warning', destinations: 'success' }

interface ResourceRow {
  key: string
  name: string
  zone: Zone
  ports: string
  from: string
  to: string
  item: string
}

/** Flat "all resources" alternative to the graph — one row per node (not per cable), matching the design proposal. */
function OutputResourceTable({ outputs, stageboxes, stageMultis, devices, cables, itemLabelById, ownedItemLabelById }: {
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  itemLabelById: Map<number, string>
  ownedItemLabelById: Map<number, string>
}) {
  const context = { outputs, stageboxes, stageMultis, devices }

  function upstreamOf(kind: PortRef['kind'], id: number): string {
    const names = new Set(cables.filter((c) => c.to_kind === kind && c.to_id === id).map((c) => nodeName(c.from_kind, c.from_id, context)))
    return names.size > 0 ? [...names].join(', ') : '—'
  }
  function downstreamOf(kind: PortRef['kind'], id: number): string {
    const counts = new Map<string, number>()
    for (const c of cables) {
      if (c.from_kind !== kind || c.from_id !== id) continue
      const name = nodeName(c.to_kind, c.to_id, context)
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    if (counts.size === 0) return '—'
    return [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} (×${count})` : name)).join(', ')
  }

  const rows: ResourceRow[] = []
  const channelCount = mixerPorts(outputs).length
  if (channelCount > 0) {
    const mixerCables = cables.filter((c) => c.from_kind === 'mixer')
    const destinationCounts = new Map<string, number>()
    for (const c of mixerCables) {
      const name = nodeName(c.to_kind, c.to_id, context)
      destinationCounts.set(name, (destinationCounts.get(name) ?? 0) + 1)
    }
    const to = [...destinationCounts.entries()].map(([name, count]) => (count > 1 ? `${name} (×${count})` : name)).join(', ') || '—'
    rows.push({ key: 'mixer', name: 'Mixer', zone: 'sources', ports: `out · ${channelCount}`, from: '—', to, item: '—' })
  }
  for (const sb of stageboxes) {
    rows.push({ key: `sb-${sb.id}`, name: sb.name, zone: 'processing', ports: `in ${sb.output_count} · out ${sb.output_count}`, from: upstreamOf('stagebox', sb.id), to: downstreamOf('stagebox', sb.id), item: sb.inventory_item_id ? itemLabelById.get(sb.inventory_item_id) ?? `#${sb.inventory_item_id}` : '—' })
  }
  for (const sm of stageMultis) {
    rows.push({ key: `sm-${sm.id}`, name: sm.name, zone: 'processing', ports: `in ${sm.channels} · out ${sm.channels}`, from: upstreamOf('stage_multi', sm.id), to: downstreamOf('stage_multi', sm.id), item: sm.inventory_item_id ? itemLabelById.get(sm.inventory_item_id) ?? `#${sm.inventory_item_id}` : '—' })
  }
  for (const device of devices) {
    const zone = nodeZone('device', device.id, { devices })
    const portsLabel = device.input_port_count > 0 && device.output_port_count > 0
      ? `in ${device.input_port_count} · out ${device.output_port_count}`
      : device.input_port_count > 0
        ? `in · ${device.input_port_count}`
        : `out · ${device.output_port_count}`
    const item = device.inventory_item_id
      ? itemLabelById.get(device.inventory_item_id) ?? `#${device.inventory_item_id}`
      : device.owned_item_id
        ? ownedItemLabelById.get(device.owned_item_id) ?? `#${device.owned_item_id}`
        : '—'
    rows.push({ key: `dev-${device.id}`, name: device.name, zone, ports: portsLabel, from: upstreamOf('device', device.id), to: downstreamOf('device', device.id), item })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-300">All resources</h4>
        <span className="font-mono text-xs text-zinc-500">{devices.length + stageboxes.length + stageMultis.length} nodes · {cables.length} cables</span>
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
