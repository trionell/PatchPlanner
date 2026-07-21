import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Filter, Pencil, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import {
  createInventory,
  deleteInventory,
  duplicateInventory,
  importInventoryXlsx,
  listCategories,
  listItems,
  listMyInventories,
  renameInventory,
  updateCategoryPickerRole,
} from '../api/inventories'
import { FixtureModeManager } from '../components/FixtureModeManager'
import { OwnedGearManager } from '../components/OwnedGearManager'
import { useIsMobile } from '../hooks/useIsMobile'
import { cn } from '../lib/utils'
import { CondensedListRow } from '../components/mobile/CondensedListRow'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import type { Inventory, InventoryCategory, InventoryItem } from '../types'

export function InventoriesPage() {
  return (
    <Tabs defaultValue="inventories">
      <TabList>
        <Tab value="inventories">My Inventories</Tab>
        <Tab value="owned">Owned gear</Tab>
      </TabList>
      <TabPanel value="inventories"><MyInventories /></TabPanel>
      <TabPanel value="owned"><OwnedGearManager /></TabPanel>
    </Tabs>
  )
}

function MyInventories() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const inventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories })
  const selected = inventoriesQuery.data?.find((inventory) => inventory.id === selectedId)

  if (selected) {
    return <InventoryDetail inventory={selected} onBack={() => setSelectedId(null)} />
  }
  return <InventoryList inventories={inventoriesQuery.data ?? []} onSelect={setSelectedId} />
}

