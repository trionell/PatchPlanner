import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Info, Maximize2, Minimize2, Minus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { getLightingRig } from '../../api/lighting'
import {
  attachPlotTrussFixture,
  createStagePlot,
  createStagePlotElement,
  createStagePlotLayer,
  createStagePlotLink,
  deleteStagePlot,
  deleteStagePlotElement,
  deleteStagePlotLayer,
  deleteStagePlotLink,
  getStagePlot,
  listStagePlots,
  updateStagePlot,
  updateStagePlotElement,
  updateStagePlotLayer,
  updateStagePlotLink,
  type StagePlotElementCreate,
  type StagePlotElementPatch,
} from '../../api/stagePlots'
import type { PlotTruss, StagePlotResponse, StagePlotView, TrussSide } from '../../types'
import { useDraftState } from '../../hooks/useDraftState'
import { useIsMobile } from '../../hooks/useIsMobile'
import { roundCm } from '../../lib/stagePlot'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { MicroLabel } from '../ui/Label'
import { PatchPanel } from '../ui/PatchPanel'
import { Tab } from '../ui/Tabs'
import { PrintButton } from '../print/PrintButton'
import { StagePlotSheet } from '../print/StagePlotSheet'
import { PlotTrussManager } from './PlotTrussManager'
import { InspectorRail } from './graph/InspectorRail'
import { ZoomControl } from './graph/ZoomControl'
import { StagePlotCanvas, type PlotViewState } from './StagePlotCanvas'
import { StagePlotInspector, StagePlotLayersPanel } from './StagePlotInspector'
import { StagePlotPalette } from './StagePlotPalette'
import { MobilePanel } from '../ui/MobilePanel'
import { MobilePicker } from '../mobile/MobilePicker'
import { Sheet } from '../ui/Sheet'
import { StatusStrip } from './StatusStrip'
import { Pill } from '../ui/SheetTable'

/** The per-event Stage Plots section: plot tabs, toolbar, and the
 *  draw.io-style palette / canvas / inspector editor (Slice 13). */
