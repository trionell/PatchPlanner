import type { ReferenceData, ReferenceValue } from '../types'
import { request } from './client'

export const getReferenceTemplate = () => request<ReferenceData>('/reference-templates')
export const createReferenceTemplateValue = (vocabulary: string, value: string, label: string) =>
  request<ReferenceValue>(`/reference-templates/${vocabulary}/values`, { method: 'POST', body: JSON.stringify({ value, label }) })
export const updateReferenceTemplateValue = (vocabulary: string, valueId: number, label: string) =>
  request<ReferenceValue>(`/reference-templates/${vocabulary}/values/${valueId}`, { method: 'PATCH', body: JSON.stringify({ label }) })
export const deleteReferenceTemplateValue = (vocabulary: string, valueId: number) =>
  request<void>(`/reference-templates/${vocabulary}/values/${valueId}`, { method: 'DELETE' })
