import type { EventRental, ManualRentalRequest, RentalExportReport, RentalSummary } from '../types'
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
