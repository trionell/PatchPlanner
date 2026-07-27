import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Filter, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  createInventory,
  deleteInventory,
  duplicateInventory,
  listCategories,
  listItems,
  listMyInventories,
  renameInventory,
} from '../api/inventories'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { CategoriesDrawer, ImportDrawer } from '../components/inventory/InventoryDrawers'
import { OwnedGearManager } from '../components/OwnedGearManager'
import { useIsMobile } from '../hooks/useIsMobile'
import { CondensedListRow } from '../components/mobile/CondensedListRow'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { MicroLabel } from '../components/ui/Label'
import { PanelCols, PanelMain, PanelRail, PanelRailRow } from '../components/ui/PanelRail'
import { PatchPanel } from '../components/ui/PatchPanel'
import { Pill } from '../components/ui/SheetTable'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import type { Inventory, InventoryCategory } from '../types'

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
  // Which inventory is open lives in the URL, not in component state, so
  // an inventory can be linked to directly — an event's Overview sends you
  // to the actual catalog rather than to the list.
  const { inventoryId } = useParams()
  const navigate = useNavigate()
  const inventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories })

  const selectedId = inventoryId ? Number(inventoryId) : null
  const selected = inventoriesQuery.data?.find((inventory) => inventory.id === selectedId)

  if (selectedId !== null) {
    if (!inventoriesQuery.data) {
      // Don't flash the list on a deep link while the query is in flight.
      return <p className="text-sm text-zinc-400">Loading inventory…</p>
    }
    if (!selected) {
      // A stale bookmark, or an inventory belonging to someone else.
      return (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">That inventory doesn't exist, or isn't yours to manage.</p>
          <Button size="sm" variant="ghost" onClick={() => navigate('/inventories')}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to my inventories
          </Button>
        </div>
      )
    }
    return <InventoryDetail inventory={selected} onBack={() => navigate('/inventories')} />
  }
  return <InventoryList inventories={inventoriesQuery.data ?? []} onSelect={(id) => navigate(`/inventories/${id}`)} />
}

/**
 * The list of catalogs (Slice 29 FR-013).
 *
 * A card list, and it stays one — P1 exempts a list of genuinely independent
 * objects by name. What goes is the "Create a new inventory" *card*, which
 * becomes the page's one primary action, and what arrives is each catalog's
 * item count, so its size is visible before you open it.
 */
