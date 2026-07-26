import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Trash2, Unplug } from 'lucide-react'
import {
  createAudioOutput,
  createOutputCable,
  deleteOutputCable,
  deleteOutputDevice,
  getAudioPatch,
  updateOutputCable,
  updateOutputDevice,
  updateOutputMixerPosition,
  updateStagebox,
  updateStageMulti,
} from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useDraftState } from '../../hooks/useDraftState'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePatchView } from '../../hooks/usePatchView'
import { buildMobileOutputList } from '../../lib/mobileOutputList'
import { matchesSearch } from '../../lib/patchSearch'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { MobileOutputEditSheet } from '../mobile/MobileOutputEditSheet'
import {
  cableAtPort,
  devicePorts,
  isCablelessToKind,
  isPortConnected,
  mixerPorts,
  nodeZone,
  resolvePortRef,
  stageboxPorts,
  stageMultiPorts,
  type PortRef,
  type Zone,
} from '../../lib/outputGraph'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, InventoryItem, OutputCable, OutputDevice, OwnedItem, StageMulti, Stagebox } from '../../types'
import { AudioPatchShell } from './AudioPatchShell'
import { OutputSheet } from './OutputSheet'
import { ProcessingDeviceSection } from './ProcessingDeviceSection'
import { RigDrawer } from './RigDrawer'
import { TrueOutputDeviceSection } from './TrueOutputDeviceSection'
import { OutputPatchSheet } from '../print/OutputPatchSheet'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'

const portKey = (kind: PortRef['kind'], id: number, port: number, direction: 'in' | 'out') => `${kind}|${id}|${port}|${direction}`

function parsePortKey(key: string): { kind: PortRef['kind']; id: number; port: number; direction: 'in' | 'out' } | null {
  const [kind, id, port, direction] = key.split('|')
  if (!kind || !id || !port || !direction) return null
  return { kind: kind as PortRef['kind'], id: Number(id), port: Number(port), direction: direction as 'in' | 'out' }
}

