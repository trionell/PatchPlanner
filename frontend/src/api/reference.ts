import type { ReferenceData, ReferenceValue } from '../types'
import { request } from './client'

export const getReferenceData = () => request<ReferenceData>('/reference-data')
export const createReferenceValue = (vocabulary: string, value: string, label: string) =>
  request<ReferenceValue>(`/reference-data/${vocabulary}/values`, { method: 'POST', body: JSON.stringify({ value, label }) })
export const updateReferenceValue = (vocabulary: string, valueId: number, label: string) =>
  request<ReferenceValue>(`/reference-data/${vocabulary}/values/${valueId}`, { method: 'PATCH', body: JSON.stringify({ label }) })
export const deleteReferenceValue = (vocabulary: string, valueId: number) =>
  request<void>(`/reference-data/${vocabulary}/values/${valueId}`, { method: 'DELETE' })
