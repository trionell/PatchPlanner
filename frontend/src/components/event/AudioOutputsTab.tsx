import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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
import { useDeskModels } from '../../hooks/useDeskModels'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useSelectedDesk } from '../../hooks/useSelectedDesk'
import { deskLabel } from '../../lib/deskStrips'
import { usePlaneView } from '../../hooks/usePlaneView'
import { usePinchZoom } from '../../hooks/usePinchZoom'
import { fitScale } from '../../lib/canvasFit'
import { firstMatch, focusOffset } from '../../lib/canvasFocus'
import { originShift, planeExtent, planeOrigin } from '../../lib/canvasPlane'
import { usePatchView } from '../../hooks/usePatchView'
import { buildMobileOutputList } from '../../lib/mobileOutputList'
import { outputPatchStatus, type SelectedDesk } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import type { SegmentNode } from '../../lib/patchSheet'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { MobileSegmented } from '../mobile/MobileSegmented'
import { MobileOutputEditSheet } from '../mobile/MobileOutputEditSheet'
import {
  cableAtPort,
  consoleLocalPorts,
  localJackCount,
  derivedCableColor,
  derivedOutputPortColor,
  devicePorts,
  isCablelessToKind,
  isPortConnected,
  isStageMultiVisibleInOutputGraph,
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
import { NodeShell as SharedNodeShell } from './graph/NodeShell'
import { PortRow as SharedPortRow, SplitPortRow, type PortWiring } from './graph/PortRow'
import { ZoomControl, ZOOM_MAX, ZOOM_STEP } from './graph/ZoomControl'
import { stepZoomAdditive } from '../../lib/canvasFit'
import { ConsoleSection } from './ConsoleSection'
import { DeskSelector } from './DeskSelector'
import { DesklessNote } from './DesklessNote'
import { MobilePicker } from '../mobile/MobilePicker'
import { OutputSheet } from './OutputSheet'
import { RefusalNotice, type SheetRefusal } from './RefusalNotice'
import { PatchStatusRail } from './PatchStatusRail'
import { ProcessingDeviceSection } from './ProcessingDeviceSection'
import { RigDrawer } from './RigDrawer'
import { useInfoNote } from '../../hooks/useInfoNote'
import { InfoPanel, InfoToggle } from '../ui/InfoNote'
import { TrueOutputDeviceSection } from './TrueOutputDeviceSection'
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
  /*
    The canvas zoom (Slice 25 FR-020). `null` means *fit* — the scale at which the whole
    graph fits its window, which only the canvas can measure (Slice 36 R3). A desk's
    `fit` is 1, so `null` reads as 100 % there and nothing about the desktop changes.
  */
  const [zoom, setZoom] = useState<number | null>(null)
  const [fit, setFit] = useState(1)
  /*
    The floor of the zoom range, and the scale a surface opens at before anybody chooses
    one — **at both widths since Slice 37**.

    It used to be `isMobile ? fit : 1`, because a desk's canvas was sized to its own panel
    and therefore always fitted. The plane is not: it is as wide as the graph placed on it,
    which can exceed a desk's window too. Opening a desk at *fit* is also what keeps the
    Destinations rail visible now that it no longer hugs the window's right edge — the one
    thing this slice was going to cost the desk, paid back by the same change.

    Still derived rather than reset, for the reason it always was: a re-measurement must
    clamp a chosen zoom into the new range, not throw it away.
  */
  const fitFloor = fit
  const zoomLevel = zoom ?? fitFloor
  /* A re-measurement clamps a chosen zoom into the new range rather than resetting it —
     turning the phone is what someone does to see more of the graph. */
  const adoptFit = useCallback((next: number) => {
    setFit(next)
    /*
      Raises the floor; imposes no ceiling. The `Math.min(1, …)` that used to be here was
      right while only a phone reported a fit — the phone's range ends at 1. Since Slice 37
      the desk reports one too, and `fit` moves on every content change, so the ceiling
      snapped a desk's 130 % back to 100 % the moment any node was dragged.
    */
    setZoom((current) => (current == null ? null : Math.max(next, current)))
  }, [])

  const stepZoom = (factor: number) => setZoom((current) => Math.min(1, Math.max(fitFloor, (current ?? fitFloor) * factor)))
  /*
    The desk's stepper. `ZoomControl`'s own additive stepping is bounded by `ZOOM_MIN`,
    which is 0.5 — and a plane's fit can be below that, in which case pressing **−** from
    the opening state would zoom *in*. So the floor is the fit, and the ceiling stays the
    desk's own `ZOOM_MAX`.
  */
  const stepDeskZoom = (delta: number) => setZoom((current) => stepZoomAdditive(current, delta, fitFloor, ZOOM_MAX))
  // Open the first time, and then only for as long as it has not been read.
  const patchingIsADeskJob = useInfoNote({ id: 'flow-desk-job', defaultOpen: true })
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
  /* One desk per list, shared with Inputs (Slice 47, B6). No model caps outputs, so the
     selector names the desk and how many outputs come off it. */
  const { models, modelOf } = useDeskModels()
  const desklessOutputs = outputs.filter((output) => output.console_id == null)
  const [deskSelection, selectDesk] = useSelectedDesk(eventId, consoles, desklessOutputs.length > 0)
  const selectedConsole = typeof deskSelection === 'number' ? consoles.find((desk) => desk.id === deskSelection) : undefined
  const selectedDesk: SelectedDesk | undefined = selectedConsole ? { console: selectedConsole, model: modelOf(selectedConsole) } : undefined
  const listedOutputs = selectedConsole ? outputs.filter((output) => output.console_id === selectedConsole.id) : desklessOutputs
  const deskEntries = consoles.map((desk) => ({ desk, label: `${deskLabel(desk, modelOf(desk))} ${outputs.filter((output) => output.console_id === desk.id).length} out` }))
  const [addRefusal, setAddRefusal] = useState<SheetRefusal | undefined>()
  const [actionCount, setActionCount] = useState(0)
  const [movedLine, setMovedLine] = useState<{ text: string; deskId: number; deskName: string } | null>(null)
  const setDeskSelection = (next: typeof deskSelection) => {
    setAddRefusal(undefined)
    setMovedLine(null)
    selectDesk(next)
  }

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
    setAddRefusal(undefined)
    setActionCount((n) => n + 1)
    if (!selectedConsole) {
      setAddRefusal({ message: 'An output comes off a desk, and this event has none yet. Add the desk in Rig first.', fix: readOnly ? undefined : { label: 'Open Rig', apply: () => setRigOpen(true) } })
      return
    }
    const lastNumber = listedOutputs.reduce((max, output) => Math.max(max, output.output_number), 0)
    addOutputMutation.mutate(
      { event_id: eventId, output_number: lastNumber + 1, output_name: '', output_type: 'foh', width: 'mono', notes: '', console_id: selectedConsole.id },
      { onError: (error) => setAddRefusal({ message: error.message }) },
    )
  }

  if (isMobile) {
    const listed = buildMobileOutputList(listedOutputs, { stageboxes, stageMultis, devices: outputDevices, cables: outputCables, itemLabelById })
    const deskOptions = [
      ...deskEntries.map((entry) => ({ id: entry.desk.id, label: deskLabel(entry.desk, modelOf(entry.desk)), hint: String(outputs.filter((output) => output.console_id === entry.desk.id).length) })),
      ...(desklessOutputs.length > 0 ? [{ id: 'none' as const, label: 'No desk', hint: String(desklessOutputs.length) }] : []),
    ]
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
      outputs: listedOutputs,
      desk: selectedDesk,
      deskless: desklessOutputs.length,
      gaps: listedOutputs.filter((output) => gapNumbers.has(output.output_number)),
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
          title={
            deskOptions.length > 1 ? (
              <MobilePicker label="Desk" title="Desk" variant="title" options={deskOptions} value={deskSelection} onChange={(id) => setDeskSelection(id === 'none' ? 'none' : Number(id))} />
            ) : (
              'Audio Outputs'
            )
          }
          notice={
            (addRefusal || movedLine || !selectedDesk) && view === 'sheet' ? (
              <>
                {addRefusal && <RefusalNotice refusal={addRefusal} />}
                {movedLine && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                    {movedLine.text}
                    <Button variant="outline" className="h-11 px-3 text-sm" onClick={() => setDeskSelection(movedLine.deskId)}>
                      Show {movedLine.deskName}
                    </Button>
                  </p>
                )}
                {!selectedDesk && (
                  <DesklessNote eventId={eventId} kind="outputs" ids={desklessOutputs.map((output) => output.id)} consoles={consoles} readOnly={readOnly} onOpenRig={() => setRigOpen(true)} onPlaced={invalidate} hand />
                )}
              </>
            ) : undefined
          }
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
          /* Two views, one frame — identical to Audio Inputs by decision, not by
             coincidence: a phone branch built at one call site and copied to the second
             is how the two canvases drifted the first time (Slice 36 R10). */
          actions={
            <>
              <MobileSegmented
                label="View"
                onChange={setView}
                options={[
                  { value: 'sheet', label: 'Sheet' },
                  { value: 'flow', label: 'Flow' },
                ]}
                value={view}
              />
              {view === 'flow' && (
                <ZoomControl
                  onReset={() => setZoom(null)}
                  onZoomIn={() => stepZoom(1.4)}
                  onZoomOut={() => stepZoom(1 / 1.4)}
                  resetLabel="fit"
                  zoom={zoomLevel}
                />
              )}
            </>
          }
          strip={
            <PatchStatusRail
              status={status}
              noun="output"
              gapsOnly={gapsOnly}
              /* Not a control in Flow: the canvas does not filter (patterns.md §7b). */
              onShowGaps={
                view === 'sheet' && (status.gaps.length > 0 || gapsOnly) ? () => setGapsOnly((only) => !only) : undefined
              }
            />
          }
          items={items}
          filtered={gapsOnly}
          onSelect={(id) => {
            setMovedLine(null)
            setEditingOutputId(id)
          }}
          /* No primary action in Flow (FR-022) — see Audio Inputs for the argument. */
          onAdd={
            view !== 'sheet' || (deskSelection === 'none' && consoles.length > 0)
              ? undefined
              : () => {
                  if (!selectedConsole) {
                    setAddRefusal({ message: 'An output comes off a desk, and this event has none yet. Add the desk in Rig first.', fix: readOnly ? undefined : { label: 'Open Rig', apply: () => setRigOpen(true) } })
                    return
                  }
                  setEditingOutputId('new')
                }
          }
          readOnly={readOnly}
          search={search}
          onSearch={setSearch}
          searchPlaceholder={view === 'flow' ? 'Find a box or an output…' : 'Find an output…'}
          addLabel="Add output"
          emptyLabel="No output channels yet."
          titleAdornment={view === 'flow' ? <InfoToggle note={patchingIsADeskJob} /> : undefined}
        >
          {view === 'flow' ? (
            <div className="flex h-full min-h-0 flex-col">
              {/* The one desk job, named where the editor would be (patterns.md §7g).
                  The same sentence Audio Inputs shows, and the same note id: it is one
                  fact about one canvas, so reading it on one tab reads it on both. */}
              <InfoPanel className="flex-none border-b border-zinc-800/60 bg-zinc-950/35 px-3 py-2.5" note={patchingIsADeskJob}>
                <span className="font-medium text-zinc-300">Patching is a desk job</span> — open this event on a
                computer. Tap any box to read or edit what it is.
              </InfoPanel>
              <OutputGraphCanvas
                ready={audioQuery.isSuccess}
                cableItems={cableItems}
                cables={outputCables}
                consoles={consoles}
                devices={outputDevices}
                eventId={eventId}
                itemLabelById={itemLabelById}
                onChanged={invalidate}
                onFitChange={adoptFit}
                onSelectionChange={setSelection}
                onZoomChange={setZoom}
                outputs={outputs}
                readOnly={readOnly}
                search={search}
                selection={selection}
                stageMultis={stageMultis}
                stageboxes={stageboxes}
                zoom={zoom}
              />
            </div>
          ) : undefined}
        </MobileEntityList>
        {editingOutputId != null && (
          <MobileOutputEditSheet
            eventId={eventId}
            consoles={consoles}
            models={models}
            deskId={selectedConsole?.id}
            onMoved={setMovedLine}
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

      </>
    )
  }

  return (
    <>
      <AudioPatchShell
        eventId={eventId}
        tab="outputs"
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        onOpenRig={readOnly ? undefined : () => setRigOpen(true)}
        onAdd={readOnly || (deskSelection === 'none' && consoles.length > 0) ? undefined : addOutputRow}
        deskSelector={<DeskSelector entries={deskEntries} deskless={desklessOutputs.length} selection={deskSelection} onSelect={setDeskSelection} />}
        toolbarExtras={
          view === 'flow' ? (
            <ZoomControl
              zoom={zoomLevel}
              onZoomChange={setZoom}
              onZoomIn={() => stepDeskZoom(ZOOM_STEP)}
              onZoomOut={() => stepDeskZoom(-ZOOM_STEP)}
              onReset={() => setZoom(null)}
            />
          ) : undefined
        }
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
            key={String(deskSelection)}
            actionCount={actionCount}
            eventId={eventId}
            outputs={listedOutputs}
            desk={selectedDesk}
            models={models}
            desklessCount={desklessOutputs.length}
            onSelectDeskless={() => setDeskSelection('none')}
            onShowDesk={setDeskSelection}
            addRefusal={addRefusal}
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
                ready={audioQuery.isSuccess}
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
            onFitChange={adoptFit}
            onZoomChange={setZoom}
            onChanged={invalidate}
            readOnly={readOnly}
          />
        )}
      </AudioPatchShell>
    </>
  )
}


