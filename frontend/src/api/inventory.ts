import type { Inventory, InventoryCategory, InventoryItem } from '../types'
import { request } from './client'

// Event-scoped, read-only reads of the event's bound inventory (Slice 16)
// — reuses the event's own access control, so any role (including
// viewer) can read here. Management (create/rename/import/etc.) lives in
// api/inventories.ts, scoped by inventoryId and owner-only.

export const getEventInventory = (eventId: number) => request<Inventory>(`/events/${eventId}/inventory`)

export const listEventInventoryCategories = (eventId: number) =>
  request<InventoryCategory[]>(`/events/${eventId}/inventory/categories`)

export const listEventInventoryItems = (
  eventId: number,
  params?: { categoryId?: number; categoryType?: string; role?: 'cable' | 'stand' | 'truss'; includeDiscontinued?: boolean },
) => {
  const search = new URLSearchParams()
  if (params?.categoryId) search.set('category_id', String(params.categoryId))
  if (params?.categoryType) search.set('category_type', params.categoryType)
  if (params?.role) search.set('role', params.role)
  if (params?.includeDiscontinued) search.set('include_discontinued', 'true')
  return request<InventoryItem[]>(`/events/${eventId}/inventory/items${search.toString() ? `?${search.toString()}` : ''}`)
}
