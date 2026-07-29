import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Printer, Unplug } from 'lucide-react'
import {
  createAudioOutput,
  createOutputCable,
  deleteOutputCable,
  deleteOutputDevice,
  getAudioPatch,
  updateOutputCable,
  updateOutputDevice,
  updateConsole,
  updateStagebox,
  updateStageMulti,
} from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useDraftState } from '../../hooks/useDraftState'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePatchView } from '../../hooks/usePatchView'
import { buildMobileOutputList } from '../../lib/mobileOutputList'
import { outputPatchStatus } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import type { SegmentNode } from '../../lib/patchSheet'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { MobileOutputEditSheet } from '../mobile/MobileOutputEditSheet'
import {
  cableAtPort,
  consoleLocalPorts,
  derivedCableColor,
  derivedOutputPortColor,
  devicePorts,
  isCablelessToKind,
  isPortConnected,
  mixerPorts,
  nodeZone,
  resolvePortRef,
  stageboxPorts,
  stageMultiPorts,
  type OutputColorContext,
  type PortRef,
  type Zone,
} from '../../lib/outputGraph'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, Console, InventoryItem, OutputCable, OutputDevice, OwnedItem, StageMulti, Stagebox } from '../../types'
import { AudioPatchShell } from './AudioPatchShell'
import { OutputFlowInspector, type OutputFlowSelection } from './OutputFlowInspector'
import { LaneBands } from './graph/LaneBands'
import { NodeShell as SharedNodeShell } from './graph/NodeShell'
import { PortRow as SharedPortRow, SplitPortRow, type PortWiring } from './graph/PortRow'
import { ZoomControl } from './graph/ZoomControl'
import { ConsoleSection } from './ConsoleSection'
import { OutputSheet } from './OutputSheet'
import { PatchStatusRail } from './PatchStatusRail'
import { ProcessingDeviceSection } from './ProcessingDeviceSection'
import { RigDrawer } from './RigDrawer'
import { TrueOutputDeviceSection } from './TrueOutputDeviceSection'
import { OutputPatchSheet } from '../print/OutputPatchSheet'
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
  const [zoom, setZoom] = useState(1)
  // The phone's strip filter — the desktop's lives in `OutputSheet` (data-model.md §3).
  const [gapsOnly, setGapsOnly] = useState(false)
  // What the graph has selected, and so what its inspector is open on. Held here
  // rather than in the canvas so it survives the view toggle and so the sheet can
  // set it (Slice 25 FR-001/FR-002). Since Slice 26 a selection can be a single
  // output *row* and not only a box, which is what makes an output editable in the
  // Flow view; the desk box itself is no longer selectable, because its own fields
  // live in the Rig drawer and its rows each have a rail now (research.md R3).
  const [selection, setSelection] = useState<OutputFlowSelection | null>(null)

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
  const consoles = audioQuery.data?.consoles ?? []

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems],
  )

  /**
   * The graph node a sheet *hop* points at (Slice 25 FR-003). A chain's head is the
   * desk output, which is now selectable in its own right — but as an `output`, not as
   * a box, so a head hop still selects nothing here and `openOutputInFlow` below is
   * what the row's own button uses. A `device_link` hop lives on the same box as the
   * device's ordinary ports, so it selects the device.
   */
  const openInFlow = (node: SegmentNode) => {
    const kind = node.kind === 'device_link' ? 'device' : node.kind
    if (kind !== 'stagebox' && kind !== 'stage_multi' && kind !== 'device' && kind !== 'console_local') return
    setSelection({ kind, id: node.id })
    setView('flow')
  }

  /**
   * The sheet row's own "Edit in Flow" (Slice 26). It selects the **output**, because
   * that is the row, and since this slice the row is a thing the flow view can edit.
   * Before, the button had to settle for the first box downstream of the desk — which
   * opened a stagebox when what you asked to edit was a bus.
   */
  const openOutputInFlow = (output: AudioPatchOutput) => {
    setSelection({ kind: 'output', id: output.id })
    setView('flow')
  }

  const addOutputRow = () => {
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    addOutputMutation.mutate({ event_id: eventId, output_number: lastNumber + 1, output_name: '', output_type: 'foh', width: 'mono', notes: '' })
  }

  if (isMobile) {
    const listed = buildMobileOutputList(outputs, { stageboxes, stageMultis, devices: outputDevices, cables: outputCables, itemLabelById })
    const gapNumbers = new Set(listed.filter((item) => item.hasGap).map((item) => item.outputNumber))
    const items = listed
      .filter((item) => !gapsOnly || item.hasGap)
      .map((item) => ({
        id: item.id,
        number: item.outputNumber,
        name: item.name,
        subtitle: item.routingLabel,
        color: item.color,
      }))
    const status = outputPatchStatus({
      outputs,
      gaps: outputs.filter((output) => gapNumbers.has(output.output_number)),
      consoles,
      stageboxes,
      stageMultis,
      cables: outputCables,
    })
    const editingOutput = typeof editingOutputId === 'number' ? outputs.find((o) => o.id === editingOutputId) : undefined
    return (
      <>
      {/* A column, because it is a flex item of the shell's column and the panel
          inside it fills what this gives it (Wave 6c). */}
      <div className="flex min-h-0 flex-1 flex-col print:hidden">
        <MobileEntityList
          title="Audio Outputs"
          /* The rig, in the hand (audit.md M5) — `ui/Drawer` has had a phone form since
             6a and this branch simply returned before reaching it. Print is M11. */
          overflow={[
            ...(readOnly
              ? []
              : [
                  {
                    label: 'Open Rig',
                    hint: String(consoles.length + stageboxes.length + stageMultis.length + outputDevices.length),
                    icon: <Boxes className="h-4 w-4" />,
                    onClick: () => setRigOpen(true),
                  },
                ]),
            { label: 'Print patch sheet', icon: <Printer className="h-4 w-4" />, onClick: () => window.print() },
          ]}
          strip={
            <PatchStatusRail
              status={status}
              noun="output"
              gapsOnly={gapsOnly}
              onShowGaps={status.gaps.length > 0 || gapsOnly ? () => setGapsOnly((only) => !only) : undefined}
            />
          }
          items={items}
          filtered={gapsOnly}
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
            readOnly={readOnly}
            output={editingOutput}
            outputs={outputs}
            stageboxes={stageboxes}
            cables={outputCables}
            onClose={() => setEditingOutputId(null)}
            onSaved={invalidate}
          />
        )}

        {/* The same tree the desk renders, at phone geometry. No drawer file edited. */}
        <RigDrawer
          audioItems={allAudioItems}
          cables={[...outputCables, ...(audioQuery.data?.input_cables ?? [])]}
          consoleSection={
            <ConsoleSection
              audioItems={allAudioItems}
              channels={audioQuery.data?.input_channels ?? []}
              consoles={consoles}
              eventId={eventId}
              outputs={outputs}
              ownedItems={ownedItems}
              readOnly={readOnly}
            />
          }
          deviceSections={
            <>
              <ProcessingDeviceSection audioItems={allAudioItems} devices={outputDevices} eventId={eventId} ownedItems={ownedItems} readOnly={readOnly} />
              <TrueOutputDeviceSection audioItems={allAudioItems} devices={outputDevices} eventId={eventId} ownedItems={ownedItems} readOnly={readOnly} />
            </>
          }
          eventId={eventId}
          itemCount={consoles.length + stageboxes.length + stageMultis.length + outputDevices.length}
          onClose={() => setRigOpen(false)}
          open={rigOpen}
          readOnly={readOnly}
          stageMultis={stageMultis}
          stageboxes={stageboxes}
        />
      </div>

      {/* A sibling of the wrapper, not inside it — the desktop return's shape (M11). */}
      <OutputPatchSheet
        eventId={eventId}
        outputs={outputs}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={outputDevices}
        outputCables={outputCables}
        consoles={consoles}
        itemLabelById={itemLabelById}
      />
      </>
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
        toolbarExtras={view === 'flow' ? <ZoomControl zoom={zoom} onZoomChange={setZoom} /> : undefined}
        drawers={
          <RigDrawer
            open={rigOpen}
            onClose={() => setRigOpen(false)}
            eventId={eventId}
            stageboxes={stageboxes}
            stageMultis={stageMultis}
            audioItems={allAudioItems}
            cables={[...outputCables, ...(audioQuery.data?.input_cables ?? [])]}
            itemCount={consoles.length + stageboxes.length + stageMultis.length + outputDevices.length}
            readOnly={readOnly}
            consoleSection={
              <ConsoleSection
                eventId={eventId}
                consoles={consoles}
                channels={audioQuery.data?.input_channels ?? []}
                outputs={outputs}
                audioItems={allAudioItems}
                ownedItems={ownedItems}
                readOnly={readOnly}
              />
            }
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
            consoles={consoles}
            cableItems={cableItems}
            itemLabelById={itemLabelById}
            search={search}
            onEditInFlow={openInFlow}
            onEditOutputInFlow={openOutputInFlow}
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
            consoles={consoles}
            cableItems={cableItems}
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
      <OutputPatchSheet
        eventId={eventId}
        outputs={outputs}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={outputDevices}
        outputCables={outputCables}
        consoles={consoles}
        itemLabelById={itemLabelById}
      />
    </>
  )
}


