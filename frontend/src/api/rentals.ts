import type { RentalSummary } from '../types'
import { request } from './client'

export const getRentalSummary = (eventId: number) => request<RentalSummary>(`/events/${eventId}/rentals`)
