import type {
  Event,
  EventPricingRequest,
  EventRental,
  ManualRentalRequest,
  RentalExportReport,
  RentalSummary,
} from '../types'
import { API_BASE, request } from './client'

export const getRentalSummary = (eventId: number) => request<RentalSummary>(`/events/${eventId}/rentals`)

export const putManualRental = (eventId: number, itemId: number, payload: ManualRentalRequest) =>
  request<EventRental>(`/events/${eventId}/rentals/manual/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) })

export const deleteManualRental = (eventId: number, itemId: number) =>
  request<void>(`/events/${eventId}/rentals/manual/${itemId}`, { method: 'DELETE' })

export const getRentalExportReport = (eventId: number) =>
  request<RentalExportReport>(`/events/${eventId}/rental-export/report`)

/** Plain URL for the file download — navigated to directly so the browser handles the attachment. */
export const rentalExportUrl = (eventId: number) => `${API_BASE}/events/${eventId}/rental-export`

/** PDF order — available for every inventory, however it was populated. */
export const rentalExportPdfUrl = (eventId: number) => `${API_BASE}/events/${eventId}/rental-export/pdf`

/** Plain spreadsheet order — also available for every inventory. */
export const rentalExportXlsxUrl = (eventId: number) => `${API_BASE}/events/${eventId}/rental-export/xlsx`

/**
 * This event's own pricing terms (Slice 31) — `null` on the first three means
 * *follow the catalog*.
 *
 * Its own route rather than part of the event PATCH, which is a whole-object
 * replace on the server: folding pricing into it would let the details drawer's
 * Save wipe an agreed discount.
 */
export const putEventPricing = (eventId: number, pricing: EventPricingRequest) =>
  request<Event>(`/events/${eventId}/pricing`, { method: 'PUT', body: JSON.stringify(pricing) })