const NODE_WIDTH = 200
const CANVAS_HEIGHT = 640
const CANVAS_MIN_WIDTH = 820
const ZONE_SOURCES_X = 24

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
 *
 * Since Slice 26 an inspector rail sits beside it — the same rail the inputs canvas
 * has — open on whichever output row or rig box is selected.
 */
function OutputGraphCanvas({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  devices,
  cables,
  consoles,
  cableItems,
  itemLabelById,
  search = '',
  selection,
  onSelectionChange,
  zoom,
  onChanged,
  readOnly = false,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  consoles: Console[]
  cableItems: InventoryItem[]
  /** The rail's chain model needs it, to name the cable behind a hop. */
  itemLabelById: Map<number, string>
  /**
   * The shell's search term. Non-matching nodes and rows dim; nothing is
   * removed, since hiding a node would hide cables that exist
   * (research.md R14).
   */
  search?: string
  /** What the graph marks, and so what the rail shows. Owned by the tab (Slice 25 FR-002). */
  selection: OutputFlowSelection | null
  onSelectionChange: (selection: OutputFlowSelection | null) => void
  /** Owned by the tab, because its control lives in the panel's toolbar (FR-020). */
  zoom: number
  onChanged: () => Promise<void>
  readOnly?: boolean
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const portEls = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ id: number; d: string; hasItem: boolean; network: boolean; color: string | undefined }[]>([])
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

  const portContext = { outputs, stageboxes, stageMultis, devices, consoles }

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
  // The desk's bus list is pinned to the Sources lane, so only its y is stored.
  const moveConsoleMutation = useMutation({
    mutationFn: ({ id, y }: { id: number; y: number }) => updateConsole(eventId, id, { position_y: y }),
    onSuccess: onChanged,
  })
  // Its jack panel is free in both axes and stores its own pair — dragging it
  // here must not move the panel on the Inputs canvas (Slice 24 FR-013).
  const moveConsoleJacksMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      updateConsole(eventId, id, { local_position_x: x, local_position_y: y }),
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

  // Outputs with no desk of their own (an event whose only console was
  // deleted) keep a node of their own rather than being hidden or silently
  // reassigned — the same reasoning as the sheet's "no source" cell.
  const orphanOutputs = useMemo(() => outputs.filter((row) => row.console_id == null), [outputs])

  // Which output's run passes through a port — the same context derivedCableColor
  // uses for the cables, so a port and the cable attached to it cannot disagree.
  const colorContext: OutputColorContext = { outputs, cables, devices }

  const layout = useMemo<NodeLayout[]>(() => {
    const nodes: NodeLayout[] = []
    let nextY = 24
    for (const desk of consoles) {
      // The desk's bus list, keyed by the kind of port it carries. Console ids
      // start at 1, so this never collides with the `mixer:0` node below.
      const pos = positions.get(`mixer:${desk.id}`)
      const y = pos?.y ?? desk.position_y
      nodes.push({ kind: 'mixer', id: desk.id, x: ZONE_SOURCES_X, y, zone: 'sources' })
      // Below the desk actually placed — see InputGraphCanvas (Slice 24 FR-007).
      nextY = Math.max(nextY + 220, y + 220)

      // Its jack panel, in the processing lane — the mirror of the input
      // canvas's. Before Slice 24 these were out-side-only ports on the desk
      // node, so a bus had no in-side port to land on and the desk's sockets
      // could not be used at all (FR-011, research.md R6). No jacks, no node.
      if (desk.local_output_count > 0) {
        const jackPos = positions.get(`console_local:${desk.id}`)
        nodes.push({
          kind: 'console_local',
          id: desk.id,
          x: clampProcessingX(jackPos?.x ?? desk.local_position_x),
          y: jackPos?.y ?? desk.local_position_y,
          zone: 'processing',
        })
      }
    }
    if (orphanOutputs.length > 0 || consoles.length === 0) {
      const mixerPos = positions.get('mixer:0')
      nodes.push({ kind: 'mixer', id: 0, x: ZONE_SOURCES_X, y: mixerPos?.y ?? nextY, zone: 'sources' })
    }

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
  }, [consoles, orphanOutputs, sourceDevices, destinationDevices, stageboxes, stageMultis, processingDevices, positions, canvasWidth])

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
        return {
          id: cable.id,
          d,
          hasItem: cable.cable_item_id != null,
          network: isCablelessToKind(cable.to_kind),
          color: derivedCableColor(cable, { outputs, cables, devices }),
        }
      })
      .filter((p): p is { id: number; d: string; hasItem: boolean; network: boolean; color: string | undefined } => p !== null)
    setPaths(next)
  }, [cables, layout, zoom, outputs, devices])

  function persistPosition(kind: PortRef['kind'], id: number, x: number, y: number) {
    const onError = (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save position')
    if (kind === 'console_local') {
      moveConsoleJacksMutation.mutate({ id, x, y }, { onError })
      return
    }
    if (kind === 'mixer') {
      if (id === 0) {
        // The node holding outputs with no desk. It moves for the session — the
        // canvas's `positions` map holds it — but there is no row to store it on
        // (Slice 24 FR-006, research.md R4).
        return
      }
      moveConsoleMutation.mutate({ id, y }, { onError })
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
    if (isCablelessToKind(to.kind)) {
      createCableMutation.mutate(
        { from_kind: from.kind, from_id: from.id, from_port: from.port, to_kind: to.kind as OutputCable['to_kind'], to_id: to.id, to_port: to.port },
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
    <div>
      {error && <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">{error}</div>}
      {pendingPort && !dragGhost && (
        <div className="border-b border-amber-500/30 bg-amber-500/[0.05] px-3 py-1.5 text-[11px] text-amber-300">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className="flex items-start gap-3">
      <div ref={wrapperRef} className="min-w-0 flex-1 overflow-auto" style={{ height: CANVAS_HEIGHT }}>
        <div style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div ref={canvasRef} className="relative" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            <LaneBands
              height={canvasHeight}
              lanes={[
                { label: 'Console', x: 0, width: ZONE_SOURCES_X + NODE_WIDTH + 24 },
                { label: 'Rig', x: ZONE_SOURCES_X + NODE_WIDTH + 40, width: Math.max(0, zoneDestinationsX(canvasWidth) - (ZONE_SOURCES_X + NODE_WIDTH + 56)) },
                { label: 'Stage', x: canvasWidth - (NODE_WIDTH + 48), width: NODE_WIDTH + 48 },
              ]}
            />
            <svg className="pointer-events-none absolute inset-0" width={canvasWidth} height={canvasHeight}>
              {/* Same two encodings as the input graph (Slice 23): hue is the
                  output this run carries, dash pattern is what kind of link it
                  is. Keeping them independent is what lets a network hop wear
                  its output's colour. */}
              {paths.map((p) => (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.color ?? (p.hasItem || p.network ? '#f59e0b' : '#71717a')}
                  strokeWidth={2 / zoom}
                  strokeDasharray={p.network ? `${7 / zoom} ${3 / zoom}` : p.hasItem ? undefined : `${4 / zoom} ${3 / zoom}`}
                />
              ))}
              {ghostPath && <path d={ghostPath} fill="none" stroke="#f59e0b" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} opacity={0.85} />}
            </svg>
            {layout.map((node) => {
              if (node.kind === 'console_local') {
                const desk = consoles.find((c) => c.id === node.id)
                if (!desk) return null
                return (
                  <LocalJackNode
                    key={`jacks-${desk.id}`}
                    x={node.x}
                    y={node.y}
                    desk={desk}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('console_local', desk.id, 'free', e)}
                    selected={selection?.kind === 'console_local' && selection.id === desk.id}
                    onSelect={() => onSelectionChange({ kind: 'console_local', id: desk.id })}
                    dimmed={!matchesSearch(search, desk.name, 'local')}
                  />
                )
              }
              if (node.kind === 'mixer') {
                // id 0 is the node for outputs belonging to no desk; anything
                // else is a desk's own bus list (see the layout above).
                const desk = node.id === 0 ? undefined : consoles.find((c) => c.id === node.id)
                if (node.id !== 0 && !desk) return null
                return desk ? (
                  <ConsoleNode
                    key={`desk-${desk.id}`}
                    x={node.x}
                    y={node.y}
                    desk={desk}
                    outputs={outputs.filter((row) => row.console_id === desk.id)}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('mixer', desk.id, 'y-only', e)}
                    selectedOutputId={selection?.kind === 'output' ? selection.id : undefined}
                    onSelectOutput={(id) => onSelectionChange({ kind: 'output', id })}
                    search={search}
                  />
                ) : (
                  <MixerNode
                    key="mixer"
                    x={node.x}
                    y={node.y}
                    outputs={orphanOutputs}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('mixer', 0, 'y-only', e)}
                    selectedOutputId={selection?.kind === 'output' ? selection.id : undefined}
                    onSelectOutput={(id) => onSelectionChange({ kind: 'output', id })}
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
                    colorContext={colorContext}
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('stagebox', sb.id, 'free', e)}
                    selected={selection?.kind === 'stagebox' && selection.id === sb.id}
                    onSelect={() => onSelectionChange({ kind: 'stagebox', id: sb.id })}
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
                    colorContext={colorContext}
                    onDragStart={readOnly ? undefined : (e) => startNodeDrag('stage_multi', sm.id, 'free', e)}
                    selected={selection?.kind === 'stage_multi' && selection.id === sm.id}
                    onSelect={() => onSelectionChange({ kind: 'stage_multi', id: sm.id })}
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
                  colorContext={colorContext}
                  onDragStart={readOnly ? undefined : (e) => startNodeDrag('device', device.id, node.zone === 'processing' ? 'free' : 'y-only', e)}
                  selected={selection?.kind === 'device' && selection.id === device.id}
                  onSelect={() => onSelectionChange({ kind: 'device', id: device.id })}
                  onDelete={readOnly ? undefined : () => deleteDeviceMutation.mutate(device.id)}
                  dimmed={!matchesSearch(search, device.name)}
                />
              )
            })}
          </div>
        </div>
      </div>
      {selection && (
        <OutputFlowInspector
          eventId={eventId}
          selection={selection}
          outputs={outputs}
          stageboxes={stageboxes}
          stageMultis={stageMultis}
          devices={devices}
          cables={cables}
          consoles={consoles}
          itemLabelById={itemLabelById}
          onSelectionChange={onSelectionChange}
          onChanged={onChanged}
          readOnly={readOnly}
        />
      )}
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

/**
 * Adapters over the shared graph primitives (Slice 25 FR-036) — the mirror of the
 * input canvas's. Both canvases used to hold their own copies of the box, the port
 * and the row, which is why their boxes drifted apart; the drawing lives in `graph/`
 * now and these only bind it to this graph's own `PortRef` union, keys and colour
 * rule.
 */
function NodeShell({ x, y, title, badge, dimmed, selected, footer, footerAlarm, onDragStart, onDelete, onSelect, children }: {
  x: number
  y: number
  title: string
  badge?: string
  dimmed?: boolean
  selected?: boolean
  footer?: ReactNode
  footerAlarm?: boolean
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  onSelect?: () => void
  children: ReactNode
}) {
  return (
    <SharedNodeShell
      x={x}
      y={y}
      width={NODE_WIDTH}
      title={title}
      badge={badge}
      footer={footer}
      footerAlarm={footerAlarm}
      dimmed={dimmed}
      selected={selected}
      desk={badge === 'DESK'}
      onDragStart={onDragStart}
      onDelete={onDelete}
      onSelect={onSelect}
    >
      {children}
    </SharedNodeShell>
  )
}

function PortRow({ label, port, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, align, colorContext, dimmed, selected, onSelect }: {
  label: string
  port: PortRef
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  align: 'left' | 'right'
  colorContext: OutputColorContext
  dimmed?: boolean
  /** Set on a bus-list row: the label opens the rail, the dot still cables (FR-009). */
  selected?: boolean
  onSelect?: () => void
}) {
  return (
    <SharedPortRow
      port={port}
      label={label}
      align={align}
      dimmed={dimmed}
      selected={selected}
      onSelect={onSelect}
      wiring={wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)}
    />
  )
}

/** Binds this graph's cables, gesture state and colour rule to the shared rows. */
function wiringFor(
  cables: OutputCable[],
  pendingPort: PortRef | null,
  colorContext: OutputColorContext,
  onPortClick: (port: PortRef) => void,
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void,
  registerPort: (key: string) => (el: HTMLElement | null) => void,
): PortWiring {
  return {
    isConnected: (port) => isPortConnected(port.kind as PortRef['kind'], port.id, port.port, port.direction, cables),
    isPending: (port) =>
      !!pendingPort && pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction,
    colorOf: (port) => derivedOutputPortColor(port.kind as PortRef['kind'], port.id, port.port, colorContext),
    keyOf: (port) => portKey(port.kind as PortRef['kind'], port.id, port.port, port.direction),
    onPortClick: (port) => onPortClick(port as PortRef),
    onPortPointerDown: (port, event) => onPortPointerDown(port as PortRef, event),
    registerPort,
  }
}

function ConsoleNode({ x, y, desk, outputs, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, search = '' , selectedOutputId, onSelectOutput, colorContext }: {
  x: number
  y: number
  desk: Console
  outputs: AudioPatchOutput[]
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart?: (e: ReactPointerEvent) => void
  search?: string
  colorContext: OutputColorContext
  /** The output the rail is open on. A stereo row's two ports share it. */
  selectedOutputId?: number
  onSelectOutput?: (outputId: number) => void
}) {
  const ports = mixerPorts(outputs)
  const dimmedIds = new Set(
    outputs.filter((row) => !matchesSearch(search, row.output_number, row.output_name, row.output_type, row.notes)).map((row) => row.id),
  )
  const over = desk.output_count > 0 && outputs.length > desk.output_count

  return (
    <NodeShell
      x={x}
      y={y}
      title={desk.name || 'Console'}
      badge="DESK"
      onDragStart={onDragStart}
      footerAlarm={over}
      footer={
        <>
          {outputs.length}
          {desk.output_count > 0 ? ` / ${desk.output_count}` : ''} out
          {desk.local_output_count > 0 ? ` · local ${desk.local_output_count}` : ''}
        </>
      }
    >
      {/* A mixer port's id *is* the output's id, so a stereo output's two rows both
          answer to the same selection — clicking either label keeps the rail on the
          one output (Slice 26 FR-002). */}
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} colorContext={colorContext} align="right" dimmed={dimmedIds.has(port.id)} selected={selectedOutputId === port.id} onSelect={onSelectOutput && (() => onSelectOutput(port.id))} />
      ))}
      {ports.length === 0 && <p className="px-1.5 text-[11px] text-zinc-600">No outputs on this desk yet</p>}
    </NodeShell>
  )
}