function InventoryList({ inventories, onSelect }: { inventories: Inventory[]; onSelect: (id: number) => void }) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventories'] })
  const onError = (mutationError: Error) => setError(mutationError.message)

  const create = useMutation({
    mutationFn: (name: string) => createInventory(name),
    onSuccess: async () => {
      setNewName('')
      setCreating(false)
      setError('')
      await invalidate()
    },
    onError,
  })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameInventory(id, name),
    onSuccess: invalidate,
    onError,
  })
  const duplicate = useMutation({ mutationFn: (id: number) => duplicateInventory(id), onSuccess: invalidate, onError })
  const remove = useMutation({ mutationFn: (id: number) => deleteInventory(id), onSuccess: invalidate, onError })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-zinc-400">
          Each inventory is its own independent equipment catalog. Bind one to an event when you create it, and reuse it
          across events.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New inventory
        </Button>
      </div>

      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}

      <div className="space-y-2">
        {inventories.map((inventory) => (
          <InventoryRow
            key={inventory.id}
            inventory={inventory}
            onSelect={() => onSelect(inventory.id)}
            onRename={(name) => rename.mutate({ id: inventory.id, name })}
            onDuplicate={() => duplicate.mutate(inventory.id)}
            onDelete={() => remove.mutate(inventory.id)}
          />
        ))}
        {inventories.length === 0 && (
          <p className="text-sm text-zinc-400">No inventories yet — create your first one to import a price list into.</p>
        )}
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="New inventory">
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <MicroLabel className="mb-1 block">Name</MicroLabel>
            <Input value={newName} placeholder="e.g. Backline" onChange={(event) => setNewName(event.target.value)} />
          </label>
          <Button disabled={!newName.trim() || create.isPending} onClick={() => create.mutate(newName.trim())}>
            Create
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function InventoryRow({
  inventory,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
}: {
  inventory: Inventory
  onSelect: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', inventory.id, undefined],
    queryFn: () => listItems(inventory.id),
  })
  const count = itemsQuery.data?.length

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-850 px-4 py-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <div className="font-medium text-zinc-100">{inventory.name}</div>
        <div className="truncate text-xs text-zinc-500">
          {count != null && `${count} items · `}
          {inventory.sourceFilename ? `imported from ${inventory.sourceFilename}` : 'no price list imported yet'}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          title="Rename"
          onClick={() => {
            const name = window.prompt('Rename inventory', inventory.name)
            if (name && name.trim() && name.trim() !== inventory.name) onRename(name.trim())
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="Delete"
          onClick={() => {
            if (window.confirm(`Delete "${inventory.name}"? This can't be undone.`)) onDelete()
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * One catalog, as a work panel (Slice 29 US1).
 *
 * It was three cards and a page header: a category card doing four jobs at once,
 * an item card with a permanently-open five-field form, and a 308-row
 * navigation-tier table. The categories are a column of the panel now — the
 * mirror of the stage plot's palette — doing exactly one job, and everything
 * else they were doing is in a drawer.
 */
function InventoryDetail({ inventory, onBack }: { inventory: Inventory; onBack: () => void }) {
  const inventoryId = inventory.id
  const isMobile = useIsMobile()
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [error, setError] = useState('')
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories', inventoryId],
    queryFn: () => listCategories(inventoryId),
  })
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', inventoryId, selectedCategoryId],
    queryFn: () => listItems(inventoryId, selectedCategoryId ? { categoryId: selectedCategoryId } : undefined),
  })
  const allItemsQuery = useQuery({
    queryKey: ['inventory-items', inventoryId, undefined],
    queryFn: () => listItems(inventoryId),
  })

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId)
  const items = itemsQuery.data ?? []

  if (isMobile) {
    return (
      <MobileInventoryDetail
        inventory={inventory}
        categories={categories}
        items={items}
        selectedCategory={selectedCategory}
        onBack={onBack}
        filterOpen={categoryFilterOpen}
        onFilterOpenChange={setCategoryFilterOpen}
        onSelectCategory={setSelectedCategoryId}
      />
    )
  }

  return (
    <>
      <PatchPanel
        bar={
          <>
            <Button size="xs" variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
            <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">{inventory.name}</span>

            <div className="relative min-w-[10rem] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                size="sm"
                className="pl-7"
                placeholder="Find an item…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <Button size="xs" variant="outline" onClick={() => setCategoriesOpen(true)}>
              Categories
            </Button>
            <Button size="xs" variant="outline" onClick={() => setImportOpen(true)}>
              Import
            </Button>

            <span className="flex-1" />

            <Button size="xs" onClick={() => setAdding(true)} disabled={categories.length === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Item
            </Button>
          </>
        }
      >
        {error && <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">{error}</p>}

        <PanelCols>
          <PanelRail className="max-h-[70vh]">
            <PanelRailRow
              label="All items"
              count={allItemsQuery.data?.length}
              selected={selectedCategoryId === undefined}
              onSelect={() => setSelectedCategoryId(undefined)}
            />
            {categories.map((category) => (
              <PanelRailRow
                key={category.id}
                label={category.name}
                qualifier={category.category_type}
                count={category.item_count ?? 0}
                selected={category.id === selectedCategoryId}
                onSelect={() => setSelectedCategoryId(category.id === selectedCategoryId ? undefined : category.id)}
              />
            ))}
            {categories.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-500">No categories yet — import a list, or add one.</p>
            )}
          </PanelRail>

          <PanelMain>
            <InventorySheet
              inventoryId={inventoryId}
              items={items}
              categories={categories}
              search={search}
              adding={adding}
              onAddingChange={setAdding}
              onError={setError}
            />
          </PanelMain>
        </PanelCols>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
          <Pill className="bg-emerald-500/15 text-emerald-300">
            {inventory.sourceFilename ? 'imported' : 'hand-built'}
          </Pill>
          <span className="font-mono tabular-nums text-zinc-200">{allItemsQuery.data?.length ?? 0} items</span>
          <span className="font-mono tabular-nums text-zinc-500">{categories.length} categories</span>
          {selectedCategory && (
            <span className="text-zinc-500">
              {items.length} in {selectedCategory.name}
            </span>
          )}
          {inventory.sourceFilename && <span className="text-zinc-500">from {inventory.sourceFilename}</span>}
        </div>
      </PatchPanel>

      <CategoriesDrawer
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        inventoryId={inventoryId}
        categories={categories}
        onError={setError}
        editable
      />
      <ImportDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        inventoryId={inventoryId}
        inventory={inventory}
        onError={setError}
        editable
      />
    </>
  )
}

/** The phone keeps its list-and-dialog shape — a rail is a desktop construction. */
function MobileInventoryDetail({
  inventory,
  categories,
  items,
  selectedCategory,
  onBack,
  filterOpen,
  onFilterOpenChange,
  onSelectCategory,
}: {
  inventory: Inventory
  categories: InventoryCategory[]
  items: { id: number; name: string; category_name?: string; quantity_available: number; price_ex_vat: number }[]
  selectedCategory?: InventoryCategory
  onBack: () => void
  filterOpen: boolean
  onFilterOpenChange: (open: boolean) => void
  onSelectCategory: (id: number | undefined) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back
        </Button>
        <h2 className="text-lg font-semibold text-zinc-100">{inventory.name}</h2>
      </div>
      <button
        type="button"
        onClick={() => onFilterOpenChange(true)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200"
      >
        <span className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-400" />
          {selectedCategory?.name ?? 'All categories'}
        </span>
        <Badge>{items.length}</Badge>
      </button>
      <Dialog open={filterOpen} onClose={() => onFilterOpenChange(false)} title="Filter by category">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              onSelectCategory(undefined)
              onFilterOpenChange(false)
            }}
            className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200"
          >
            All categories
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                onSelectCategory(category.id)
                onFilterOpenChange(false)
              }}
              className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200"
            >
              <span>{category.name}</span>
              <Badge>{category.item_count ?? 0}</Badge>
            </button>
          ))}
        </div>
      </Dialog>
      <div className="space-y-1">
        {items.map((item) => (
          <CondensedListRow
            key={item.id}
            title={item.name}
            subtitle={`${item.category_name ?? ''} · Qty ${item.quantity_available} · ${item.price_ex_vat.toFixed(2)} kr`}
          />
        ))}
        {items.length === 0 && <p className="px-1 py-2 text-sm text-zinc-500">No items in this category yet.</p>}
      </div>
    </div>
  )
}
