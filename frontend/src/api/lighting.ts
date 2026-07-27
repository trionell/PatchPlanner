import type { AddressChange, BulkFixtureRequest, LightingFixture, LightingRigResponse } from '../types'
import { request } from './client'

export const getLightingRig = (eventId: number) => request<LightingRigResponse>(`/events/${eventId}/lighting-rigs`)
export const createLightingFixture = (eventId: number, rigId: number, data: Omit<LightingFixture, 'id'>) =>
  request<LightingFixture>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures`, { method: 'POST', body: JSON.stringify(data) })
export const updateLightingFixture = (eventId: number, rigId: number, fixtureId: number, data: Omit<LightingFixture, 'id'>) =>
  request<LightingFixture>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/${fixtureId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteLightingFixture = (eventId: number, rigId: number, fixtureId: number) =>
  request<void>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/${fixtureId}`, { method: 'DELETE' })
export const bulkAddFixtures = (eventId: number, rigId: number, data: BulkFixtureRequest) =>
  request<LightingFixture[]>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/bulk`, { method: 'POST', body: JSON.stringify(data) })
/**
 * Applies one planned list of address changes, whole or not at all.
 *
 * This replaced `autoAssignDMX` in Slice 27. Auto-assign, optimise and make room
 * are all planned in `lib/dmxPlan.ts` — the DMX map has to exist in the browser
 * anyway for the sheet, the strip, the drawer and the collision prompt, so the
 * packing lives beside it rather than in two languages (specs/027 research.md R3).
 */
export const updateFixtureAddresses = (eventId: number, rigId: number, changes: AddressChange[]) =>
  request<LightingFixture[]>(`/events/${eventId}/lighting-rigs/${rigId}/fixtures/addresses`, {
    method: 'PATCH',
    body: JSON.stringify({ changes }),
  })
