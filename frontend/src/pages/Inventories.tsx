import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Filter, MoreHorizontal, Plus, Search } from 'lucide-react'
import { inventoryTemplateUrl, listCategories, listItems, listMyInventories } from '../api/inventories'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { CategoriesDrawer, ImportDrawer } from '../components/inventory/InventoryDrawers'
import { InventoryDrawer } from '../components/inventory/InventoryDrawer'
import { OwnedGearManager } from '../components/OwnedGearManager'
import { useIsMobile } from '../hooks/useIsMobile'
import { summariseInventories } from '../lib/inventoryList'
import { CondensedListRow } from '../components/mobile/CondensedListRow'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { PanelCols, PanelMain, PanelRail, PanelRailRow } from '../components/ui/PanelRail'
import { PatchPanel } from '../components/ui/PatchPanel'
import { Pill } from '../components/ui/SheetTable'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import type { Inventory, InventoryCategory } from '../types'

export function InventoriesPage() {
  return (
    <Tabs defaultValue="inventories">
      <TabList>
        {/* Named by what separates them: one is priced gear you hire in, the
            other is gear you already own. "My Inventories" said neither. */}
        <Tab value="inventories">Rental catalogs</Tab>
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
      return <p className="text-sm text-zinc-400">Loading catalog…</p>
    }
    if (!selected) {
      // A stale bookmark, or an inventory belonging to someone else.
      return (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">That catalog doesn't exist, or isn't yours to manage.</p>
          <Button size="sm" variant="ghost" onClick={() => navigate('/inventories')}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to my catalogs
          </Button>
        </div>
      )
    }
    return <InventoryDetail inventory={selected} onBack={() => navigate('/inventories')} />
  }
  return (
    <InventoryList
      inventories={inventoriesQuery.data}
      loading={inventoriesQuery.isLoading}
      onSelect={(id) => navigate(`/inventories/${id}`)}
    />
  )
}

/**
 * The catalogs, as one panel (Slice 32).
 *
 * This was the last card list in the application. `design/audit.md` A6
 * exempted it under P1 — a list of genuinely independent objects — and that
 * settled the *frame* without asking what the page is *for*. It is for
 * picking a catalog, and for knowing which of them your shows run on, which
 * is the column that had never been shown: `DeleteInventory` has counted the
 * events bound to a catalog since Slice 16 and spent the number entirely on
 * refusing after the fact.
 *
 * Navigation tier inside a panel frame, which is what Events does and is the
 * honest answer to P2's question — nobody scans five catalogs
 * cross-referencing as they go.
 */