/**
 * A desk's own output jacks, as their own node (Slice 24 FR-008/FR-009) — the
 * mirror of the input canvas's `LocalJackNode`, and deliberately the same
 * two-column shape as `StageboxNode` below.
 *
 * This is the node that makes the desk's sockets usable at all on this graph.
 * Before it, the jacks were drawn as out-side-only rows on the desk node, so a
 * bus had no in-side port to be routed to and the sockets were unreachable
 * (research.md R6). A bus now routes into the left column — the desk's own
 * routing, no cable — and a real cable leaves the right one, exactly as through
 * a stagebox.
 */
function LocalJackNode({ x, y, desk, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, dimmed , selected, onSelect, colorContext }: {
  x: number
  y: number
  desk: Console
  cables: OutputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart?: (e: ReactPointerEvent) => void
  dimmed?: boolean
  colorContext: OutputColorContext
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = consoleLocalPorts(desk)
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={desk.name || 'Console'} badge="LOCAL" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow key={inPort.port} inPort={inPort} outPort={outputs[index]} label={String(inPort.port + 1)} wiring={wiring} />
      ))}
    </NodeShell>
  )
}

function MixerNode({ x, y, outputs, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, search = '' , selectedOutputId, onSelectOutput, colorContext }: {
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
  colorContext: OutputColorContext
  selectedOutputId?: number
  onSelectOutput?: (outputId: number) => void
}) {
  const ports = mixerPorts(outputs)
  // One node, many rows, so search dims per row rather than per node.
  const dimmedIds = new Set(
    outputs.filter((row) => !matchesSearch(search, row.output_number, row.output_name, row.output_type, row.notes)).map((row) => row.id),
  )
  return (
    <NodeShell x={x} y={y} title="No desk" badge={ports.length > 0 ? String(outputs.length) : undefined} onDragStart={onDragStart}>
      {/* A mixer port's id *is* the output's id, so a stereo output's two rows both
          answer to the same selection — clicking either label keeps the rail on the
          one output (Slice 26 FR-002). */}
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} colorContext={colorContext} align="right" dimmed={dimmedIds.has(port.id)} selected={selectedOutputId === port.id} onSelect={onSelectOutput && (() => onSelectOutput(port.id))} />
      ))}
      {ports.length === 0 && <p className="px-1.5 text-[11px] text-zinc-600">No outputs without a desk</p>}
    </NodeShell>
  )
}