export function AudioOutputsTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
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
  const ownedQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })

  // Still a draft copy because the mobile list and the canvas both read it;
  // the sheet writes through its own mutations and refetches.
  const [outputs] = useDraftState(audioQuery.data, (data) => data.outputs, [] as AudioPatchOutput[])
  const isMobile = useIsMobile()
  const [editingOutputId, setEditingOutputId] = useState<number | 'new' | null>(null)
  const [view, setView] = usePatchView(eventId, 'outputs')
  const [search, setSearch] = useState('')
  const [rigOpen, setRigOpen] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addOutputMutation = useMutation({ mutationFn: (payload: Omit<AudioPatchOutput, 'id'>) => createAudioOutput(eventId, payload), onSuccess: invalidate })

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

  const addOutputRow = () => {
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    addOutputMutation.mutate({ event_id: eventId, output_number: lastNumber + 1, output_name: '', output_type: 'foh', width: 'mono', notes: '' })
  }

  if (isMobile) {
    const items = buildMobileOutputList(outputs, { stageboxes, stageMultis, devices: outputDevices, cables: outputCables, itemLabelById }).map((item) => ({
      id: item.id,
      number: item.outputNumber,
      name: item.name,
      subtitle: item.routingLabel,
      color: item.color,
    }))
    const editingOutput = typeof editingOutputId === 'number' ? outputs.find((o) => o.id === editingOutputId) : undefined
    return (
      <div className="print:hidden">
        <MobileEntityList
          items={items}
          onSelect={setEditingOutputId}
          onAdd={() => setEditingOutputId('new')}
          readOnly={readOnly}
          searchPlaceholder="Find an output…"
          addLabel="Add output"
          emptyLabel="No output channels yet."
        />
        {editingOutputId != null && (
          <MobileOutputEditSheet
            eventId={eventId}
            output={editingOutput}
            outputs={outputs}
            stageboxes={stageboxes}
            cables={outputCables}
            onClose={() => setEditingOutputId(null)}
            onSaved={invalidate}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <AudioPatchShell
        tab="outputs"
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        onOpenRig={readOnly ? undefined : () => setRigOpen(true)}
        onAdd={readOnly ? undefined : addOutputRow}
        drawers={
          <RigDrawer
            open={rigOpen}
            onClose={() => setRigOpen(false)}
            eventId={eventId}
            stageboxes={stageboxes}
            stageMultis={stageMultis}
            audioItems={allAudioItems}
            itemCount={stageboxes.length + stageMultis.length + outputDevices.length}
            readOnly={readOnly}
            deviceSections={
              <>
                <ProcessingDeviceSection eventId={eventId} devices={outputDevices} audioItems={allAudioItems} ownedItems={ownedItems} readOnly={readOnly} />
                <TrueOutputDeviceSection eventId={eventId} devices={outputDevices} audioItems={allAudioItems} ownedItems={ownedItems} readOnly={readOnly} />
              </>
            }
          />
        }
      >
        {view === 'sheet' ? (
          <OutputSheet
            eventId={eventId}
            outputs={outputs}
            stageboxes={stageboxes}
            stageMultis={stageMultis}
            devices={outputDevices}
            cables={outputCables}
            cableItems={cableItems}
            itemLabelById={itemLabelById}
            search={search}
            onEditInFlow={() => setView('flow')}
            onOpenRig={readOnly ? undefined : () => setRigOpen(true)}
            readOnly={readOnly}
          />
        ) : (
          <OutputGraphCanvas
            eventId={eventId}
            outputs={outputs}
            stageboxes={stageboxes}
            stageMultis={stageMultis}
            devices={outputDevices}
            cables={outputCables}
            mixerPositionY={mixerPositionY}
            cableItems={cableItems}
            search={search}
            onChanged={invalidate}
            readOnly={readOnly}
          />
        )}
      </AudioPatchShell>
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


const NODE_WIDTH = 200
const CANVAS_HEIGHT = 640
const CANVAS_MIN_WIDTH = 820
const ZONE_SOURCES_X = 24
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

/** Right/middle-zone edges depend on the canvas's live width — the panel resizes with the browser, so these can't be fixed constants. */
function zoneDestinationsX(canvasWidth: number): number {
  return canvasWidth - NODE_WIDTH - 24
}
function zoneProcessingBounds(canvasWidth: number): { min: number; max: number } {
  return { min: 264, max: canvasWidth - NODE_WIDTH - 264 }
}

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
  search = '',
  onChanged,
  readOnly = false,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  mixerPositionY: number
  cableItems: InventoryItem[]
  /**
   * The shell's search term. Non-matching nodes and rows dim; nothing is
   * removed, since hiding a node would hide cables that exist
   * (research.md R14).
   */
  search?: string
  onChanged: () => Promise<void>
  readOnly?: boolean
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const portEls = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ id: number; d: string; hasItem: boolean }[]>([])
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null)
  const [dragGhost, setDragGhost] = useState<{ from: PortRef; x: number; y: number } | null>(null)
  const [pickerPair, setPickerPair] = useState<{ from: PortRef; to: PortRef } | null>(null)
  const [infoCable, setInfoCable] = useState<OutputCable | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The panel's real, live width — not a fixed constant — is what makes
  // the Sources/Processing/Destinations zones actually line up with the
  // panel's edges and follow the browser window when resized, instead of
  // a hardcoded canvas width drifting out of view on any screen narrower
  // than that constant.
  const [wrapperWidth, setWrapperWidth] = useState(1180)
  const [zoom, setZoom] = useState(1)
  // The canvas's LOGICAL width/height (the coordinate space node
  // positions and zone bounds live in) grow as you zoom out and shrink
  // as you zoom in, while canvasRef's own rendered box is scaled by
  // `zoom` so its on-screen footprint always exactly matches the panel
  // in both dimensions — zooming out reveals more logical room for the
  // processing zone within the same panel size, rather than just
  // shrinking the drawing and leaving empty space around/below it.
  const canvasWidth = wrapperWidth / zoom
  const canvasHeight = CANVAS_HEIGHT / zoom

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setWrapperWidth(Math.max(CANVAS_MIN_WIDTH, Math.floor(width)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function clampProcessingX(x: number): number {
    const { min, max } = zoneProcessingBounds(canvasWidth)
    return Math.max(min, Math.min(max, x))
  }

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

    const destX = zoneDestinationsX(canvasWidth)
    for (const device of destinationDevices) {
      const pos = effectivePosition('device', device.id, destX, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: destX, y: pos.y, zone: 'destinations' })
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
  }, [mixerPositionY, sourceDevices, destinationDevices, stageboxes, stageMultis, processingDevices, positions, canvasWidth])

  useLayoutEffect(() => {
    const container = canvasRef.current
    if (!container) {
      setPaths([])
      return
    }
    // canvasRef is the element the zoom transform is applied to, so its
    // own bounding rect is already post-scale screen pixels — dividing
    // the offset from it by `zoom` converts back to the logical
    // coordinate space the SVG (a child of that same scaled element)
    // draws in, so the path aligns with the (also-scaled) node ports
    // regardless of the current zoom level.
    const containerRect = container.getBoundingClientRect()
    const next = cables
      .map((cable) => {
        const fromEl = portEls.current.get(portKey(cable.from_kind, cable.from_id, cable.from_port, 'out'))
        const toEl = portEls.current.get(portKey(cable.to_kind, cable.to_id, cable.to_port, 'in'))
        if (!fromEl || !toEl) return null
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        const x1 = (fromRect.left + fromRect.width / 2 - containerRect.left) / zoom
        const y1 = (fromRect.top + fromRect.height / 2 - containerRect.top) / zoom
        const x2 = (toRect.left + toRect.width / 2 - containerRect.left) / zoom
        const y2 = (toRect.top + toRect.height / 2 - containerRect.top) / zoom
        const dx = Math.max(60, Math.abs(x2 - x1) / 2)
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
        return { id: cable.id, d, hasItem: cable.cable_item_id != null || isCablelessToKind(cable.to_kind) }
      })
      .filter((p): p is { id: number; d: string; hasItem: boolean } => p !== null)
    setPaths(next)
  }, [cables, layout, zoom])

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
      // Node positions live in the canvas's unscaled logical coordinate
      // space, but pointer movement is measured in real screen pixels —
      // at zoom 2x, 1 logical pixel covers 2 screen pixels, so a screen
      // delta has to be divided by the current zoom to get the matching
      // logical delta (otherwise dragging at any zoom other than 100%
      // moves nodes faster or slower than the cursor).
      const dx = mode === 'free' ? (moveEvent.clientX - startX) / zoom : 0
      const dy = (moveEvent.clientY - startY) / zoom
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
    // Viewing an existing cable's info (above) stays available; starting
    // a brand-new connection does not.
    if (readOnly) return
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
    if (readOnly) return
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
    const x1 = (fromRect.left + fromRect.width / 2 - containerRect.left) / zoom
    const y1 = (fromRect.top + fromRect.height / 2 - containerRect.top) / zoom
    const x2 = (dragGhost.x - containerRect.left) / zoom
    const y2 = (dragGhost.y - containerRect.top) / zoom
    const dx = Math.max(60, Math.abs(x2 - x1) / 2)
    setGhostPath(`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`)
  }, [dragGhost, zoom])

  return (
    <div className="space-y-2">
      {error && <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {pendingPort && !dragGhost && (
        <div className="text-xs text-amber-400">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className="flex items-center justify-between px-1">
        <div className="grid flex-1 grid-cols-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <span>← Sources</span>
          <span className="text-center">Processing</span>
          <span className="text-right">Destinations →</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))} title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="w-11 text-center font-mono text-[11px] text-zinc-400 hover:text-zinc-200" title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))} title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div ref={wrapperRef} className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/40" style={{ height: CANVAS_HEIGHT }}>
        <div style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div ref={canvasRef} className="relative" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            <div className="pointer-events-none absolute inset-y-0 left-0 border-r border-dashed border-zinc-800 bg-white/[0.02]" style={{ width: ZONE_SOURCES_X + NODE_WIDTH + 24 }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 border-l border-dashed border-zinc-800 bg-white/[0.02]" style={{ width: NODE_WIDTH + 48 }} />
            <svg className="pointer-events-none absolute inset-0" width={canvasWidth} height={canvasHeight}>
              {paths.map((p) => (
                <path key={p.id} d={p.d} fill="none" stroke={p.hasItem ? '#f59e0b' : '#71717a'} strokeWidth={2 / zoom} strokeDasharray={p.hasItem ? undefined : `${4 / zoom} ${3 / zoom}`} />
              ))}
              {ghostPath && <path d={ghostPath} fill="none" stroke="#f59e0b" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} opacity={0.85} />}
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
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('mixer', 0, 'y-only', e)}
                    search={search}
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
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('stagebox', sb.id, 'free', e)}
                    dimmed={!matchesSearch(search, sb.name, sb.model)}
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
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('stage_multi', sm.id, 'free', e)}
                    dimmed={!matchesSearch(search, sm.name)}
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
                  onDragStart={readOnly ? undefined : (e) => startNodeDrag('device', device.id, node.zone === 'processing' ? 'free' : 'y-only', e)}
                  onDelete={readOnly ? undefined : () => deleteDeviceMutation.mutate(device.id)}
                  dimmed={!matchesSearch(search, device.name)}
                />
              )
            })}
          </div>
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
          readOnly={readOnly}
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

