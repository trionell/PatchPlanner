import type {
  PlotTruss,
  PlotTrussFixture,
  PlotTrussPiece,
  StagePlot,
  StagePlotElement,
  StagePlotLayer,
  StagePlotLink,
  StagePlotResponse,
} from '../types'
import { get, request } from './client'

// ---- Plots ----

export const listStagePlots = (eventId: number) => request<StagePlot[]>(`/events/${eventId}/stage-plots`)
export const getStagePlot = (eventId: number, plotId: number, signal?: AbortSignal) =>
  get<StagePlotResponse>(`/events/${eventId}/stage-plots/${plotId}`, signal)
export const createStagePlot = (eventId: number, name: string) =>
  request<StagePlot>(`/events/${eventId}/stage-plots`, { method: 'POST', body: JSON.stringify({ name }) })
export const updateStagePlot = (eventId: number, plotId: number, patch: Partial<Omit<StagePlot, 'id' | 'event_id'>>) =>
  request<StagePlot>(`/events/${eventId}/stage-plots/${plotId}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteStagePlot = (eventId: number, plotId: number) =>
  request<void>(`/events/${eventId}/stage-plots/${plotId}`, { method: 'DELETE' })

// ---- Layers ----

export const createStagePlotLayer = (eventId: number, plotId: number, data: { name: string; color?: string }) =>
  request<StagePlotLayer>(`/events/${eventId}/stage-plots/${plotId}/layers`, { method: 'POST', body: JSON.stringify(data) })
export const updateStagePlotLayer = (
  eventId: number,
  plotId: number,
  layerId: number,
  patch: Partial<Omit<StagePlotLayer, 'id' | 'plot_id'>>,
) =>
  request<StagePlotLayer>(`/events/${eventId}/stage-plots/${plotId}/layers/${layerId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
export const deleteStagePlotLayer = (eventId: number, plotId: number, layerId: number) =>
  request<void>(`/events/${eventId}/stage-plots/${plotId}/layers/${layerId}`, { method: 'DELETE' })

// ---- Elements ----

export type StagePlotElementCreate = Omit<StagePlotElement, 'id' | 'plot_id' | 'links'>
export type StagePlotElementPatch = Partial<Omit<StagePlotElementCreate, 'kind' | 'shape_kind' | 'truss_id' | 'fixture_id'>>

export const createStagePlotElement = (eventId: number, plotId: number, data: StagePlotElementCreate) =>
  request<StagePlotElement>(`/events/${eventId}/stage-plots/${plotId}/elements`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
export const updateStagePlotElement = (eventId: number, plotId: number, elementId: number, patch: StagePlotElementPatch) =>
  request<StagePlotElement>(`/events/${eventId}/stage-plots/${plotId}/elements/${elementId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
export const deleteStagePlotElement = (eventId: number, plotId: number, elementId: number) =>
  request<void>(`/events/${eventId}/stage-plots/${plotId}/elements/${elementId}`, { method: 'DELETE' })

// ---- Element links (assignments & stack entries) ----

export const createStagePlotLink = (
  eventId: number,
  plotId: number,
  elementId: number,
  data: Pick<StagePlotLink, 'role' | 'entity_kind' | 'entity_id'> & { sort_order?: number },
) =>
  request<StagePlotLink>(`/events/${eventId}/stage-plots/${plotId}/elements/${elementId}/links`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
export const updateStagePlotLink = (eventId: number, plotId: number, elementId: number, linkId: number, sortOrder: number) =>
  request<StagePlotLink>(`/events/${eventId}/stage-plots/${plotId}/elements/${elementId}/links/${linkId}`, {
    method: 'PATCH',
    body: JSON.stringify({ sort_order: sortOrder }),
  })
export const deleteStagePlotLink = (eventId: number, plotId: number, elementId: number, linkId: number) =>
  request<void>(`/events/${eventId}/stage-plots/${plotId}/elements/${elementId}/links/${linkId}`, { method: 'DELETE' })

// ---- Trusses (event-scoped) ----

export const listPlotTrusses = (eventId: number, signal?: AbortSignal) => get<PlotTruss[]>(`/events/${eventId}/plot-trusses`, signal)
export const createPlotTruss = (eventId: number, data: { name: string; height_cm?: number }) =>
  request<PlotTruss>(`/events/${eventId}/plot-trusses`, { method: 'POST', body: JSON.stringify(data) })
export const updatePlotTruss = (eventId: number, trussId: number, patch: { name?: string; height_cm?: number }) =>
  request<PlotTruss>(`/events/${eventId}/plot-trusses/${trussId}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deletePlotTruss = (eventId: number, trussId: number) =>
  request<void>(`/events/${eventId}/plot-trusses/${trussId}`, { method: 'DELETE' })

export const createPlotTrussPiece = (
  eventId: number,
  trussId: number,
  data: { inventory_item_id?: number; label?: string; length_cm: number },
) => request<PlotTrussPiece>(`/events/${eventId}/plot-trusses/${trussId}/pieces`, { method: 'POST', body: JSON.stringify(data) })
export const updatePlotTrussPiece = (
  eventId: number,
  trussId: number,
  pieceId: number,
  patch: { inventory_item_id?: number; label?: string; length_cm?: number; sort_order?: number },
) =>
  request<PlotTrussPiece>(`/events/${eventId}/plot-trusses/${trussId}/pieces/${pieceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
export const deletePlotTrussPiece = (eventId: number, trussId: number, pieceId: number) =>
  request<void>(`/events/${eventId}/plot-trusses/${trussId}/pieces/${pieceId}`, { method: 'DELETE' })

export const attachPlotTrussFixture = (eventId: number, trussId: number, fixtureId: number, offsetCm: number | null) =>
  request<PlotTrussFixture>(`/events/${eventId}/plot-trusses/${trussId}/fixtures/${fixtureId}`, {
    method: 'PUT',
    body: JSON.stringify({ offset_cm: offsetCm }),
  })
export const detachPlotTrussFixture = (eventId: number, trussId: number, fixtureId: number) =>
  request<void>(`/events/${eventId}/plot-trusses/${trussId}/fixtures/${fixtureId}`, { method: 'DELETE' })