function StageboxNode({ x, y, stagebox, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, dimmed , selected, onSelect, colorContext }: {
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
  colorContext: OutputColorContext
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = stageboxPorts(stagebox)
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={stagebox.name} badge="SB" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow key={inPort.port} inPort={inPort} outPort={outputs[index]} label={String(inPort.port + 1)} wiring={wiring} />
      ))}
    </NodeShell>
  )
}

function StageMultiNode({ x, y, stageMulti, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, dimmed , selected, onSelect, colorContext }: {
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
  colorContext: OutputColorContext
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = stageMultiPorts(stageMulti)
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={stageMulti.name} badge="Multi" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow key={inPort.port} inPort={inPort} outPort={outputs[index]} label={String(inPort.port + 1)} wiring={wiring} />
      ))}
    </NodeShell>
  )
}

function DeviceNode({ x, y, device, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, onDelete, dimmed , selected, onSelect, colorContext }: {
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
  colorContext: OutputColorContext
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs, links } = devicePorts(device)
  return (
    <NodeShell x={x} y={y} title={device.name} onDragStart={onDragStart} onDelete={onDelete} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} colorContext={colorContext} align="left" />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} colorContext={colorContext} align="right" />
          ))}
          {links.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} colorContext={colorContext} align="right" />
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