function NodeShell({ x, y, title, badge, dimmed, onDragStart, onDelete, children }: {
  x: number
  y: number
  title: string
  badge?: string
  /** Search is active and this node doesn't match — still drawn, just quiet. */
  dimmed?: boolean
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  children: ReactNode
}) {
  return (
    <div
      className={`absolute rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg transition-opacity ${dimmed ? 'opacity-30' : ''}`}
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

function PortRow({ label, port, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, align, dimmed }: {
  label: string
  port: PortRef
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  align: 'left' | 'right'
  /** Search is active and this row doesn't match. */
  dimmed?: boolean
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
    <div className={`flex items-center gap-1.5 text-[11px] text-zinc-300 transition-opacity ${align === 'right' ? 'flex-row-reverse text-right' : ''} ${dimmed ? 'opacity-30' : ''}`}>
      {dot}
      <span className="truncate">{label}</span>
    </div>
  )
}

function MixerNode({ x, y, outputs, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, search = '' }: {
  x: number
  y: number
  outputs: AudioPatchOutput[]
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart?: (e: ReactPointerEvent) => void
  search?: string
}) {
  const ports = mixerPorts(outputs)
  // One node, many rows, so search dims per row rather than per node.
  const dimmedIds = new Set(
    outputs.filter((row) => !matchesSearch(search, row.output_number, row.output_name, row.output_type, row.notes)).map((row) => row.id),
  )
  return (
    <NodeShell x={x} y={y} title="Mixer" onDragStart={onDragStart}>
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" dimmed={dimmedIds.has(port.id)} />
      ))}
      {ports.length === 0 && <p className="text-[11px] text-zinc-600">No output channels yet</p>}
    </NodeShell>
  )
}