export function StagePlotTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  /*
    A role question, and only a role question (Wave 6c, audit.md M4).

    This had the viewport `&&`-ed into the role until Slice 35. What a phone withholds is
    real, but it is **one gesture** and not a permission: placing an element on a scale
    drawing is a mouse's precision over a picture (patterns.md §7g). Everything an
    element *is* — its name, its kind, its layer, what is attached to it — is a form
    over a row, and that has a phone form now.

    So this governs the role. The gesture is withheld structurally instead: the phone
    branch wires the canvas no placement handlers at all, and says so in a sentence the
    user can read.
  */
  const editingAllowed = !readOnly
  const plotsQuery = useQuery({ queryKey: ['stage-plots', eventId], queryFn: () => listStagePlots(eventId) })
  const plots = useMemo(() => plotsQuery.data ?? [], [plotsQuery.data])

  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null)
  const activePlotId = selectedPlotId != null && plots.some((plot) => plot.id === selectedPlotId) ? selectedPlotId : (plots[0]?.id ?? null)

  const plotQuery = useQuery({
    queryKey: ['stage-plot', eventId, activePlotId],
    queryFn: ({ signal }) => getStagePlot(eventId, activePlotId as number, signal),
    enabled: activePlotId != null,
  })
  const response = plotQuery.data

  // The rig feeds the palette's fixture list and free-element names.
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const rigFixtures = useMemo(() => lightingQuery.data?.fixtures ?? [], [lightingQuery.data])
  const fixtureNameById = useMemo(
    () => new Map(rigFixtures.map((fixture) => [fixture.id, fixture.custom_name || fixture.inventory_item_name || `Fixture ${fixture.id}`])),
    [rigFixtures],
  )

  const [selectedElementId, setSelectedElementId] = useState<number | null>(null)
  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [gridSizeDraft, setGridSizeDraft] = useDraftState(response?.plot.grid_size_cm, String, '25')
  const [trussManagerOpen, setTrussManagerOpen] = useState(false)
  // Fullscreen editor: the canvas fills the browser window and the
  // toolbar / palette / inspector float on top of it.
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', listener)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', listener)
      document.body.style.overflow = previousOverflow
    }
  }, [fullscreen])

  // The phone's own view choice — local-only, never persisted. `active_view` is a
  // shared plot setting, and switching to Front to check a rake on site should not
  // change what the next person opens on a desk.
  const [mobileView, setMobileView] = useState<StagePlotView>('top')

  // Viewport state lives here (not in the canvas) so the palette can
  // place elements at the visible centre; persisted debounced.
  const [viewStates, setViewStates] = useState<Record<number, PlotViewState>>({})
  const canvasSize = useRef({ width: 800, height: 560 })
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const viewState: PlotViewState =
    (activePlotId != null ? viewStates[activePlotId] : undefined) ??
    (response
      ? { zoom: response.plot.zoom, panX: response.plot.pan_x_cm, panY: response.plot.pan_y_cm }
      : { zoom: 1, panX: -50, panY: -50 })

  const invalidatePlot = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['stage-plot', eventId, activePlotId] }),
    [queryClient, eventId, activePlotId],
  )
  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['stage-plots', eventId] })

  // ---- Plot management ----

  const createPlotMutation = useMutation({
    mutationFn: (name: string) => createStagePlot(eventId, name),
    onSuccess: async (plot) => {
      setCreatingName(null)
      await invalidateList()
      setSelectedPlotId(plot.id)
    },
  })
  const renamePlotMutation = useMutation({
    mutationFn: (name: string) => updateStagePlot(eventId, activePlotId as number, { name }),
    onSuccess: async () => {
      setRenamingName(null)
      await invalidateList()
      await invalidatePlot()
    },
  })
  const deletePlotMutation = useMutation({
    mutationFn: () => deleteStagePlot(eventId, activePlotId as number),
    onSuccess: async () => {
      setSelectedPlotId(null)
      setSelectedElementId(null)
      setFullscreen(false)
      await invalidateList()
    },
  })

  const updatePlotSettings = useMutation({
    mutationFn: (patch: Parameters<typeof updateStagePlot>[2]) => updateStagePlot(eventId, activePlotId as number, patch),
    onSuccess: (plot) => {
      queryClient.setQueryData<StagePlotResponse>(['stage-plot', eventId, activePlotId], (old) => (old ? { ...old, plot } : old))
    },
  })

  // ---- Element mutations (optimistic for drag smoothness) ----

  const applyElementPatch = (elementId: number, patch: StagePlotElementPatch) => {
    queryClient.setQueryData<StagePlotResponse>(['stage-plot', eventId, activePlotId], (old) =>
      old
        ? { ...old, elements: old.elements.map((element) => (element.id === elementId ? { ...element, ...patch } : element)) }
        : old,
    )
  }

  const updateElementMutation = useMutation({
    mutationFn: ({ elementId, patch }: { elementId: number; patch: StagePlotElementPatch }) =>
      updateStagePlotElement(eventId, activePlotId as number, elementId, patch),
    onMutate: async ({ elementId, patch }) => applyElementPatch(elementId, patch),
    onError: () => invalidatePlot(),
    onSuccess: (element) => {
      queryClient.setQueryData<StagePlotResponse>(['stage-plot', eventId, activePlotId], (old) =>
        old ? { ...old, elements: old.elements.map((entry) => (entry.id === element.id ? element : entry)) } : old,
      )
    },
  })

  const createElementMutation = useMutation({
    mutationFn: (data: StagePlotElementCreate) => createStagePlotElement(eventId, activePlotId as number, data),
    onSuccess: async (element) => {
      await invalidatePlot()
      setSelectedElementId(element.id)
    },
  })

  const deleteElementMutation = useMutation({
    mutationFn: (elementId: number) => deleteStagePlotElement(eventId, activePlotId as number, elementId),
    onSuccess: async () => {
      setSelectedElementId(null)
      await invalidatePlot()
    },
  })

  // Drag-and-drop truss attachment: dragging a fixture marker along a
  // truss re-positions it; dropping a free fixture element onto a truss
  // bar attaches it (the element is consumed by the attachment).
  const attachFixtureMutation = useMutation({
    mutationFn: async ({ trussId, fixtureId, offsetCm, side, consumeElementId }: { trussId: number; fixtureId: number; offsetCm: number; side: TrussSide; consumeElementId?: number }) => {
      await attachPlotTrussFixture(eventId, trussId, fixtureId, { offset_cm: offsetCm, side })
      if (consumeElementId != null) await deleteStagePlotElement(eventId, activePlotId as number, consumeElementId)
    },
    onSuccess: async (_data, variables) => {
      if (variables.consumeElementId != null && variables.consumeElementId === selectedElementId) setSelectedElementId(null)
      await invalidatePlot()
      await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
    },
  })

  // Delete/Backspace removes the selected element — unless the user is
  // typing in a form field, and never on a locked layer.
  const deleteSelectedRef = useRef<() => void>(() => {})
  useEffect(() => {
    // Re-pointed after every render so the window listener sees the
    // current selection (refs must not be written during render).
    deleteSelectedRef.current = () => {
      if (readOnly || selectedElementId == null || !response) return
      const element = response.elements.find((entry) => entry.id === selectedElementId)
      if (!element) return
      const layer = response.layers.find((entry) => entry.id === element.layer_id)
      if (!layer?.visible || layer.locked) return
      deleteElementMutation.mutate(element.id)
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      event.preventDefault()
      deleteSelectedRef.current()
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  // ---- Viewport ----

  const handleViewStateChange = (state: PlotViewState) => {
    if (activePlotId == null) return
    setViewStates((prev) => ({ ...prev, [activePlotId]: state }))
    // Pan/zoom itself is a local view interaction a viewer may still do
    // freely — only persisting it back to the server is gated.
    if (readOnly) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      updatePlotSettings.mutate({ zoom: state.zoom, pan_x_cm: roundCm(state.panX), pan_y_cm: roundCm(state.panY) })
    }, 800)
  }

  const zoomBy = (factor: number) => {
    const center = {
      u: viewState.panX + canvasSize.current.width / (2 * viewState.zoom),
      v: viewState.panY + canvasSize.current.height / (2 * viewState.zoom),
    }
    const zoom = Math.min(20, Math.max(0.05, viewState.zoom * factor))
    handleViewStateChange({
      zoom,
      panX: center.u - canvasSize.current.width / (2 * zoom),
      panY: center.v - canvasSize.current.height / (2 * zoom),
    })
  }

  // ---- Element links (assignments & stack entries, US4) ----

  const addLinkMutation = useMutation({
    mutationFn: ({ elementId, role, entityKind, entityId, sortOrder }: { elementId: number; role: 'assignment' | 'stack'; entityKind: Parameters<typeof createStagePlotLink>[3]['entity_kind']; entityId: number; sortOrder: number }) =>
      createStagePlotLink(eventId, activePlotId as number, elementId, { role, entity_kind: entityKind, entity_id: entityId, sort_order: sortOrder }),
    onSuccess: invalidatePlot,
  })
  const reorderLinkMutation = useMutation({
    mutationFn: ({ elementId, linkId, sortOrder }: { elementId: number; linkId: number; sortOrder: number }) =>
      updateStagePlotLink(eventId, activePlotId as number, elementId, linkId, sortOrder),
    onSuccess: invalidatePlot,
  })
  const deleteLinkMutation = useMutation({
    mutationFn: ({ elementId, linkId }: { elementId: number; linkId: number }) =>
      deleteStagePlotLink(eventId, activePlotId as number, elementId, linkId),
    onSuccess: invalidatePlot,
  })

  // ---- Layers ----

  const [chosenLayerId, setChosenLayerId] = useState<number | null>(null)
  // Active layer: the user's pick if it still exists and is placeable,
  // else the first visible unlocked layer (new elements join it, US3).
  const activeLayerId = (() => {
    const layers = response?.layers ?? []
    const chosen = layers.find((layer) => layer.id === chosenLayerId)
    if (chosen && chosen.visible && !chosen.locked) return chosen.id
    return layers.find((layer) => layer.visible && !layer.locked)?.id ?? layers[0]?.id ?? null
  })()

  const createLayerMutation = useMutation({
    mutationFn: (name: string) => createStagePlotLayer(eventId, activePlotId as number, { name }),
    onSuccess: async (layer) => {
      await invalidatePlot()
      setChosenLayerId(layer.id)
    },
  })
  const updateLayerMutation = useMutation({
    mutationFn: ({ layerId, patch }: { layerId: number; patch: Parameters<typeof updateStagePlotLayer>[3] }) =>
      updateStagePlotLayer(eventId, activePlotId as number, layerId, patch),
    onSuccess: invalidatePlot,
  })
  const deleteLayerMutation = useMutation({
    mutationFn: (layerId: number) => deleteStagePlotLayer(eventId, activePlotId as number, layerId),
    onSuccess: invalidatePlot,
  })

  // ---- Placement from the palette ----

  const handlePlace = (template: Omit<StagePlotElementCreate, 'layer_id' | 'x_cm' | 'y_cm'>) => {
    if (activeLayerId == null) return
    const centerU = roundCm(viewState.panX + canvasSize.current.width / (2 * viewState.zoom))
    const centerV = roundCm(viewState.panY + canvasSize.current.height / (2 * viewState.zoom))
    createElementMutation.mutate({ ...template, layer_id: activeLayerId, x_cm: centerU, y_cm: centerV })
  }

  const handlePlaceTruss = (truss: PlotTruss) => {
    handlePlace({ kind: 'truss', truss_id: truss.id, name: '', z_cm: 0, width_cm: 0, depth_cm: 30, height_cm: 30, rotation_deg: 0, tilt_deg: 0 })
    setTrussManagerOpen(false)
  }

  const placedTrussIds = new Set((response?.elements ?? []).filter((element) => element.truss_id != null).map((element) => element.truss_id as number))
  // Rotation lives on the placement, so the Trusses dialog can edit it.
  const placedTrussElements = new Map(
    (response?.elements ?? [])
      .filter((element) => element.kind === 'truss' && element.truss_id != null)
      .map((element) => [element.truss_id as number, element]),
  )

  // ---- Render ----

  if (plotsQuery.isLoading) return <p className="text-sm text-zinc-400">Loading stage plots…</p>
  if (plotsQuery.isError) return <p className="text-sm text-red-400">Failed to load stage plots.</p>

  // An element on a hidden layer is unselectable (US3): drop any live
  // selection the moment its layer is hidden.
  const selectedElement = (() => {
    const element = response?.elements.find((entry) => entry.id === selectedElementId) ?? null
    if (!element) return null
    const layer = response?.layers.find((entry) => entry.id === element.layer_id)
    return layer?.visible ? element : null
  })()

  /*
    The phone (Wave 6c). Its own return, above the desktop's, for the reason every other
    tab's is: the plot tab strip, the rename controls and the palette are a desktop
    composition, and sharing them meant the phone rendered a strip of `h-8` controls it
    could not use above a canvas it could. Which plot is a *choose one of N*, and on a
    phone that is `MobilePicker`.
  */
  if (isMobile) {
    return (
      <MobilePanel
        /* Both selectors change what you are looking at, so both stay visible; the bar
           wraps to two rows, which §7b says it does before it scrolls. */
        actions={
          <>
            <MobilePicker
              label="Plot"
              onChange={(id) => {
                setSelectedPlotId(Number(id))
                setSelectedElementId(null)
              }}
              options={plots.map((plot) => ({ id: plot.id, label: plot.name }))}
              title="Plots"
              value={activePlotId}
            />
            <div className="flex h-11 flex-none items-center rounded-md border border-zinc-700 bg-zinc-900">
              {(['top', 'front', 'side'] as const).map((viewOption) => (
                <button
                  className={
                    mobileView === viewOption
                      ? 'flex h-11 min-w-[3rem] items-center justify-center rounded-md bg-amber-500 px-2 text-sm font-medium text-zinc-950'
                      : 'flex h-11 min-w-[3rem] items-center justify-center px-2 text-sm text-zinc-400'
                  }
                  key={viewOption}
                  onClick={() => setMobileView(viewOption)}
                  type="button"
                >
                  {viewOption === 'top' ? 'Top' : viewOption === 'front' ? 'Front' : 'Side'}
                </button>
              ))}
            </div>
            <span className="flex flex-none items-center gap-0.5">
              <button
                aria-label="Zoom out"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400"
                onClick={() => zoomBy(1 / 1.25)}
                type="button"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-11 text-center font-mono text-xs tabular-nums text-zinc-300">
                {Math.round(viewState.zoom * 100)}%
              </span>
              <button
                aria-label="Zoom in"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400"
                onClick={() => zoomBy(1.25)}
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            </span>
          </>
        }
        strip={
          response ? (
            <StatusStrip tint="border-zinc-800 bg-zinc-950/60">
              <Pill className="bg-emerald-500/15 text-emerald-300">
                {plots.length} {plots.length === 1 ? 'plot' : 'plots'}
              </Pill>
              <span className="font-mono tabular-nums text-zinc-200">{response.elements.length} elements</span>
              <span className="font-mono tabular-nums text-zinc-500">{response.trusses.length} trusses</span>
            </StatusStrip>
          ) : undefined
        }
        title="Stage Plots"
      >
        {/*
          The one desk job, named where the editor would be (patterns.md §7g). It is not
          a banner, not a dialog and not a disabled control, and it does not change with
          role — it is about the surface, not the person. The read view above it is
          complete for everyone, and the second sentence has to be true, which is what
          the inspector sheet below is for.
        */}
        <div className="flex gap-2 border-b border-zinc-800/60 bg-zinc-950/35 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 flex-none text-zinc-500" />
          <p className="text-xs leading-relaxed text-zinc-400">
            <span className="font-medium text-zinc-300">Placing elements is a desk job</span> — open this plot on a
            computer. Tap anything on it to read or edit what it is.
          </p>
        </div>

        {activePlotId == null ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">No stage plots yet.</p>
        ) : !response ? (
          <p className="px-3 py-6 text-sm text-zinc-400">Loading plot…</p>
        ) : (
          <>
            <div className="h-[60svh] min-h-[300px]">
              <StagePlotCanvas
                key={activePlotId}
                elements={response.elements}
                fillParent
                fixtureNameById={fixtureNameById}
                layers={response.layers}
                onCanvasSize={(size) => {
                  canvasSize.current = size
                }}
                onSelectElement={setSelectedElementId}
                /* Placement is withheld by handing the canvas nothing to move with —
                   the gesture, not the role. */
                onUpdateElement={() => {}}
                onViewStateChange={handleViewStateChange}
                plot={response.plot}
                readOnly
                selectedElementId={selectedElementId}
                trusses={response.trusses}
                view={mobileView}
                viewState={viewState}
              />
            </div>

            {/* Tap an element and you get the rail's own fields, committing per field
                as they do on a desk — so no footer and no Save (patterns.md §7d). */}
            {selectedElement && (
              <Sheet
                onClose={() => setSelectedElementId(null)}
                open
                title={<span className="text-lg font-semibold">{selectedElement.name || 'Element'}</span>}
              >
                <StagePlotInspector
                  element={selectedElement}
                  eventId={eventId}
                  layers={response.layers}
                  onAddLink={(elementId, role, entityKind, entityId, sortOrder) =>
                    addLinkMutation.mutate({ elementId, role, entityKind, entityId, sortOrder })
                  }
                  onDelete={(elementId) => deleteElementMutation.mutate(elementId)}
                  onDeleteLink={(elementId, linkId) => deleteLinkMutation.mutate({ elementId, linkId })}
                  onDuplicate={() => {}}
                  onReorderLink={(elementId, linkId, sortOrder) => reorderLinkMutation.mutate({ elementId, linkId, sortOrder })}
                  onUpdate={(elementId, patch) => updateElementMutation.mutate({ elementId, patch })}
                  readOnly={!editingAllowed}
                  spatial={false}
                />
              </Sheet>
            )}
          </>
        )}
      </MobilePanel>
    )
  }

  return (
    <>
    <div className="space-y-3 print:hidden">
      {/*
        Which plot — "what you are looking at", so it is drawn as the page tabs
        above it are and not as a trough (design/patterns.md §6). The trough this
        used to sit in was the third toolbar idiom in the application, and it said
        "these are alternative views of one thing", which sibling plots are not.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1">
          {plots.map((plot) => (
            <Tab
              key={plot.id}
              onClick={() => {
                setSelectedPlotId(plot.id)
                setSelectedElementId(null)
              }}
              active={plot.id === activePlotId}
            >
              {plot.name}
            </Tab>
          ))}
          {editingAllowed && (creatingName == null ? (
            <button
              type="button"
              onClick={() => setCreatingName('')}
              className="rounded-md px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              New plot
            </button>
          ) : (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (creatingName.trim()) createPlotMutation.mutate(creatingName.trim())
              }}
            >
              <Input autoFocus className="h-8 w-36" placeholder="Plot name" value={creatingName} onChange={(e) => setCreatingName(e.target.value)} />
              <Button type="submit" size="sm" disabled={!creatingName.trim()}>
                <Check className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingName(null)}>
                <X className="h-4 w-4" />
              </Button>
            </form>
          ))}
        </div>

        {activePlotId != null && response && editingAllowed && (
          <div className="flex items-center gap-1">
            {renamingName == null ? (
              <>
                <Button variant="ghost" size="sm" title="Rename plot" onClick={() => setRenamingName(response.plot.name)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Delete plot"
                  onClick={() => {
                    if (window.confirm(`Delete stage plot "${response.plot.name}" and everything on it?`)) deletePlotMutation.mutate()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (renamingName.trim()) renamePlotMutation.mutate(renamingName.trim())
                }}
              >
                <Input autoFocus className="h-8 w-36" value={renamingName} onChange={(e) => setRenamingName(e.target.value)} />
                <Button type="submit" size="sm" disabled={!renamingName.trim()}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenamingName(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        )}
      </div>

      {activePlotId == null ? (
        <p className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          No stage plots yet — create one to start drawing the stage to scale.
        </p>
      ) : !response ? (
        <p className="text-sm text-zinc-400">Loading plot…</p>
      ) : (
        (() => {
          // The panel's bar, in the order design/patterns.md §1 fixes: title,
          // view toggle, extras (zoom), the rest, flex-1, Print, and the trailing
          // action. It no longer sticks: the panel is one frame, and a bar that
          // detaches from its own content while you scroll is the three-cards
          // reading `PatchPanel` exists to end.
          const bar = (
            <>
              <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">{response.plot.name}</span>

              {/* Three linked projections of the same model (US6): an edit
                  in any view is an edit of the shared elements. A trough here is
                  correct — these *are* alternative views of one thing. */}
              <div className="inline-flex shrink-0 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
                {(['top', 'front', 'side'] as const).map((viewOption) => (
                  <Button
                    key={viewOption}
                    size="xs"
                    variant={response.plot.active_view === viewOption ? 'default' : 'ghost'}
                    disabled={readOnly}
                    onClick={() => updatePlotSettings.mutate({ active_view: viewOption })}
                    className="h-6 px-2"
                  >
                    {viewOption === 'top' ? 'Top' : viewOption === 'front' ? 'Front' : 'Side'}
                  </Button>
                ))}
              </div>

              <ZoomControl
                zoom={viewState.zoom}
                onZoomOut={() => zoomBy(1 / 1.25)}
                onZoomIn={() => zoomBy(1.25)}
                onReset={() => zoomBy(1 / viewState.zoom)}
              />

              <span className="h-5 w-px shrink-0 bg-zinc-800" aria-hidden />

              <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-amber-500"
                  checked={response.plot.grid_visible}
                  onChange={(e) => updatePlotSettings.mutate({ grid_visible: e.target.checked })}
                  disabled={readOnly}
                />
                Grid
              </label>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                <Input
                  size="sm"
                  className="h-7 w-14 text-right tabular-nums"
                  value={gridSizeDraft}
                  onChange={(e) => setGridSizeDraft(e.target.value)}
                  onBlur={() => {
                    const parsed = Number(gridSizeDraft.replace(',', '.'))
                    if (Number.isFinite(parsed) && parsed > 0) updatePlotSettings.mutate({ grid_size_cm: parsed })
                    else setGridSizeDraft(String(response.plot.grid_size_cm))
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  aria-label="Grid size (cm)"
                  disabled={readOnly}
                />
                cm
              </label>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-amber-500"
                  checked={response.plot.snap_grid}
                  onChange={(e) => updatePlotSettings.mutate({ snap_grid: e.target.checked })}
                  disabled={readOnly}
                />
                Snap to grid
              </label>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-amber-500"
                  checked={response.plot.snap_objects}
                  onChange={(e) => updatePlotSettings.mutate({ snap_objects: e.target.checked })}
                  disabled={readOnly}
                />
                Snap to objects
              </label>

              {!readOnly && (
                <Button size="xs" variant="outline" onClick={() => setTrussManagerOpen(true)}>
                  Trusses…
                </Button>
              )}

              <span className="flex-1" />

              <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                1 sq = {response.plot.grid_size_cm} cm · true to scale
              </span>
              <PrintButton />
              <Button
                size="xs"
                variant="ghost"
                className="w-7 p-0"
                title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
                onClick={() => setFullscreen((value) => !value)}
              >
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </>
          )

          const palette = (
            <StagePlotPalette
              onPlace={handlePlace}
              disabled={readOnly || activeLayerId == null || createElementMutation.isPending}
              rigFixtures={rigFixtures.map((fixture) => ({
                id: fixture.id,
                name: fixtureNameById.get(fixture.id) ?? `Fixture ${fixture.id}`,
                trussName: fixture.truss_name || undefined,
                placed: (response.elements ?? []).some((element) => element.fixture_id === fixture.id),
              }))}
            />
          )

          const canvas = (
              <StagePlotCanvas
                key={activePlotId}
                plot={response.plot}
                trusses={response.trusses}
                layers={response.layers}
                elements={response.elements}
                view={response.plot.active_view}
                viewState={viewState}
                onViewStateChange={handleViewStateChange}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateElement={(elementId, patch) => updateElementMutation.mutate({ elementId, patch })}
                onCanvasSize={(size) => {
                  canvasSize.current = size
                }}
                fixtureNameById={fixtureNameById}
                onAttachFixture={(args) => attachFixtureMutation.mutate(args)}
                fillParent={fullscreen}
                readOnly={readOnly}
              />
          )


          // The far column, on the rail both flow canvases already use: a left
          // border rather than a stack of cards floating beside the drawing.
          const sidePanels = (
            <InspectorRail className="overflow-y-auto">
              <StagePlotInspector
                eventId={eventId}
                element={selectedElement}
                layers={response.layers}
                onUpdate={(elementId, patch) => updateElementMutation.mutate({ elementId, patch })}
                onDuplicate={(template) => createElementMutation.mutate(template)}
                onDelete={(elementId) => deleteElementMutation.mutate(elementId)}
                onAddLink={(elementId, role, entityKind, entityId, sortOrder) => addLinkMutation.mutate({ elementId, role, entityKind, entityId, sortOrder })}
                onReorderLink={(elementId, linkId, sortOrder) => reorderLinkMutation.mutate({ elementId, linkId, sortOrder })}
                onDeleteLink={(elementId, linkId) => deleteLinkMutation.mutate({ elementId, linkId })}
                readOnly={readOnly}
              />
              <StagePlotLayersPanel
                layers={response.layers}
                activeLayerId={activeLayerId}
                onSetActive={setChosenLayerId}
                onCreate={(name) => createLayerMutation.mutate(name)}
                onUpdate={(layerId, patch) => updateLayerMutation.mutate({ layerId, patch })}
                onDelete={(layerId) => deleteLayerMutation.mutate(layerId)}
                readOnly={readOnly}
              />
              <section className="flex flex-col gap-1.5">
                <MicroLabel>Fixture labels</MicroLabel>
                <div className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-amber-500" checked={response.plot.show_fixture_name} onChange={(e) => updatePlotSettings.mutate({ show_fixture_name: e.target.checked })} disabled={readOnly} />
                    Name
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-amber-500" checked={response.plot.show_fixture_fid} onChange={(e) => updatePlotSettings.mutate({ show_fixture_fid: e.target.checked })} disabled={readOnly} />
                    Fixture ID (FID)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-amber-500" checked={response.plot.show_fixture_dmx} onChange={(e) => updatePlotSettings.mutate({ show_fixture_dmx: e.target.checked })} disabled={readOnly} />
                    DMX universe · address
                  </label>
                </div>
              </section>
            </InspectorRail>
          )

          const trussManager = (
            <PlotTrussManager
              eventId={eventId}
              trusses={response.trusses}
              open={trussManagerOpen}
              onClose={() => setTrussManagerOpen(false)}
              readOnly={readOnly}
              onChanged={invalidatePlot}
              onPlace={handlePlaceTruss}
              placedTrussIds={placedTrussIds}
              placedElements={placedTrussElements}
              onRotate={(elementId, patch) => updateElementMutation.mutate({ elementId, patch })}
            />
          )

          // Fullscreen: the canvas fills the browser window; the toolbar
          // and side panels float above it, and pointer events fall
          // through the empty overlay areas to the canvas below.
          if (fullscreen)
            return (
              <div className="fixed inset-0 z-40 !mt-0 bg-zinc-950">
                <div className="absolute inset-0">{canvas}</div>
                <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
                  <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/90 px-3 py-2.5 backdrop-blur">
                    {bar}
                  </div>
                  <div className="flex min-h-0 flex-1 items-stretch justify-between gap-3">
                    <div className="pointer-events-auto flex rounded-xl border border-zinc-700 bg-zinc-950/85 backdrop-blur-sm">{palette}</div>
                    <div className="pointer-events-auto flex overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950/85 backdrop-blur-sm">{sidePanels}</div>
                  </div>
                </div>
                {trussManager}
              </div>
            )

          // One frame: bar, then palette | canvas | rail as three columns of the
          // same panel. It used to be a floating toolbar above three separate
          // rounded cards with gaps between them — the arrangement `PatchPanel`
          // was built to replace on the audio tabs (P1).
          return (
            <>
              <PatchPanel bar={bar}>
                <div className="flex items-stretch">
                  {palette}
                  <div className="min-w-0 flex-1">{canvas}</div>
                  {sidePanels}
                </div>
              </PatchPanel>
              {trussManager}
            </>
          )
        })()
      )}
    </div>
    {response && <StagePlotSheet eventId={eventId} response={response} />}
    </>
  )
}