const NODE_WIDTH = 200
const CANVAS_HEIGHT = 640
/*
  The one node with nowhere to store a position (Slice 37 A1): `mixer:0`, which exists
  only so outputs belonging to no desk stay patchable. Every node that has columns of its
  own is placed at the coordinates it holds.

  What was wrong before this slice was a coordinate derived from the *browser window* —
  `canvasWidth - NODE_WIDTH - 24`, which is why every position column in this event
  records a window width. A constant is a different thing: it is the same everywhere.
*/
const MIXER_RAIL_X = 24

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
  zoom: zoomProp,
  onFitChange,
  onZoomChange,
  onChanged,
  readOnly = false,
  ready = false,
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
  /**
   * Owned by the tab, because its control lives in the panel's toolbar (FR-020).
   *
   * `null` means *fit, not yet measured* — the phone opens at the scale where the whole
   * graph fits its window, and only this component can know what that is (Slice 36 R3).
   */
  zoom: number | null
  /** The fit scale, reported after each measurement so the bar's readout can name it. */
  onFitChange?: (fit: number) => void
  /** Set by the pinch gesture only; the bar's control is still the tab's. */
  onZoomChange?: (zoom: number) => void
  onChanged: () => Promise<void>
  readOnly?: boolean
  /** Whether the graph's own data has arrived — see `usePlaneView`. */
  ready?: boolean
}) {
  const isMobile = useIsMobile()
  /*
    The one desk job, withheld by the gesture doing nothing (patterns.md §7g). Not a
    permission and not role-dependent: `readOnly` is separate and still applies at both
    widths. Withholding it is also what leaves the platform's own pan unobstructed.
  */
  const spatial = !isMobile
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  /** Holds only the nodes, so the plane's extent cannot be measured from its own answer. */
  const nodesRef = useRef<HTMLDivElement>(null)
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
  const [viewport, setViewport] = useState({ width: 1180, height: CANVAS_HEIGHT })
  /*
    The plane's own size in logical px, measured rather than computed — see the note on
    the input canvas's copy. Absolutely positioned children contribute to a positioned
    ancestor's scroll area, so this is exact without re-deriving how tall a node is.
  */
  const [content, setContent] = useState({ width: 0, height: 0 })
  /*
    The plane: the content plus the same margin the origin already puts on the other two
    sides (FR-006). Without it a node against the right edge is against the edge of the
    scrollable area too, with nowhere to drop the one beside it.
  */
  const plane = useMemo(() => planeExtent(content), [content])

  /*
    The scale at which the whole graph fits its window (patterns.md §7f), measured on both
    axes of both boxes since Slice 37 — the window, and the plane's real extent rather than
    a nominal rectangle. A control, not the opening state (research.md R6).
  */
  const fit = useMemo(() => fitScale(viewport.width, viewport.height, plane.width, plane.height), [viewport, plane])
  const zoom = zoomProp ?? fit

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      // A zero measurement is the element being hidden, not a viewport of nothing —
      // adopting it would drop the desktop's logical width to the 820 floor.
      if (!box || !box.width || !box.height) return
      setViewport((current) =>
        Math.floor(box.width) === current.width && Math.floor(box.height) === current.height
          ? current
          : { width: Math.floor(box.width), height: Math.floor(box.height) },
      )
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    onFitChange?.(fit)
  }, [fit, onFitChange])

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
  // The desk's bus rail. Both axes since Slice 37 — it used to be pinned to the canvas's
  // left edge, so an x would have been overwritten on the next render.
  const moveConsoleMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      updateConsole(eventId, id, { position_x: x, position_y: y }),
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
      // Its x is the coordinate it holds, not the canvas's left edge — the pin that
      // forced the whole coordinate space to be measured from the browser window
      // (Slice 37 FR-004).
      const pos = positions.get(`mixer:${desk.id}`)
      const y = pos?.y ?? desk.position_y
      nodes.push({ kind: 'mixer', id: desk.id, x: pos?.x ?? desk.position_x, y, zone: 'sources' })
      // Below the desk actually placed — see InputGraphCanvas (Slice 24 FR-007).
      nextY = Math.max(nextY + 220, y + 220)

      // Its jack panel, in the processing lane — the mirror of the input
      // canvas's. Before Slice 24 these were out-side-only ports on the desk
      // node, so a bus had no in-side port to land on and the desk's sockets
      // could not be used at all (FR-011, research.md R6). No jacks, no node.
      if (localJackCount(desk, cables) > 0) {
        const jackPos = positions.get(`console_local:${desk.id}`)
        nodes.push({
          kind: 'console_local',
          id: desk.id,
          x: jackPos?.x ?? desk.local_position_x,
          y: jackPos?.y ?? desk.local_position_y,
          zone: 'processing',
        })
      }
    }
    if (orphanOutputs.length > 0 || consoles.length === 0) {
      const mixerPos = positions.get('mixer:0')
      nodes.push({ kind: 'mixer', id: 0, x: mixerPos?.x ?? MIXER_RAIL_X, y: mixerPos?.y ?? nextY, zone: 'sources' })
    }

    /*
      Every device now reads its own stored x, whatever zone it is in. Sources used to be
      forced to the left edge and destinations to `canvasWidth - 224`, which is why their
      position columns hold four different window widths in this event (research.md R2) —
      the migration normalises those once, and from here they mean what they say.

      `zone` survives because it still says which *way* a device faces, which decides its
      ports. It no longer says where it is drawn.
    */
    for (const device of sourceDevices) {
      const pos = effectivePosition('device', device.id, device.position_x, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: pos.x, y: pos.y, zone: 'sources' })
    }
    for (const device of destinationDevices) {
      const pos = effectivePosition('device', device.id, device.position_x, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: pos.x, y: pos.y, zone: 'destinations' })
    }
    for (const sb of stageboxes) {
      const pos = effectivePosition('stagebox', sb.id, sb.position_x, sb.position_y)
      nodes.push({ kind: 'stagebox', id: sb.id, x: pos.x, y: pos.y, zone: 'processing' })
    }
    for (const sm of stageMultis) {
      if (!isStageMultiVisibleInOutputGraph(sm, cables)) continue
      const pos = effectivePosition('stage_multi', sm.id, sm.position_x, sm.position_y)
      nodes.push({ kind: 'stage_multi', id: sm.id, x: pos.x, y: pos.y, zone: 'processing' })
    }
    for (const device of processingDevices) {
      const pos = effectivePosition('device', device.id, device.position_x, device.position_y)
      nodes.push({ kind: 'device', id: device.id, x: pos.x, y: pos.y, zone: 'processing' })
    }
    return nodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoles, orphanOutputs, sourceDevices, destinationDevices, stageboxes, stageMultis, processingDevices, positions, cables])

  /* Where the plane starts — see the input canvas's note (Slice 37 R4). */
  const origin = useMemo(() => planeOrigin(layout), [layout])

  /* Opening where it was last left on this device, and remembering where that is. */
  const { onScroll: rememberView } = usePlaneView({
    eventId,
    tab: 'outputs',
    wrapperRef,
    zoom,
    zoomProp,
    origin,
    content,
    ready,
    onZoom: onZoomChange,
  })

  /* The plane's extent, read off the DOM — see the input canvas's note. */
  useLayoutEffect(() => {
    const el = nodesRef.current
    if (!el) return
    const width = el.scrollWidth
    const height = el.scrollHeight
    setContent((current) => (current.width === width && current.height === height ? current : { width, height }))
  }, [layout, outputs, consoles, stageboxes, stageMultis, devices])


  /*
    Keeping the view still while the plane grows under it (R4). The origin is derived from
    the content, so dragging one node past an edge moves every other node's DOM offset by
    the same delta — and without this the graph lurches under the finger holding it.

    `lastOrigin` is seeded with the first origin and updated on every run including the
    early return, so this can never compose with `usePlaneView`'s absolute restore in one
    commit: by the time a restore happens the ref already agrees with the current origin.
  */
  const lastOrigin = useRef(origin)
  useLayoutEffect(() => {
    const el = wrapperRef.current
    const before = lastOrigin.current
    lastOrigin.current = origin
    if (!el || (before.x === origin.x && before.y === origin.y)) return
    const shift = originShift(before, origin, zoom)
    el.scrollLeft += shift.x
    el.scrollTop += shift.y
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin])

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

  /*
    Whether a node matches the search term — **one** predicate, used both to dim and to
    aim the window (Slice 36 R6). A second predicate is how the dimmed set and the
    window's target come to disagree.
  */
  const matchesNode = useCallback(
    (node: NodeLayout): boolean => {
      if (!search.trim()) return true
      switch (node.kind) {
        case 'stagebox': {
          const sb = stageboxes.find((candidate) => candidate.id === node.id)
          return !!sb && matchesSearch(search, sb.name, sb.model)
        }
        case 'stage_multi': {
          const sm = stageMultis.find((candidate) => candidate.id === node.id)
          return !!sm && matchesSearch(search, sm.name)
        }
        case 'device': {
          const device = devices.find((candidate) => candidate.id === node.id)
          return !!device && matchesSearch(search, device.name)
        }
        case 'console_local': {
          const deskFor = consoles.find((candidate) => candidate.id === node.id)
          return !!deskFor && matchesSearch(search, deskFor.name, 'local')
        }
        default: {
          // A desk's bus list, or the box holding outputs with no desk. It matches when
          // any output on it does — the rows are inside the node, so the node is what
          // the window can be aimed at.
          const owned = node.id === 0 ? outputs.filter((o) => o.console_id == null) : outputs.filter((o) => o.console_id === node.id)
          return owned.some((output) => matchesSearch(search, output.output_number, output.output_name, output.notes))
        }
      }
    },
    [search, stageboxes, stageMultis, devices, consoles, outputs],
  )

  const lastFocused = useRef('')
  /* The window follows the search, at every width (FR-030). See the inputs canvas. */
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !search.trim()) {
      lastFocused.current = ''
      return
    }
    const target = firstMatch(layout, matchesNode)
    if (!target) return
    /*
      Only when the *answer* changes. `layout` gets a new identity on every node
      position update, so without this a term left in the search box would re-aim the
      window on every frame of a desktop drag — the search would fight the hand.
    */
    const key = `${target.kind}:${target.id}`
    if (key === lastFocused.current) return
    lastFocused.current = key
    const { left, top } = focusOffset({ x: target.x - origin.x, y: target.y - origin.y }, {
      zoom,
      viewportW: el.clientWidth,
      viewportH: el.clientHeight,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      nodeW: NODE_WIDTH,
      contentW: plane.width * zoom,
      contentH: plane.height * zoom,
    })
    el.scrollTo({ left, top, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, layout, zoom])

  /* A phone selection is scrolled clear of the inspector sheet (FR-019). */
  useEffect(() => {
    const el = wrapperRef.current
    if (!isMobile || !el || !selection) return
    /*
      An output lives *inside* a desk's bus list, so the node to aim at is the desk that
      owns it — `mixer:0` being the box for outputs belonging to none. Matching the first
      `mixer` node instead would scroll to the wrong desk on any event with two.
    */
    const owner =
      selection.kind === 'output'
        ? { kind: 'mixer', id: outputs.find((output) => output.id === selection.id)?.console_id ?? 0 }
        : { kind: selection.kind, id: selection.id }
    const target = layout.find((node) => node.kind === owner.kind && node.id === owner.id)
    if (!target) return
    const { left, top } = focusOffset({ x: target.x - origin.x, y: target.y - origin.y }, {
      zoom,
      viewportW: el.clientWidth,
      viewportH: el.clientHeight,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      nodeW: NODE_WIDTH,
      clearBottom: el.clientHeight / 2,
      contentW: plane.width * zoom,
      contentH: plane.height * zoom,
    })
    el.scrollTo({ left, top, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, isMobile])

  /*
    Pinch, about the midpoint of the contacts (patterns.md §7f).

    The correction is **stashed and applied after the new scale has been laid out**, not
    written beside the state update. Setting `scrollLeft` while the content box is still
    at the old scale hands the browser an offset it clamps to the old maximum — and
    starting from *fit* the old maximum is ~0, so every frame of a pinch-in would be
    clamped away and the graph would slide out from under the fingers. That is precisely
    the failure `usePinchZoom` exists to prevent, one layer up from where it was fixed.
  */
  const pendingAnchor = useRef<{ target: number; logicalX: number; logicalY: number; pointX: number; pointY: number } | null>(null)
  const onPinch = useCallback(
    (next: number, anchor: { logicalX: number; logicalY: number; pointX: number; pointY: number }) => {
      pendingAnchor.current = { ...anchor, target: next }
      onZoomChange?.(next)
    },
    [onZoomChange],
  )
  useLayoutEffect(() => {
    const el = wrapperRef.current
    const pending = pendingAnchor.current
    if (!el || !pending) return
    /*
      **The scale this anchor was computed for**, and it is checked rather than assumed.

      A pinch emits on every pointer move with no equality test, so the moment it reaches
      either end of `[fit, 1]` — which is the normal way a pinch finishes, over a range
      this short — `setZoom` is a no-op, React bails, and this effect never runs. The
      anchor would then sit in the ref until the *next* zoom change from any source, and
      a tap on the bar's `+` would re-scroll the window to a midpoint from a gesture that
      finished minutes ago.

      Cleared either way: a stale anchor is dropped rather than applied late.
    */
    pendingAnchor.current = null
    if (pending.target !== zoom) return
    el.scrollLeft = pending.logicalX * zoom - pending.pointX
    el.scrollTop = pending.logicalY * zoom - pending.pointY
  }, [zoom])
  usePinchZoom(wrapperRef, { enabled: isMobile, zoom, min: fit, max: 1, onZoom: onPinch })

  /*
    Tap versus pan (Slice 36 R5) — Slice 35's stage-plot finding, applied where the
    handler already is. The browser cancels pointer events once it takes a scroll, so
    the scroll offset is checked as well as the movement.
  */
  const press = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const moved = useRef(false)

  function beginPress(event: ReactPointerEvent) {
    const el = wrapperRef.current
    press.current = { x: event.clientX, y: event.clientY, left: el?.scrollLeft ?? 0, top: el?.scrollTop ?? 0 }
    moved.current = false
  }
  function trackPress(event: ReactPointerEvent) {
    const start = press.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) moved.current = true
  }
  /* `pointercancel` is the browser saying *I have taken this gesture as a scroll*, and it
     is the only signal that is certain: once it fires, `pointermove` stops, so a flick
     whose scroll has not yet started would otherwise read as a clean tap. */
  function cancelPress() {
    moved.current = true
  }
  function pressWasPan(): boolean {
    if (moved.current) return true
    const el = wrapperRef.current
    const start = press.current
    return !!el && !!start && (Math.abs(el.scrollLeft - start.left) > 3 || Math.abs(el.scrollTop - start.top) > 3)
  }
  /** A selection handler that yields to the pan. Every `onSelect` on this canvas uses it. */
  const onTap = (select: () => void) => () => {
    if (pressWasPan()) return
    select()
  }

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
      moveConsoleMutation.mutate({ id, x, y }, { onError })
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

  /*
    Whether a node's header carries a drag handle at all.

    It has to be the **prop** and not a guard inside the handler: `NodeShell` puts
    `touch-none` on the header whenever `onDragStart` is defined, so a handler that
    merely returns early leaves a dead zone the size of every node's title bar — the
    browser will not scroll it and the pan guard then swallows the tap. That is Slice
    35's stage-plot defect ("the plot could only be moved from empty floor") arriving
    by a different route.

    Two independent conditions, combined once here rather than at six call sites.
    `spatial` is about the **surface** — a phone withholds the gesture (§7g) — and
    `readOnly` is about the **role**. Neither stands in for the other, and the desktop's
    expression is unchanged, because `spatial` is always true there.
  */
  const dragHandle = (handler: (event: ReactPointerEvent) => void) => (spatial && !readOnly ? handler : undefined)

  /*
    No `mode` since Slice 37. It used to be `'y-only'` for every node pinned to a lane
    edge — the rails and the source/destination devices — because their x was about to be
    overwritten by the next render anyway. Nothing is pinned now, so every node is free in
    both axes, and there is one drag rather than two (FR-004).
  */
  function startNodeDrag(kind: PortRef['kind'], id: number, event: ReactPointerEvent) {
    if (!spatial) return
    const node = layout.find((n) => n.kind === kind && n.id === id)
    if (!node) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    // `start`, not `origin`: the plane has an origin of its own now.
    const start = { x: node.x, y: node.y }
    let latest = start
    const key = `${kind}:${id}`

    function onMove(moveEvent: PointerEvent) {
      // Node positions live in the canvas's unscaled logical coordinate
      // space, but pointer movement is measured in real screen pixels —
      // at zoom 2x, 1 logical pixel covers 2 screen pixels, so a screen
      // delta has to be divided by the current zoom to get the matching
      // logical delta (otherwise dragging at any zoom other than 100%
      // moves nodes faster or slower than the cursor).
      //
      // Unclamped in both axes, with no floor at zero: a node dragged past an edge
      // extends the plane instead (FR-005).
      const dx = (moveEvent.clientX - startX) / zoom
      const dy = (moveEvent.clientY - startY) / zoom
      latest = { x: start.x + dx, y: start.y + dy }
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
    // A port is drawn, never a target (patterns.md §7f). The cable info dialog behind
    // this is unreachable with it, which is why neither gains a phone form.
    if (!spatial) return
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
    // Not stopped, and not handled: the press belongs to the pan.
    if (!spatial) return
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
    /* A column on a phone, so the viewport below can fill it. Without this the chain of
       definite heights breaks here and the canvas is content-sized: the panel's rows
       region takes the vertical pan and the withheld-gesture note scrolls away with it.
       Both halves of the flex rule (patterns.md §7b) have to hold at every link. */
    <div className={isMobile ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      {error && <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">{error}</div>}
      {pendingPort && !dragGhost && (
        <div className="border-b border-amber-500/30 bg-amber-500/[0.05] px-3 py-1.5 text-[11px] text-amber-300">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className={isMobile ? 'flex min-h-0 flex-1 flex-col' : 'flex items-start gap-3'}>
      {/* The viewport. On a phone the pan is the platform's own scrolling — see the
          inputs canvas and Slice 36 R4. */}
      <div
        ref={wrapperRef}
        className={isMobile ? 'min-h-0 flex-1 overflow-auto' : 'min-w-0 flex-1 overflow-auto'}
        onPointerDown={isMobile ? beginPress : undefined}
        onPointerCancel={isMobile ? cancelPress : undefined}
        onPointerMove={isMobile ? trackPress : undefined}
        onScroll={rememberView}
        style={isMobile ? { touchAction: 'pan-x pan-y' } : { height: CANVAS_HEIGHT }}
      >
        {/*
          The scrolled box, sized to the plane at the current scale, and inside it the plane
          itself at its logical size.

          Both are sized, and the inner one **must** be. A block element with `width: auto`
          lays out at its parent's width — already `plane.width * zoom` — and then paints
          through `scale(zoom)` at `plane.width * zoom²`, so above 100 % the transformed box
          overflows the sized one and the wrapper gains up to half a plane of empty scroll.
          Stating the logical size makes the painted size exactly the parent's.

          This element is **not** what the extent is measured from — that is `nodesRef`
          below, for the reason given at its own site.

          No lane bands: a band saying *Rig* is a claim about where nodes are, and nothing
          constrains that now (FR-013, research.md R7).
        */}
        <div style={{ width: plane.width * zoom, height: plane.height * zoom }}>
          <div ref={canvasRef} className="relative" style={{ width: plane.width, height: plane.height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            <svg className="pointer-events-none absolute left-0 top-0" width={plane.width} height={plane.height}>
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
            {/*
              The measured element, and it holds **only the nodes** (Slice 37, review).

              Two things would otherwise feed the measurement its own previous answer. The
              `<svg>` above is sized to the plane, and a positioned child contributes its
              own edge to `scrollWidth` — so the extent could grow and never shrink, and a
              node dragged back from the far right would leave the space behind. And a
              *block* element inherits its parent's width, so its `scrollWidth` has a floor
              of the outer box's `plane.width * zoom`, which above 100 % inflates on every
              remeasure. Absolutely positioned with no width, this element shrink-to-fits
              over nothing — abs-positioned children do not contribute — so its scroll area
              is exactly the nodes, and nothing derived from the previous answer.
            */}
            <div ref={nodesRef} className="absolute left-0 top-0">
            {layout.map((node) => {
              if (node.kind === 'console_local') {
                const desk = consoles.find((c) => c.id === node.id)
                if (!desk) return null
                return (
                  <LocalJackNode
                    key={`jacks-${desk.id}`}
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    desk={desk}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={dragHandle((e) => startNodeDrag('console_local', desk.id, e))}
                    selected={selection?.kind === 'console_local' && selection.id === desk.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'console_local', id: desk.id }))}
                    dimmed={!matchesNode(node)}
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
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    desk={desk}
                    outputs={outputs.filter((row) => row.console_id === desk.id)}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={dragHandle((e) => startNodeDrag('mixer', desk.id, e))}
                    selectedOutputId={selection?.kind === 'output' ? selection.id : undefined}
                    onSelectOutput={(id) => onTap(() => onSelectionChange({ kind: 'output', id }))()}
                    search={search}
                  />
                ) : (
                  <MixerNode
                    key="mixer"
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    outputs={orphanOutputs}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={dragHandle((e) => startNodeDrag('mixer', 0, e))}
                    selectedOutputId={selection?.kind === 'output' ? selection.id : undefined}
                    onSelectOutput={(id) => onTap(() => onSelectionChange({ kind: 'output', id }))()}
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
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    stagebox={sb}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={dragHandle((e) => startNodeDrag('stagebox', sb.id, e))}
                    selected={selection?.kind === 'stagebox' && selection.id === sb.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'stagebox', id: sb.id }))}
                    dimmed={!matchesNode(node)}
                  />
                )
              }
              if (node.kind === 'stage_multi') {
                const sm = stageMultis.find((s) => s.id === node.id)
                if (!sm) return null
                return (
                  <StageMultiNode
                    key={`sm-${sm.id}`}
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    stageMulti={sm}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={dragHandle((e) => startNodeDrag('stage_multi', sm.id, e))}
                    selected={selection?.kind === 'stage_multi' && selection.id === sm.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'stage_multi', id: sm.id }))}
                    dimmed={!matchesNode(node)}
                  />
                )
              }
              const device = devices.find((d) => d.id === node.id)
              if (!device) return null
              return (
                <DeviceNode
                  key={`dev-${device.id}`}
                  x={node.x - origin.x}
                  y={node.y - origin.y}
                  device={device}
                  cables={cables}
                  pendingPort={pendingPort}
                  onPortClick={handlePortClick}
                  onPortPointerDown={handlePortPointerDown}
                  registerPort={registerPort}
                  colorContext={colorContext}
                  onDragStart={dragHandle((e) => startNodeDrag('device', device.id, e))}
                  selected={selection?.kind === 'device' && selection.id === device.id}
                  onSelect={onTap(() => onSelectionChange({ kind: 'device', id: device.id }))}
                  onDelete={readOnly ? undefined : () => deleteDeviceMutation.mutate(device.id)}
                  dimmed={!matchesNode(node)}
                />
              )
            })}
            </div>
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

      {devices.length === 0 && stageboxes.length === 0 && !stageMultis.some((sm) => isStageMultiVisibleInOutputGraph(sm, cables)) && (
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
  const { inputs, outputs } = consoleLocalPorts(desk, localJackCount(desk, cables))
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={desk.name || 'Console'} badge="LOCAL" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow
          key={inPort.port}
          inPort={inPort}
          outPort={outputs[index]}
          label={String(inPort.port + 1)}
          // Past the model's count: kept from before a switch, and said so (B2).
          over={inPort.port >= desk.local_output_count}
          wiring={wiring}
        />
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