function StageboxNode({ x, y, stagebox, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, dimmed }: {
  x: number
  y: number
  stagebox: Stagebox
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart?: (e: ReactPointerEvent) => void
  dimmed?: boolean
}) {
  const { inputs, outputs } = stageboxPorts(stagebox)
  return (
    <NodeShell x={x} y={y} title={stagebox.name} badge="SB" onDragStart={onDragStart} dimmed={dimmed}>
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

function StageMultiNode({ x, y, stageMulti, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, dimmed }: {
  x: number
  y: number
  stageMulti: StageMulti
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart?: (e: ReactPointerEvent) => void
  dimmed?: boolean
}) {
  const { inputs, outputs } = stageMultiPorts(stageMulti)
  return (
    <NodeShell x={x} y={y} title={stageMulti.name} badge="Multi" onDragStart={onDragStart} dimmed={dimmed}>
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

function DeviceNode({ x, y, device, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, onDelete, dimmed }: {
  x: number
  y: number
  device: OutputDevice
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  dimmed?: boolean
}) {
  const { inputs, outputs, links } = devicePorts(device)
  return (
    <NodeShell x={x} y={y} title={device.name} onDragStart={onDragStart} onDelete={onDelete} dimmed={dimmed}>
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
          {links.map((port) => (
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

function CableInfoDialog({ cable, cableItems, readOnly, onClose, onChangeItem, onDelete }: {
  cable: OutputCable
  cableItems: InventoryItem[]
  readOnly?: boolean
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
            <Select value={selected ?? ''} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : undefined)} disabled={readOnly}>
              <option value="">No cable picked</option>
              {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
            </Select>
          </>
        )}
        <div className="flex justify-between gap-2">
          {readOnly ? <span /> : <Button variant="destructive" onClick={onDelete}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {!isBuiltIn && !readOnly && <Button onClick={() => onChangeItem(selected)}>Save</Button>}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
