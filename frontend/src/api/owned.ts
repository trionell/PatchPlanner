import type { EventOwnedEquipment, OwnedEquipmentRequest, OwnedItem } from '../types'
import { request } from './client'

export type OwnedItemDraft = Omit<OwnedItem, 'id' | 'planned_on_events' | 'created_at'>

export const listOwnedItems = () => request<OwnedItem[]>('/owned-items')
export const createOwnedItem = (data: OwnedItemDraft) =>
  request<OwnedItem>('/owned-items', { method: 'POST', body: JSON.stringify(data) })
export const updateOwnedItem = (itemId: number, data: OwnedItemDraft) =>
  request<OwnedItem>(`/owned-items/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteOwnedItem = (itemId: number) =>
  request<void>(`/owned-items/${itemId}`, { method: 'DELETE' })

export const listEventOwnedEquipment = (eventId: number) =>
  request<EventOwnedEquipment[]>(`/events/${eventId}/owned-equipment`)
export const putEventOwnedEquipment = (eventId: number, ownedItemId: number, payload: OwnedEquipmentRequest) =>
  request<EventOwnedEquipment>(`/events/${eventId}/owned-equipment/${ownedItemId}`, { method: 'PUT', body: JSON.stringify(payload) })
export const deleteEventOwnedEquipment = (eventId: number, ownedItemId: number) =>
  request<void>(`/events/${eventId}/owned-equipment/${ownedItemId}`, { method: 'DELETE' })
