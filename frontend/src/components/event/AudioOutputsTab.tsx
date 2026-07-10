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
} from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import {
  cableAtPort,
  devicePorts,
  isPortConnected,
  mixerPorts,
  nodeName,
  nodeRole,
  stageboxPorts,
  stageMultiPorts,
  type PortRef,
} from '../../lib/outputGraph'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, InventoryItem, OutputCable, OutputDevice, OwnedItem, StageMulti, Stagebox } from '../../types'
import { OutputDeviceSection } from './OutputDeviceSection'
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
        <OutputDeviceSection eventId={eventId} devices={outputDevices} audioItems={allAudioItems} ownedItems={ownedItems} />
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
                cableItems={cableItems}
                onChanged={invalidate}
              />
            ) : (
              <OutputResourceTable
                devices={outputDevices}
                cables={outputCables}
                outputs={outputs}
                stageboxes={stageboxes}
                stageMultis={stageMultis}
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

interface NodeLayout {
  kind: PortRef['kind']
  id: number
  x: number
  y: number
  draggable: boolean
}

/**
 * The interactive Sankey-style canvas (Slice 11 US1/US2): output-only
 * nodes (mixer, stageboxes) pinned to a left rail; input-only device
 * nodes pinned to a right rail; devices with both sides and stage multis
 * free-floating in the middle. Cables render as an SVG overlay tracking
 * each port dot's live DOM position. Clicking a free port, then a
 * compatible free port of the opposite direction, creates a cable —
 * skipping the catalog picker entirely for a stage multi's input side
 * (FR-013).
 */
function OutputGraphCanvas({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  devices,
  cables,
  cableItems,
  onChanged,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  cableItems: InventoryItem[]
  onChanged: () => Promise<void>
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const portEls = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ id: number; d: string; hasItem: boolean }[]>([])
  const [dragPositions, setDragPositions] = useState<Map<number, { x: number; y: number }>>(new Map())
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null)
  const [pickerPair, setPickerPair] = useState<{ from: PortRef; to: PortRef } | null>(null)
  const [infoCable, setInfoCable] = useState<OutputCable | null>(null)
  const [error, setError] = useState<string | null>(null)

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
  const deleteDeviceMutation = useMutation({
    mutationFn: (id: number) => deleteOutputDevice(eventId, id),
    onSuccess: onChanged,
  })

  const registerPort = (key: string) => (el: HTMLElement | null) => {
    if (el) portEls.current.set(key, el)
    else portEls.current.delete(key)
  }

  // Filtered once per actual `devices` change, not per render — feeding
  // these into layout's useMemo with brand-new array references every
  // render (from an unmemoized .filter()) defeated its memoization
  // entirely, which fed a new `layout` reference into the paths effect
  // on every render, which called setState every render: an infinite
  // update loop.
  const sourceDevices = useMemo(() => devices.filter((d) => nodeRole(d) === 'processing' || nodeRole(d) === 'source'), [devices])
  const destinationDevices = useMemo(() => devices.filter((d) => nodeRole(d) === 'destination'), [devices])
  const middleDevices = useMemo(() => devices.filter((d) => nodeRole(d) === 'processing'), [devices])

  const layout = useMemo<NodeLayout[]>(() => {
    const nodes: NodeLayout[] = []
    let leftY = 24
    nodes.push({ kind: 'mixer', id: 0, x: 24, y: leftY, draggable: false })
    leftY += 40 + outputs.length * 26 + 24
    for (const sb of stageboxes) {
      nodes.push({ kind: 'stagebox', id: sb.id, x: 24, y: leftY, draggable: false })
      leftY += 40 + sb.output_count * 22 + 24
    }
    let rightY = 24
    for (const device of destinationDevices) {
      nodes.push({ kind: 'device', id: device.id, x: CANVAS_WIDTH - NODE_WIDTH - 24, y: rightY, draggable: false })
      rightY += 40 + device.input_port_count * 22 + 24
    }
    let multiY = 24
    for (const sm of stageMultis) {
      nodes.push({ kind: 'stage_multi', id: sm.id, x: CANVAS_WIDTH / 2 - NODE_WIDTH / 2, y: multiY, draggable: false })
      multiY += 40 + sm.channels * 22 + 32
    }
    for (const device of middleDevices) {
      const drag = dragPositions.get(device.id)
      nodes.push({ kind: 'device', id: device.id, x: drag?.x ?? device.position_x, y: drag?.y ?? device.position_y, draggable: true })
    }
    return nodes
  }, [outputs.length, stageboxes, stageMultis, destinationDevices, middleDevices, dragPositions])

  // Cable paths are DOM measurements, not derived render state — computed
  // in a layout effect (after nodes/ports have mounted at their new
  // positions) rather than during render, which is the only place ref
  // values are safe to read.
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
        return { id: cable.id, d, hasItem: cable.cable_item_id != null || cable.to_kind === 'stage_multi' }
      })
      .filter((p): p is { id: number; d: string; hasItem: boolean } => p !== null)
    setPaths(next)
  }, [cables, layout])

  function handlePortClick(port: PortRef) {
    setError(null)
    if (isPortConnected(port.kind, port.id, port.port, port.direction, cables)) {
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
    if (to.kind === 'stage_multi') {
      createCableMutation.mutate(
        { from_kind: from.kind, from_id: from.id, from_port: from.port, to_kind: to.kind, to_id: to.id, to_port: to.port },
        { onError: (e) => setError(e instanceof Error ? e.message : 'Failed to connect') },
      )
      return
    }
    setPickerPair({ from, to })
  }

  function handleDragStart(deviceId: number, event: ReactPointerEvent) {
    const device = devices.find((d) => d.id === deviceId)
    if (!device) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const originX = dragPositions.get(deviceId)?.x ?? device.position_x
    const originY = dragPositions.get(deviceId)?.y ?? device.position_y
    // Tracked in a plain closure variable, not a ref: onUp needs the
    // final dragged position, and this is a local, self-contained value
    // for the duration of one drag gesture rather than shared React state.
    let latest = { x: originX, y: originY }

    function onMove(moveEvent: PointerEvent) {
      latest = {
        x: Math.max(0, originX + (moveEvent.clientX - startX)),
        y: Math.max(0, originY + (moveEvent.clientY - startY)),
      }
      setDragPositions((current) => new Map(current).set(deviceId, latest))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      moveDeviceMutation.mutate({
        id: deviceId,
        device: { ...device, position_x: latest.x, position_y: latest.y },
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {pendingPort && (
        <div className="text-xs text-amber-400">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
        <div ref={canvasRef} className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
          <svg className="pointer-events-none absolute inset-0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
            {paths.map((p) => (
              <path key={p.id} d={p.d} fill="none" stroke={p.hasItem ? '#f59e0b' : '#71717a'} strokeWidth={2} strokeDasharray={p.hasItem ? undefined : '4 3'} />
            ))}
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
                  registerPort={registerPort}
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
                  registerPort={registerPort}
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
                  registerPort={registerPort}
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
                draggable={node.draggable}
                device={device}
                cables={cables}
                pendingPort={pendingPort}
                onPortClick={handlePortClick}
                registerPort={registerPort}
                onDragStart={(e) => handleDragStart(device.id, e)}
                onDelete={() => deleteDeviceMutation.mutate(device.id)}
              />
            )
          })}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {sourceDevices.length === 0 && destinationDevices.length === 0 && (
          <>No devices yet — add one below, then click a port here to start cabling.</>
        )}
      </p>

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
                to_kind: pickerPair.to.kind as 'stage_multi' | 'device',
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

function PortDot({
  port,
  connected,
  selected,
  onClick,
  registerRef,
}: {
  port: PortRef
  connected: boolean
  selected: boolean
  onClick: () => void
  registerRef: (el: HTMLElement | null) => void
}) {
  return (
    <button
      type="button"
      ref={registerRef}
      onClick={onClick}
      title={port.label}
      className={`h-3 w-3 shrink-0 rounded-full border transition-colors ${
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
        className={`flex items-center justify-between gap-2 rounded-t-lg border-b border-zinc-800 px-2 py-1.5 ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''}`}
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

function PortRow({ label, port, cables, pendingPort, onPortClick, registerPort, align }: {
  label: string
  port: PortRef
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  align: 'left' | 'right'
}) {
  const key = portKey(port.kind, port.id, port.port, port.direction)
  const connected = isPortConnected(port.kind, port.id, port.port, port.direction, cables)
  const selected = !!pendingPort && pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction
  const dot = <PortDot port={port} connected={connected} selected={selected} onClick={() => onPortClick(port)} registerRef={registerPort(key)} />
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-zinc-300 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      {dot}
      <span className="truncate">{label}</span>
    </div>
  )
}

function MixerNode({ x, y, outputs, cables, pendingPort, onPortClick, registerPort }: {
  x: number
  y: number
  outputs: AudioPatchOutput[]
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
}) {
  const ports = mixerPorts(outputs)
  return (
    <NodeShell x={x} y={y} title="Mixer">
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} registerPort={registerPort} align="right" />
      ))}
      {ports.length === 0 && <p className="text-[11px] text-zinc-600">No output channels yet</p>}
    </NodeShell>
  )
}

function StageboxNode({ x, y, stagebox, cables, pendingPort, onPortClick, registerPort }: {
  x: number
  y: number
  stagebox: Stagebox
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
}) {
  const ports = stageboxPorts(stagebox)
  return (
    <NodeShell x={x} y={y} title={stagebox.name} badge="SB">
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} registerPort={registerPort} align="right" />
      ))}
    </NodeShell>
  )
}

function StageMultiNode({ x, y, stageMulti, cables, pendingPort, onPortClick, registerPort }: {
  x: number
  y: number
  stageMulti: StageMulti
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
}) {
  const { inputs, outputs } = stageMultiPorts(stageMulti)
  return (
    <NodeShell x={x} y={y} title={stageMulti.name} badge="Multi">
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} registerPort={registerPort} align="left" />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} registerPort={registerPort} align="right" />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function DeviceNode({ x, y, draggable, device, cables, pendingPort, onPortClick, registerPort, onDragStart, onDelete }: {
  x: number
  y: number
  draggable: boolean
  device: OutputDevice
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
  onDelete: () => void
}) {
  const { inputs, outputs } = devicePorts(device)
  return (
    <NodeShell x={x} y={y} title={device.name} onDragStart={draggable ? onDragStart : undefined} onDelete={onDelete}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} registerPort={registerPort} align="left" />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} registerPort={registerPort} align="right" />
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
  const isBuiltIn = cable.to_kind === 'stage_multi'
  return (
    <Dialog open onClose={onClose} title="Cable">
      <div className="space-y-4">
        {isBuiltIn ? (
          <p className="text-sm text-zinc-400">
            This run goes into a stage multi's built-in wiring — it has no separate cable to pick (already accounted for by the multi itself).
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

/** Flat "all resources" alternative to the graph — devices and cables as plain tables (spec's explicit ask to keep a basic table view). */
function OutputResourceTable({ devices, cables, outputs, stageboxes, stageMultis, itemLabelById, ownedItemLabelById }: {
  devices: OutputDevice[]
  cables: OutputCable[]
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  itemLabelById: Map<number, string>
  ownedItemLabelById: Map<number, string>
}) {
  const context = { outputs, stageboxes, stageMultis, devices }
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-300">Devices</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>{['Name', 'Item', 'Inputs', 'Outputs'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>{device.name}</TableCell>
                  <TableCell>{device.inventory_item_id ? itemLabelById.get(device.inventory_item_id) : device.owned_item_id ? ownedItemLabelById.get(device.owned_item_id) : '—'}</TableCell>
                  <TableCell>{device.input_port_count > 0 ? `${device.input_port_count} × ${device.input_connector_type}` : '—'}</TableCell>
                  <TableCell>{device.output_port_count > 0 ? `${device.output_port_count} × ${device.output_connector_type}` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-300">Cables</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>{['From', 'To', 'Cable'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {cables.map((cable) => (
                <TableRow key={cable.id}>
                  <TableCell>{nodeName(cable.from_kind, cable.from_id, context)} #{cable.from_port + 1}</TableCell>
                  <TableCell>{nodeName(cable.to_kind, cable.to_id, context)} #{cable.to_port + 1}</TableCell>
                  <TableCell>{cable.cable_item_id ? itemLabelById.get(cable.cable_item_id) : cable.to_kind === 'stage_multi' ? 'built-in' : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
