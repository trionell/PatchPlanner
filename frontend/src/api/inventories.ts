import type { Event, FixtureMode, Inventory, InventoryCategory, InventoryImportResult, InventoryItem } from '../types'
import { API_BASE, request } from './client'

// Owner-scoped inventory management (Slice 16) — every route here is
// gated by RequireInventoryOwner on the backend (404 for anyone but the
// owner, no role gradient). Event-scoped read-only access lives in
// api/inventory.ts.

export const listMyInventories = () => request<Inventory[]>('/inventories')
export const createInventory = (name: string) =>
  request<Inventory>('/inventories', { method: 'POST', body: JSON.stringify({ name }) })
export const getInventory = (inventoryId: number) => request<Inventory>(`/inventories/${inventoryId}`)
export const renameInventory = (inventoryId: number, name: string) =>
  request<Inventory>(`/inventories/${inventoryId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
export const deleteInventory = (inventoryId: number) => request<void>(`/inventories/${inventoryId}`, { method: 'DELETE' })
export const duplicateInventory = (inventoryId: number) =>
  request<Inventory>(`/inventories/${inventoryId}/duplicate`, { method: 'POST' })

// Every event bound to this catalog — what the manage drawer lists, and the
// same set the list's `eventCount` counted (Slice 32). Not derived from the
// events query: that one is membership-scoped and the count is not.
export const listInventoryEvents = (inventoryId: number) =>
  request<Event[]>(`/inventories/${inventoryId}/events`)

export const listCategories = (inventoryId: number) => request<InventoryCategory[]>(`/inventories/${inventoryId}/categories`)
export const updateCategoryPickerRole = (inventoryId: number, categoryId: number, role: 'cable' | 'stand' | 'truss' | null) =>
  request<InventoryCategory>(`/inventories/${inventoryId}/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ picker_role: role }),
  })

// ---- Manual catalog management (Slice 22) ----
// Available on any inventory, imported or not. Hand-created items are
// flagged is_manual by the server so later imports leave them alone.

export type CategoryDraft = { name: string; category_type: InventoryCategory['category_type'] }
export type ItemDraft = {
  category_id: number
  name: string
  description: string
  quantity_available: number
  price_ex_vat: number
}

export const createCategory = (inventoryId: number, draft: CategoryDraft) =>
  request<InventoryCategory>(`/inventories/${inventoryId}/categories`, { method: 'POST', body: JSON.stringify(draft) })
export const updateCategory = (inventoryId: number, categoryId: number, draft: Partial<CategoryDraft>) =>
  request<InventoryCategory>(`/inventories/${inventoryId}/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  })
export const deleteCategory = (inventoryId: number, categoryId: number) =>
  request<void>(`/inventories/${inventoryId}/categories/${categoryId}`, { method: 'DELETE' })

export const createItem = (inventoryId: number, draft: ItemDraft) =>
  request<InventoryItem>(`/inventories/${inventoryId}/items`, { method: 'POST', body: JSON.stringify(draft) })
export const updateItem = (inventoryId: number, itemId: number, draft: Partial<ItemDraft>) =>
  request<InventoryItem>(`/inventories/${inventoryId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(draft) })
export const deleteItem = (inventoryId: number, itemId: number) =>
  request<void>(`/inventories/${inventoryId}/items/${itemId}`, { method: 'DELETE' })

export const listItems = (inventoryId: number, params?: { categoryId?: number; categoryType?: string }) => {
  const search = new URLSearchParams()
  if (params?.categoryId) search.set('category_id', String(params.categoryId))
  if (params?.categoryType) search.set('category_type', params.categoryType)
  return request<InventoryItem[]>(`/inventories/${inventoryId}/items${search.toString() ? `?${search.toString()}` : ''}`)
}

/**
 * Imports a catalog spreadsheet. The server works out whether it is an LL
 * price list or the generic format and reports which on the result, so the
 * user uploads one file and never has to classify it first.
 */
export const importInventoryXlsx = (inventoryId: number, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request<InventoryImportResult>(`/inventories/${inventoryId}/import-xlsx`, { method: 'POST', body: formData })
}

// Plain URL rather than a fetch: downloads are navigations, matching how
// the rental exports already work (api/rentals.ts).
export const inventoryTemplateUrl = () => `${API_BASE}/inventory-template.xlsx`

export const listFixtureModes = (inventoryId: number, itemId: number) =>
  request<FixtureMode[]>(`/inventories/${inventoryId}/items/${itemId}/fixture-modes`)
export const createFixtureMode = (inventoryId: number, itemId: number, name: string, channelCount: number) =>
  request<FixtureMode>(`/inventories/${inventoryId}/items/${itemId}/fixture-modes`, {
    method: 'POST',
    body: JSON.stringify({ name, channel_count: channelCount }),
  })
export const updateFixtureMode = (inventoryId: number, modeId: number, name: string, channelCount: number) =>
  request<FixtureMode>(`/inventories/${inventoryId}/fixture-modes/${modeId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, channel_count: channelCount }),
  })
export const deleteFixtureMode = (inventoryId: number, modeId: number) =>
  request<void>(`/inventories/${inventoryId}/fixture-modes/${modeId}`, { method: 'DELETE' })
