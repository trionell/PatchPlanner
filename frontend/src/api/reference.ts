import type { FixtureMode, ReferenceData, ReferenceValue } from '../types'
import { request } from './client'

export const getReferenceData = () => request<ReferenceData>('/reference-data')
export const createReferenceValue = (vocabulary: string, value: string, label: string) =>
  request<ReferenceValue>(`/reference-data/${vocabulary}/values`, { method: 'POST', body: JSON.stringify({ value, label }) })
export const updateReferenceValue = (vocabulary: string, valueId: number, label: string) =>
  request<ReferenceValue>(`/reference-data/${vocabulary}/values/${valueId}`, { method: 'PATCH', body: JSON.stringify({ label }) })
export const deleteReferenceValue = (vocabulary: string, valueId: number) =>
  request<void>(`/reference-data/${vocabulary}/values/${valueId}`, { method: 'DELETE' })

export const listFixtureModes = (itemId: number) =>
  request<FixtureMode[]>(`/inventory/items/${itemId}/fixture-modes`)
export const createFixtureMode = (itemId: number, name: string, channelCount: number) =>
  request<FixtureMode>(`/inventory/items/${itemId}/fixture-modes`, { method: 'POST', body: JSON.stringify({ name, channel_count: channelCount }) })
export const updateFixtureMode = (modeId: number, name: string, channelCount: number) =>
  request<FixtureMode>(`/fixture-modes/${modeId}`, { method: 'PATCH', body: JSON.stringify({ name, channel_count: channelCount }) })
export const deleteFixtureMode = (modeId: number) =>
  request<void>(`/fixture-modes/${modeId}`, { method: 'DELETE' })
