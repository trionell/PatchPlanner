import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
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
import type { PlotTruss, StagePlotResponse } from '../../types'
import { useDraftState } from '../../hooks/useDraftState'
import { roundCm } from '../../lib/stagePlot'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { PlotTrussManager } from './PlotTrussManager'
import { StagePlotCanvas, type PlotViewState } from './StagePlotCanvas'
import { StagePlotInspector, StagePlotLayersPanel } from './StagePlotInspector'
import { StagePlotPalette } from './StagePlotPalette'

/** The per-event Stage Plots section: plot tabs, toolbar, and the
 *  draw.io-style palette / canvas / inspector editor (Slice 13). */
export function StagePlotTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
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

  const [selectedElementId, setSelectedElementId] = useState<number | null>(null)
  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [gridSizeDraft, setGridSizeDraft] = useDraftState(response?.plot.grid_size_cm, String, '25')
  const [trussManagerOpen, setTrussManagerOpen] = useState(false)

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

  // ---- Viewport ----

  const handleViewStateChange = (state: PlotViewState) => {
    if (activePlotId == null) return
    setViewStates((prev) => ({ ...prev, [activePlotId]: state }))
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
    handlePlace({ kind: 'truss', truss_id: truss.id, name: '', z_cm: 0, width_cm: 0, depth_cm: 30, height_cm: 30, rotation_deg: 0 })
    setTrussManagerOpen(false)
  }

  const placedTrussIds = new Set((response?.elements ?? []).filter((element) => element.truss_id != null).map((element) => element.truss_id as number))

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

  return (
    <div className="space-y-3">
      {/* Plot tabs bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1">
          {plots.map((plot) => (
            <button
              key={plot.id}
              type="button"
              onClick={() => {
                setSelectedPlotId(plot.id)
                setSelectedElementId(null)
              }}
              className={
                plot.id === activePlotId
                  ? 'rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-950'
                  : 'rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800'
              }
            >
              {plot.name}
            </button>
          ))}
          {creatingName == null ? (
            <button
              type="button"
              onClick={() => setCreatingName('')}
              className="rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
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
          )}
        </div>

        {activePlotId != null && response && (
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
        <p className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          No stage plots yet — create one to start drawing the stage to scale.
        </p>
      ) : !response ? (
        <p className="text-sm text-zinc-400">Loading plot…</p>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-14 text-center tabular-nums text-zinc-200">{Math.round(viewState.zoom * 100)} %</span>
              <Button variant="ghost" size="sm" title="Zoom in" onClick={() => zoomBy(1.25)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <span className="h-5 w-px bg-zinc-800" aria-hidden />
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={response.plot.grid_visible}
                onChange={(e) => updatePlotSettings.mutate({ grid_visible: e.target.checked })}
              />
              Grid
            </label>
            <label className="flex items-center gap-1.5">
              <Input
                className="h-7 w-16 text-right tabular-nums"
                value={gridSizeDraft}
                onChange={(e) => setGridSizeDraft(e.target.value)}
                onBlur={() => {
                  const parsed = Number(gridSizeDraft.replace(',', '.'))
                  if (Number.isFinite(parsed) && parsed > 0) updatePlotSettings.mutate({ grid_size_cm: parsed })
                  else setGridSizeDraft(String(response.plot.grid_size_cm))
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label="Grid size (cm)"
              />
              cm
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={response.plot.snap_grid}
                onChange={(e) => updatePlotSettings.mutate({ snap_grid: e.target.checked })}
              />
              Snap to grid
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={response.plot.snap_objects}
                onChange={(e) => updatePlotSettings.mutate({ snap_objects: e.target.checked })}
              />
              Snap to objects
            </label>
            <span className="h-5 w-px bg-zinc-800" aria-hidden />
            {/* Three linked projections of the same model (US6): an edit
                in any view is an edit of the shared elements. */}
            <div className="inline-flex rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
              {(['top', 'front', 'side'] as const).map((viewOption) => (
                <button
                  key={viewOption}
                  type="button"
                  onClick={() => updatePlotSettings.mutate({ active_view: viewOption })}
                  className={
                    response.plot.active_view === viewOption
                      ? 'rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-zinc-950'
                      : 'rounded px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200'
                  }
                >
                  {viewOption === 'top' ? 'Top' : viewOption === 'front' ? 'Front' : 'Side'}
                </button>
              ))}
            </div>
            <span className="h-5 w-px bg-zinc-800" aria-hidden />
            <Button variant="outline" size="sm" onClick={() => setTrussManagerOpen(true)}>
              Trusses…
            </Button>
            <span className="ml-auto text-xs text-zinc-500">1 square = {response.plot.grid_size_cm} cm · canvas is true to scale</span>
          </div>

          {/* Editor */}
          <div className="flex items-stretch gap-3">
            <StagePlotPalette onPlace={handlePlace} disabled={activeLayerId == null || createElementMutation.isPending} />
            <div className="min-w-0 flex-1">
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
              />
            </div>
            <div className="flex w-64 flex-none flex-col gap-3">
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
              />
              <StagePlotLayersPanel
                layers={response.layers}
                activeLayerId={activeLayerId}
                onSetActive={setChosenLayerId}
                onCreate={(name) => createLayerMutation.mutate(name)}
                onUpdate={(layerId, patch) => updateLayerMutation.mutate({ layerId, patch })}
                onDelete={(layerId) => deleteLayerMutation.mutate(layerId)}
              />
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Fixture labels</p>
                <div className="flex flex-col gap-1.5 text-sm text-zinc-400">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="accent-amber-500" checked={response.plot.show_fixture_name} onChange={(e) => updatePlotSettings.mutate({ show_fixture_name: e.target.checked })} />
                    Name
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="accent-amber-500" checked={response.plot.show_fixture_fid} onChange={(e) => updatePlotSettings.mutate({ show_fixture_fid: e.target.checked })} />
                    Fixture ID (FID)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="accent-amber-500" checked={response.plot.show_fixture_dmx} onChange={(e) => updatePlotSettings.mutate({ show_fixture_dmx: e.target.checked })} />
                    DMX universe · address
                  </label>
                </div>
              </div>
            </div>
            <PlotTrussManager
              eventId={eventId}
              trusses={response.trusses}
              open={trussManagerOpen}
              onClose={() => setTrussManagerOpen(false)}
              onChanged={invalidatePlot}
              onPlace={handlePlaceTruss}
              placedTrussIds={placedTrussIds}
            />
          </div>
        </>
      )}
    </div>
  )
}