function InventoryList({ inventories, onSelect }: { inventories: Inventory[]; onSelect: (id: number) => void }) {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventories'] })
  const onError = (mutationError: Error) => setError(mutationError.message)

  const createMutation = useMutation({
    mutationFn: (name: string) => createInventory(name),
    onSuccess: async () => {
      setNewName('')
      setError('')
      await invalidate()
    },
    onError,
  })
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameInventory(id, name),
    onSuccess: invalidate,
    onError,
  })
  const duplicateMutation = useMutation({ mutationFn: (id: number) => duplicateInventory(id), onSuccess: invalidate, onError })
  const deleteMutation = useMutation({ mutationFn: (id: number) => deleteInventory(id), onSuccess: invalidate, onError })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Each inventory is its own independent equipment catalog. Bind one to an event when you create it, and reuse it across
          events.
        </p>
      </div>

      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Create a new inventory</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-zinc-300">Name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Backline" />
          </div>
          <Button
            disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newName.trim())}
          >
            Create
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {inventories.map((inventory) => (
          <Card key={inventory.id}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <button type="button" className="flex-1 text-left" onClick={() => onSelect(inventory.id)}>
                <div className="font-medium text-zinc-100">{inventory.name}</div>
                <div className="text-xs text-zinc-500">
                  {inventory.sourceFilename ? `Imported from ${inventory.sourceFilename}` : 'No price list imported yet'}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title="Rename"
                  onClick={() => {
                    const name = window.prompt('Rename inventory', inventory.name)
                    if (name && name.trim() && name.trim() !== inventory.name) {
                      renameMutation.mutate({ id: inventory.id, name: name.trim() })
                    }
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" title="Duplicate" onClick={() => duplicateMutation.mutate(inventory.id)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Delete"
                  onClick={() => {
                    if (window.confirm(`Delete "${inventory.name}"? This can't be undone.`)) {
                      deleteMutation.mutate(inventory.id)
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {inventories.length === 0 && <p className="text-sm text-zinc-400">No inventories yet — create your first one above.</p>}
      </div>
    </div>
  )
}

function InventoryDetail({ inventory, onBack }: { inventory: Inventory; onBack: () => void }) {
  const inventoryId = inventory.id
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()
  const [message, setMessage] = useState('')
  const [modesItem, setModesItem] = useState<InventoryItem | null>(null)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)

  const categoriesQuery = useQuery({ queryKey: ['inventory-categories', inventoryId], queryFn: () => listCategories(inventoryId) })
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', inventoryId, selectedCategoryId],
    queryFn: () => listItems(inventoryId, selectedCategoryId ? { categoryId: selectedCategoryId } : undefined),
  })

  const importMutation = useMutation({
    mutationFn: (file: File) => importInventoryXlsx(inventoryId, file),
    onSuccess: async (result) => {
      setMessage(`Imported ${result.categories_imported} categories and ${result.items_imported} items.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-categories', inventoryId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-items', inventoryId] }),
        queryClient.invalidateQueries({ queryKey: ['inventories'] }),
      ])
    },
  })
  const roleMutation = useMutation({
    mutationFn: ({ categoryId, role }: { categoryId: number; role: 'cable' | 'stand' | 'truss' | null }) =>
      updateCategoryPickerRole(inventoryId, categoryId, role),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-categories', inventoryId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-items', inventoryId] }),
      ])
    },
  })

  const selectedCategory = useMemo(
    () => categoriesQuery.data?.find((category: InventoryCategory) => category.id === selectedCategoryId),
    [categoriesQuery.data, selectedCategoryId],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
          <h2 className="text-lg font-semibold text-zinc-100">{inventory.name}</h2>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importMutation.mutate(file)
              e.target.value = ''
            }}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
            <Upload className="mr-2 h-4 w-4" />
            {importMutation.isPending ? 'Importing...' : 'Import price list (.xlsx)'}
          </Button>
        </div>
      </div>
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <div className={isMobile ? 'space-y-3' : 'grid gap-6 lg:grid-cols-[320px,1fr]'}>
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={() => setCategoryFilterOpen(true)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200"
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-zinc-400" />
                {selectedCategory?.name ?? 'All categories'}
              </span>
              <Badge>{selectedCategory?.item_count ?? itemsQuery.data?.length ?? 0}</Badge>
            </button>
            {/* Picker-role assignment (which patch picker a category feeds) stays desktop-only here — a rare setup action, not a filter concern. */}
            <Dialog open={categoryFilterOpen} onClose={() => setCategoryFilterOpen(false)} title="Filter by category">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId(undefined)
                    setCategoryFilterOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm',
                    selectedCategoryId === undefined ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-200 hover:bg-zinc-850',
                  )}
                >
                  All categories
                </button>
                {(categoriesQuery.data ?? []).map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(category.id === selectedCategoryId ? undefined : category.id)
                      setCategoryFilterOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm',
                      category.id === selectedCategoryId ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-200 hover:bg-zinc-850',
                    )}
                  >
                    <div>
                      <div className="font-medium">{category.name}</div>
                      <div className="text-xs text-zinc-500">{category.category_type}</div>
                    </div>
                    <Badge>{category.item_count ?? 0}</Badge>
                  </button>
                ))}
                {(categoriesQuery.data ?? []).length === 0 && (
                  <p className="px-3 py-2 text-sm text-zinc-500">No categories yet — import a price list above to get started.</p>
                )}
              </div>
            </Dialog>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(categoriesQuery.data ?? []).map((category) => (
                <div
                  key={category.id}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-sm ${
                    category.id === selectedCategoryId
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id === selectedCategoryId ? undefined : category.id)}
                    className="flex-1 text-left"
                  >
                    <div className="font-medium">{category.name}</div>
                    <div className="text-xs text-zinc-500">{category.category_type}</div>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <Badge>{category.item_count ?? 0}</Badge>
                    <select
                      value={category.picker_role ?? ''}
                      onChange={(e) =>
                        roleMutation.mutate({ categoryId: category.id, role: (e.target.value || null) as InventoryCategory['picker_role'] | null })
                      }
                      title="Planning picker role: which patch-row picker this category's items appear in"
                      className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-400"
                    >
                      <option value="">no picker</option>
                      <option value="cable">Cable</option>
                      <option value="stand">Stand</option>
                      <option value="truss">Truss</option>
                    </select>
                  </div>
                </div>
              ))}
              {(categoriesQuery.data ?? []).length === 0 && (
                <p className="text-sm text-zinc-500">No categories yet — import a price list above to get started.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{selectedCategory?.name ?? 'All inventory items'}</CardTitle>
          </CardHeader>
          <CardContent>
            {isMobile ? (
              <div className="space-y-1">
                {(itemsQuery.data ?? []).map((item) => (
                  <CondensedListRow
                    key={item.id}
                    title={item.name}
                    subtitle={`${item.category_name} · Qty ${item.quantity_available} · ${item.price_ex_vat.toFixed(2)} kr`}
                    trailing={
                      item.category_type === 'lighting' ? (
                        <button type="button" onClick={() => setModesItem(item)} className="text-zinc-400" title="DMX modes">
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                      ) : undefined
                    }
                  />
                ))}
                {(itemsQuery.data ?? []).length === 0 && <p className="px-1 py-2 text-sm text-zinc-500">No items in this category yet.</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price ex VAT</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itemsQuery.data ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-zinc-400">{item.description || '—'}</TableCell>
                        <TableCell>{item.quantity_available}</TableCell>
                        <TableCell>{item.price_ex_vat.toFixed(2)}</TableCell>
                        <TableCell>{item.category_name}</TableCell>
                        <TableCell>
                          {item.category_type === 'lighting' && (
                            <Button size="sm" variant="ghost" title="DMX modes" onClick={() => setModesItem(item)}>
                              <SlidersHorizontal className="mr-1 h-4 w-4" />Modes
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={modesItem !== null} onClose={() => setModesItem(null)} title={`DMX modes — ${modesItem?.name ?? ''}`}>
        {modesItem && <FixtureModeManager inventoryId={inventoryId} itemId={modesItem.id} />}
      </Dialog>
    </div>
  )
}
