import type { ReferenceData, ReferenceValue } from '../types'
import { request } from './client'

export const getReferenceData = (eventId: number) => request<ReferenceData>(`/events/${eventId}/reference-data`)
export const createReferenceValue = (eventId: number, vocabulary: string, value: string, label: string) =>
  request<ReferenceValue>(`/events/${eventId}/reference-data/${vocabulary}/values`, { method: 'POST', body: JSON.stringify({ value, label }) })
export const updateReferenceValue = (eventId: number, vocabulary: string, valueId: number, label: string) =>
  request<ReferenceValue>(`/events/${eventId}/reference-data/${vocabulary}/values/${valueId}`, { method: 'PATCH', body: JSON.stringify({ label }) })
export const deleteReferenceValue = (eventId: number, vocabulary: string, valueId: number) =>
  request<void>(`/events/${eventId}/reference-data/${vocabulary}/values/${valueId}`, { method: 'DELETE' })
