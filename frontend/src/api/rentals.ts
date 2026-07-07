import type { EventRental, ManualRentalRequest, RentalSummary } from '../types'
import { request } from './client'

export const getRentalSummary = (eventId: number) => request<RentalSummary>(`/events/${eventId}/rentals`)

export const putManualRental = (eventId: number, itemId: number, payload: ManualRentalRequest) =>
  request<EventRental>(`/events/${eventId}/rentals/manual/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) })

export const deleteManualRental = (eventId: number, itemId: number) =>
  request<void>(`/events/${eventId}/rentals/manual/${itemId}`, { method: 'DELETE' })
