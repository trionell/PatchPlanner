import type { FixtureMode, Inventory, InventoryCategory, InventoryImportResult, InventoryItem } from '../types'
import { request } from './client'

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

export const listCategories = (inventoryId: number) => request<InventoryCategory[]>(`/inventories/${inventoryId}/categories`)
export const updateCategoryPickerRole = (inventoryId: number, categoryId: number, role: 'cable' | 'stand' | 'truss' | null) =>
  request<InventoryCategory>(`/inventories/${inventoryId}/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ picker_role: role }),
  })

export const listItems = (inventoryId: number, params?: { categoryId?: number; categoryType?: string }) => {
  const search = new URLSearchParams()
  if (params?.categoryId) search.set('category_id', String(params.categoryId))
  if (params?.categoryType) search.set('category_type', params.categoryType)
  return request<InventoryItem[]>(`/inventories/${inventoryId}/items${search.toString() ? `?${search.toString()}` : ''}`)
}

export const importInventoryXlsx = (inventoryId: number, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request<InventoryImportResult>(`/inventories/${inventoryId}/import-xlsx`, { method: 'POST', body: formData })
}

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
