import type { InventoryCategory, InventoryImportResult, InventoryItem } from '../types'
import { request } from './client'

export const listInventoryCategories = () => request<InventoryCategory[]>('/inventory/categories')
export const listInventoryItems = (params?: { categoryId?: number; categoryType?: string; role?: 'cable' | 'stand' }) => {
  const search = new URLSearchParams()
  if (params?.categoryId) search.set('category_id', String(params.categoryId))
  if (params?.categoryType) search.set('category_type', params.categoryType)
  if (params?.role) search.set('role', params.role)
  return request<InventoryItem[]>(`/inventory/items${search.toString() ? `?${search.toString()}` : ''}`)
}
export const updateCategoryPickerRole = (categoryId: number, pickerRole: 'cable' | 'stand' | null) =>
  request<InventoryCategory>(`/inventory/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ picker_role: pickerRole }) })
export const importInventory = () => request<InventoryImportResult>('/inventory/import-xlsx', { method: 'POST' })