function InventoryList({
  inventories,
  loading,
  onSelect,
}: {
  inventories: Inventory[] | undefined
  loading: boolean
  onSelect: (id: number) => void
}) {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [managing, setManaging] = useState<Inventory | null>(null)
  const [error, setError] = useState('')

  const summary = useMemo(() => summariseInventories(inventories, search), [inventories, search])
  const hasAny = summary.total > 0

  // Mounted only while open, so each opening starts from the catalog it was
  // opened on rather than from whatever the last one left behind.
  const drawers = (
    <>
      {creating && <InventoryDrawer open onClose={() => setCreating(false)} onError={setError} />}
      {managing && (
        <InventoryDrawer open onClose={() => setManaging(null)} inventory={managing} onError={setError} />
      )}
    </>
  )

  if (isMobile) {
    return (
      <MobileInventoryList
        summary={summary}
        loading={loading}
        error={error}
        search={search}
        onSearch={setSearch}
        onSelect={onSelect}
        onCreate={() => setCreating(true)}
        drawers={drawers}
      />
    )
  }

  return (
    <>
      <PatchPanel
        bar={
          <>
            <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Rental catalogs</span>

            {/* Absent on an empty account: a control for narrowing nothing is
                a claim that there is something to narrow. */}
            {hasAny && (
              <div className="relative min-w-[10rem] max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <Input
                  size="sm"
                  className="pl-7"
                  placeholder="Name or price list…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            )}

            <span className="flex-1" />

            {/* `xs`, matching Owned gear's + Item and the catalog panel's
                own bar. A panel's bar is chrome and takes the page's tier, not
                its own content's: two + buttons one step apart in the same
                position on sibling tabs read as an accident. The tier
                difference belongs in the rows (patterns §1). */}
            <Button size="xs" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New catalog
            </Button>
          </>
        }
      >
        {error && <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">{error}</p>}

        {loading ? (
          <p className="px-5 py-8 text-sm text-zinc-400">Loading catalogs…</p>
        ) : !hasAny ? (
          <EmptyAccount onCreate={() => setCreating(true)} />
        ) : summary.visible.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-400">No catalog matches “{search.trim()}”.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-950/60 text-zinc-400">
                <th className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-medium">Catalog</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-right text-xs font-medium">Items</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-right text-xs font-medium">Categories</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-right text-xs font-medium">Used on</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-medium">Source</th>
                <th className="border-b border-zinc-800 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {summary.visible.map((inventory) => (
                <InventoryRow
                  key={inventory.id}
                  inventory={inventory}
                  onSelect={() => onSelect(inventory.id)}
                  onManage={() => setManaging(inventory)}
                />
              ))}
            </tbody>
          </table>
        )}

        {hasAny && !loading && <ListStrip summary={summary} searching={search.trim().length > 0} />}
      </PatchPanel>

      {drawers}
    </>
  )
}

function InventoryRow({
  inventory,
  onSelect,
  onManage,
}: {
  inventory: Inventory
  onSelect: () => void
  onManage: () => void
}) {
  const items = inventory.itemCount ?? 0
  const categories = inventory.categoryCount ?? 0
  const events = inventory.eventCount ?? 0

  return (
    <tr className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-900">
      {/* The name owns the row's click. The manage control is a sibling, not a
          button nested inside a button. */}
      <td className="p-0">
        <button type="button" onClick={onSelect} className="w-full px-3 py-2.5 text-left font-medium text-zinc-100">
          {inventory.name}
        </button>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-200">{items}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-500">{categories}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-200">
        {events === 0 ? (
          // Empty and expected: nothing has been planned on it, which is a
          // fact rather than a measurement of zero.
          <span className="text-zinc-600">—</span>
        ) : (
          `${events} ${events === 1 ? 'event' : 'events'}`
        )}
      </td>
      <td className="px-3 py-2.5 text-zinc-500">
        {inventory.sourceFilename ? (
          <>
            <span className="text-zinc-400">{formatLabel(inventory)}</span> · {inventory.sourceFilename}
          </>
        ) : (
          'hand-built'
        )}
      </td>
      <td className="px-2 py-2.5 text-right">
        <Button size="sm" variant="ghost" aria-label={`Manage ${inventory.name}`} onClick={onManage}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  )
}

/** The panel's verdict, as whole mono phrases — the shape Events' strip has. */
function ListStrip({
  summary,
  searching,
}: {
  summary: ReturnType<typeof summariseInventories>
  searching: boolean
}) {
  const catalogs = searching
    ? `${summary.visible.length} of ${summary.total} catalogs`
    : `${summary.total} ${summary.total === 1 ? 'catalog' : 'catalogs'}`
  const parts = [
    catalogs,
    `${summary.items} items`,
    `${summary.events} ${summary.events === 1 ? 'event runs' : 'events run'} on them`,
    summary.unused > 0 ? `${summary.unused} unused` : undefined,
  ].filter((part): part is string => Boolean(part))

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-3">
          {index > 0 && <span className="text-zinc-700">·</span>}
          <span className="font-mono tabular-nums">{part}</span>
        </span>
      ))}
    </div>
  )
}

function EmptyAccount({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <p className="max-w-[46ch] text-sm text-zinc-400">
        You have no catalogs yet. Create one, then import a price list into it — or start the list by hand.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New catalog
        </Button>
        {/* A download is a navigation, the way the import drawer's copy of
            this control already treats it. */}
        <Button variant="outline" onClick={() => window.location.assign(inventoryTemplateUrl())}>
          <Download className="mr-1.5 h-4 w-4" />
          Download the template
        </Button>
      </div>
    </div>
  )
}

