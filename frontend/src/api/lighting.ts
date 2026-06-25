import type { LightingFixture, LightingRigResponse } from '../types'
import { request } from './client'

export const getLightingRig = (eventId: number) => request<LightingRigResponse>(`/events/${eventId}/lighting-rigs`)
export const createLightingFixture = (eventId: number, rigId: number, data: Omit<LightingFixture, 'id'>) =>
  request<LightingFixture>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures`, { method: 'POST', body: JSON.stringify(data) })
export const updateLightingFixture = (eventId: number, rigId: number, fixtureId: number, data: Omit<LightingFixture, 'id'>) =>
  request<LightingFixture>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/${fixtureId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteLightingFixture = (eventId: number, rigId: number, fixtureId: number) =>
  request<void>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/${fixtureId}`, { method: 'DELETE' })
export const autoAssignDMX = (eventId: number, rigId: number) =>
  request<LightingFixture[]>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/auto-assign-dmx`, { method: 'POST' })