/** The phone: the same four facts, stacked, at touch height (patterns §7). */
function MobileInventoryList({
  summary,
  loading,
  error,
  search,
  onSearch,
  onSelect,
  onCreate,
  drawers,
}: {
  summary: ReturnType<typeof summariseInventories>
  loading: boolean
  error: string
  search: string
  onSearch: (value: string) => void
  onSelect: (id: number) => void
  onCreate: () => void
  drawers: React.ReactNode
}) {
  const hasAny = summary.total > 0
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Rental catalogs</h2>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New
        </Button>
      </div>

      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}

      {hasAny && (
        <Input placeholder="Name or price list…" value={search} onChange={(event) => onSearch(event.target.value)} />
      )}

      {loading && <p className="text-sm text-zinc-400">Loading catalogs…</p>}
      {!loading && !hasAny && (
        <p className="text-sm text-zinc-400">
          You have no catalogs yet. Create one, then import a price list into it.
        </p>
      )}
      {!loading && hasAny && summary.visible.length === 0 && (
        <p className="text-sm text-zinc-400">No catalog matches “{search.trim()}”.</p>
      )}

      <div className="space-y-1">
        {summary.visible.map((inventory) => {
          const events = inventory.eventCount ?? 0
          return (
            <CondensedListRow
              key={inventory.id}
              title={inventory.name}
              subtitle={`${inventory.itemCount ?? 0} items · ${inventory.categoryCount ?? 0} categories · ${
                inventory.sourceFilename ? formatLabel(inventory) : 'hand-built'
              }`}
              trailing={
                <Badge className={events === 0 ? 'bg-zinc-700 text-zinc-300' : 'bg-amber-500/15 text-amber-300'}>
                  {events === 0 ? 'unused' : `${events} ${events === 1 ? 'event' : 'events'}`}
                </Badge>
              }
              onClick={() => onSelect(inventory.id)}
            />
          )
        })}
      </div>

      {drawers}
    </div>
  )
}

/** The format is data, not a vocabulary: an unknown one reads as hand-built. */
function formatLabel(inventory: Inventory): string {
  if (inventory.sourceFormat === 'll') return 'LL price list'
  if (inventory.sourceFormat === 'generic') return 'generic'
  return 'hand-built'
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
  const [manageOpen, setManageOpen] = useState(false)
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

  // The same drawer the list opens, so a rename you think of while looking at
  // 308 items does not send you back first.
  const manageDrawer = manageOpen && (
    <InventoryDrawer
      open
      onClose={() => setManageOpen(false)}
      inventory={inventory}
      onError={setError}
      onDeleted={onBack}
    />
  )

  if (isMobile) {
    return (
      <>
        <MobileInventoryDetail
          inventory={inventory}
          categories={categories}
          items={items}
          selectedCategory={selectedCategory}
          onBack={onBack}
          onManage={() => setManageOpen(true)}
          filterOpen={categoryFilterOpen}
          onFilterOpenChange={setCategoryFilterOpen}
          onSelectCategory={setSelectedCategoryId}
        />
        {manageDrawer}
      </>
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
            <Button size="xs" variant="outline" onClick={() => setManageOpen(true)}>
              Manage
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
          <PanelRail>
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
      {manageDrawer}
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
  onManage,
  filterOpen,
  onFilterOpenChange,
  onSelectCategory,
}: {
  inventory: Inventory
  categories: InventoryCategory[]
  items: { id: number; name: string; category_name?: string; quantity_available: number; price_ex_vat: number }[]
  selectedCategory?: InventoryCategory
  onBack: () => void
  onManage: () => void
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
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-zinc-100">{inventory.name}</h2>
        <Button size="sm" variant="outline" onClick={onManage}>
          Manage
        </Button>
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
