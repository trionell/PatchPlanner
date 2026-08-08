import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2, Upload } from 'lucide-react'
import {
  createCategory,
  createRentFactor,
  deleteCategory,
  deleteRentFactor,
  getInventoryPricing,
  importInventoryXlsx,
  inventoryTemplateUrl,
  updateCategory,
  updateCategoryPickerRole,
  updateInventoryPricing,
  updateRentFactor,
  type CategoryDraft,
} from '../../api/inventories'
import type { Inventory, InventoryCategory, InventoryImportResult, InventoryPricing } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Drawer } from '../ui/Drawer'
import { DrawerSection, GearCard, GearTop } from '../ui/GearList'
import { Input } from '../ui/Input'
import { MicroLabel } from '../ui/Label'
import { Select } from '../ui/Select'

/**
 * Everything about a catalog that is not an item (Slice 29 US2).
 *
 * Both of these used to live *in the layout*: category management stacked into
 * the corner of every tile of the filter list, and import as a button in the page
 * header whose result appeared as a bare paragraph that shifted everything below
 * it down.
 *
 * A category is **declared once and referenced by every item**, which is the
 * drawer rule stated exactly. Import is the one operation here with something to
 * explain — the server detects the file's format, and that explanation was a
 * `title` tooltip.
 *
 * Both open **over** the sheet, so its layout never shifts.
 */

const CATEGORY_TYPES: InventoryCategory['category_type'][] = ['audio', 'lighting', 'rigging', 'video', 'misc']
const PICKER_ROLES = [
  { value: '', label: 'no picker' },
  { value: 'cable', label: 'Cable' },
  { value: 'stand', label: 'Stand' },
  { value: 'truss', label: 'Truss' },
  { value: 'mic', label: 'Mic' },
]

interface CategoriesDrawerProps {
  open: boolean
  onClose: () => void
  inventoryId: number
  categories: InventoryCategory[]
  onError: (message: string) => void
  /** Omitted entirely for someone who does not own this inventory (P7). */
  editable: boolean
}

export function CategoriesDrawer({ open, onClose, inventoryId, categories, onError, editable }: CategoriesDrawerProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<CategoryDraft>({ name: '', category_type: 'audio' })
  /* The category, never a boolean — one confirm serves the whole list. */
  const [pendingCategory, setPendingCategory] = useState<InventoryCategory | null>(null)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inventory-categories', inventoryId] })
    await queryClient.invalidateQueries({ queryKey: ['inventory-items', inventoryId] })
  }
  const fail = (error: Error) => onError(error.message)

  const rename = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<CategoryDraft> }) => updateCategory(inventoryId, id, patch),
    onSuccess: invalidate,
    onError: fail,
  })
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: InventoryCategory['picker_role'] | null }) =>
      updateCategoryPickerRole(inventoryId, id, role ?? null),
    onSuccess: invalidate,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteCategory(inventoryId, id),
    onSuccess: invalidate,
    onError: fail,
  })
  const add = useMutation({
    mutationFn: () => createCategory(inventoryId, draft),
    onSuccess: async () => {
      setDraft({ name: '', category_type: 'audio' })
      await invalidate()
    },
    onError: fail,
  })

  return (
    <>
    <Drawer
      open={open}
      onClose={onClose}
      title="Categories"
      subtitle="How this catalog is divided, and which pickers it feeds"
      noteId="catalog-categories"
      width="narrow"
      /* An explanation of what a field here does — read once, and a fifth of a
         phone's sheet ever after if it stays in the footer (components.md §4). */
      info={
        <>
          A category's <b className="font-medium text-zinc-300">picker role</b> is what makes its items appear in a
          patch row's cable, stand or truss picker. Leave it unset for equipment chosen some other way.
        </>
      }
    >
      <DrawerSection label="Categories" count={categories.length}>
        {categories.length === 0 && <p className="text-xs text-zinc-500">No categories yet.</p>}
        {categories.map((category) => (
          <GearCard key={category.id}>
            <GearTop
              name={category.name}
              actions={
                <span className="font-mono text-[10px] tabular-nums text-zinc-500">{category.item_count ?? 0}</span>
              }
            />
            {editable ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  size="sm"
                  className="min-w-28 flex-1"
                  defaultValue={category.name}
                  key={`${category.id}-${category.name}`}
                  onBlur={(event) => {
                    const name = event.target.value.trim()
                    if (name && name !== category.name) rename.mutate({ id: category.id, patch: { name } })
                  }}
                />
                <Select
                  size="sm"
                  className="w-24"
                  value={category.category_type}
                  onChange={(event) =>
                    rename.mutate({
                      id: category.id,
                      patch: { category_type: event.target.value as InventoryCategory['category_type'] },
                    })
                  }
                >
                  {CATEGORY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
                <Select
                  size="sm"
                  className="w-24"
                  value={category.picker_role ?? ''}
                  onChange={(event) =>
                    setRole.mutate({
                      id: category.id,
                      role: (event.target.value || null) as InventoryCategory['picker_role'] | null,
                    })
                  }
                >
                  {PICKER_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  title="Delete category"
                  onClick={() => setPendingCategory(category)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                <span>{category.category_type}</span>
                <span>·</span>
                <span>{category.picker_role ? `${category.picker_role} picker` : 'no picker'}</span>
              </div>
            )}
          </GearCard>
        ))}

        {editable && (
          <div className="flex items-end gap-1.5 border-t border-zinc-800 pt-2.5">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <MicroLabel>New category</MicroLabel>
              <Input
                size="sm"
                value={draft.name}
                placeholder="Moving lights"
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <Select
              size="sm"
              className="w-24"
              value={draft.category_type}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, category_type: event.target.value as InventoryCategory['category_type'] }))
              }
            >
              {CATEGORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <Button size="xs" disabled={!draft.name.trim() || add.isPending} onClick={() => add.mutate()}>
              Add
            </Button>
          </div>
        )}
      </DrawerSection>
    </Drawer>

    {/* Sibling, after the drawer, and this is the site the rule matters most on:
        Drawer and Dialog are both z-50, so a confirm inside the drawer's scrolling
        body renders under it. */}
    <ConfirmDialog
      open={pendingCategory != null}
      title="Delete category"
      onCancel={() => setPendingCategory(null)}
      onConfirm={() => {
        if (pendingCategory) remove.mutate(pendingCategory.id)
        setPendingCategory(null)
      }}
    >
      {pendingCategory && (
        <>
          The category <span className="text-zinc-200">{pendingCategory.name}</span> is removed from this catalog.
        </>
      )}
    </ConfirmDialog>
    </>
  )
}

interface ImportDrawerProps {
  open: boolean
  onClose: () => void
  inventoryId: number
  inventory: Inventory
  onError: (message: string) => void
  editable: boolean
}

export function ImportDrawer({ open, onClose, inventoryId, inventory, onError, editable }: ImportDrawerProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<string>('')

  const importFile = useMutation({
    mutationFn: (file: File) => importInventoryXlsx(inventoryId, file),
    onSuccess: async (imported: InventoryImportResult) => {
      // Naming the detected format is the point: the user confirms the
      // auto-detection read their file the way they expected.
      const detected =
        imported.format === 'll' ? ' from the LL price list' : imported.format === 'generic' ? ' from the generic list' : ''
      const warnings = imported.warnings?.length ? ` ${imported.warnings.join(' ')}` : ''
      setResult(`Imported ${imported.categories_imported} categories and ${imported.items_imported} items${detected}.${warnings}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-categories', inventoryId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-items', inventoryId] }),
        queryClient.invalidateQueries({ queryKey: ['inventories'] }),
      ])
    },
    onError: (error: Error) => {
      setResult('')
      onError(error.message)
    },
  })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Import"
      subtitle="Fill this catalog from a spreadsheet"
      noteId="catalog-import"
      width="narrow"
      /* What the drawer's own action does — `info`, not `footer`. */
      info={
        <>
          An import <b className="font-medium text-zinc-300">replaces</b> the imported part of the catalog. Items you
          added by hand are left alone.
        </>
      }
    >
      <DrawerSection label="This catalog">
        <GearCard>
          <GearTop name={inventory.name} />
          <div className="font-mono text-[10px] text-zinc-500">
            {inventory.sourceFilename ? `from ${inventory.sourceFilename}` : 'no price list imported yet'}
          </div>
        </GearCard>
      </DrawerSection>

      <DrawerSection label="Formats">
        <p className="text-xs leading-relaxed text-zinc-400">
          Two shapes are understood and the server tells them apart on its own: an{' '}
          <b className="font-medium text-zinc-300">LL price list</b>, which additionally earns the matching
          <code className="mx-1 rounded bg-zinc-800 px-1 font-mono text-[11px]">LL.xlsx</code>
          export on the rental order, and a <b className="font-medium text-zinc-300">generic list</b> — anything with a
          name, a quantity and a price.
        </p>
        <Button size="xs" variant="outline" onClick={() => window.location.assign(inventoryTemplateUrl())}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Blank template (.xlsx)
        </Button>
      </DrawerSection>

      {editable && (
        <DrawerSection label="Import a file">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) importFile.mutate(file)
              event.target.value = ''
            }}
          />
          <Button size="xs" disabled={importFile.isPending} onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {importFile.isPending ? 'Importing…' : 'Choose a file'}
          </Button>
          {/* The result lands here rather than above the layout, which is what
              stopped the page jumping when an import finished (FR-017). */}
          {result && (
            <p className="rounded-[5px] border border-emerald-500/30 bg-emerald-500/[0.06] px-2.5 py-2 text-xs text-emerald-300">
              {result}
            </p>
          )}
        </DrawerSection>
      )}
    </Drawer>
  )
}

interface PricingDrawerProps {
  open: boolean
  onClose: () => void
  inventoryId: number
  onError: (message: string) => void
  editable: boolean
}

/**
 * What this supplier charges for a longer hire (Slice 31).
 *
 * A rate card is **declared once and referenced by every event** bound to the
 * catalog, which is patterns §3's rule stated exactly — so it is a drawer, and
 * its interior is `ui/GearList` at the work tier like its two siblings.
 *
 * The card is edited **row by row**, on blur, like every other field in the
 * application. That is also why the catalog's own two terms are a separate
 * `PUT`: a drawer mid-edit cannot post a stale copy of the whole curve over a
 * row that changed under it.
 */
export function CatalogPricingDrawer({ open, onClose, inventoryId, onError, editable }: PricingDrawerProps) {
  const queryClient = useQueryClient()
  const [draftDays, setDraftDays] = useState('')
  const [draftFactor, setDraftFactor] = useState('')

  const { data } = useQuery({
    queryKey: ['inventory-pricing', inventoryId],
    queryFn: () => getInventoryPricing(inventoryId),
    enabled: open,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inventory-pricing', inventoryId] })
    // Every order priced against this catalog now says something different.
    await queryClient.invalidateQueries({ queryKey: ['rental-summary'] })
  }
  const fail = (error: Error) => onError(error.message)

  const setTerms = useMutation({
    mutationFn: (patch: Partial<Omit<InventoryPricing, 'factors'>>) =>
      updateInventoryPricing(inventoryId, {
        charged_days: patch.charged_days ?? data?.charged_days ?? 'onsite',
        vat_percent: patch.vat_percent ?? data?.vat_percent ?? 25,
      }),
    onSuccess: invalidate,
    onError: fail,
  })
  const addRow = useMutation({
    mutationFn: () => createRentFactor(inventoryId, Number(draftDays), Number(draftFactor)),
    onSuccess: async () => {
      setDraftDays('')
      setDraftFactor('')
      await invalidate()
    },
    onError: fail,
  })
  const editRow = useMutation({
    mutationFn: ({ id, days, factor }: { id: number; days: number; factor: number }) =>
      updateRentFactor(inventoryId, id, days, factor),
    onSuccess: invalidate,
    onError: fail,
  })
  const removeRow = useMutation({
    mutationFn: (id: number) => deleteRentFactor(inventoryId, id),
    onSuccess: invalidate,
    onError: fail,
  })

  const factors = data?.factors ?? []
  const readyToAdd = Number(draftDays) >= 1 && Number(draftFactor) > 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Pricing"
      subtitle="What this supplier charges for a longer hire"
      /* The other half of the pair — `event/PricingDrawer` is also titled
         *Pricing*, and the two notes were one key until D5. */
      noteId="catalog-pricing"
      width="narrow"
      /* What this drawer's contents do when an import arrives — an explanation
         read once, so `info` rather than `footer` (components.md §4). */
      info={
        <>
          An import carrying a factor table <b className="font-medium text-zinc-300">replaces every row here</b>. One
          that carries none leaves them alone. A hire longer than one row but shorter than the next is charged at the
          row <b className="font-medium text-zinc-300">below</b> it — 17 days on a card that jumps 14 to 21 is charged
          at the 14-day factor. Past the last row, the last row holds.
        </>
      }
    >
      <DrawerSection label="Charged days">
        <GearCard>
          {editable ? (
            <Select
              size="sm"
              value={data?.charged_days ?? 'onsite'}
              onChange={(event) => setTerms.mutate({ charged_days: event.target.value as InventoryPricing['charged_days'] })}
            >
              <option value="onsite">All on-site days (load-in → load-out)</option>
              <option value="show">Show days only (start → end)</option>
            </Select>
          ) : (
            <div className="font-mono text-[10px] text-zinc-500">{data?.charged_days ?? 'onsite'}</div>
          )}
          <div className="font-mono text-[10px] text-zinc-500">
            what this supplier charges for · an event may still depart from it
          </div>
        </GearCard>
      </DrawerSection>

      <DrawerSection label="VAT">
        <GearCard>
          {/* Hint left, field right — the same direction the event drawer's
              ledger reads, and on a phone the edge the thumb is already on. */}
          <div className="flex items-end justify-between gap-3">
            <span className="pb-1.5 text-xs leading-snug text-zinc-500">
              The rate this supplier charges, as a percentage.
            </span>
            {editable ? (
              <label className="flex w-24 shrink-0 flex-col gap-1">
                <MicroLabel>VAT %</MicroLabel>
                <Input
                  size="sm"
                  type="number"
                  min={0}
                  key={`vat-${data?.vat_percent}`}
                  defaultValue={data?.vat_percent ?? 25}
                  onBlur={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value) && value >= 0 && value !== data?.vat_percent) {
                      setTerms.mutate({ vat_percent: value })
                    }
                  }}
                />
              </label>
            ) : (
              <span className="font-mono text-xs text-zinc-300">{data?.vat_percent ?? 25}%</span>
            )}
          </div>
        </GearCard>
      </DrawerSection>

      <DrawerSection label="Rent factor" count={factors.length}>
        {factors.length === 0 && (
          <p className="text-xs text-zinc-500">
            No rate card — every hire on this catalog prices at ×1.00, however long it is.
          </p>
        )}
        {factors.map((factor) => (
          <GearCard key={factor.id}>
            <div className="flex flex-wrap items-center gap-1.5">
              <MicroLabel>days</MicroLabel>
              <Input
                size="sm"
                type="number"
                min={1}
                className="w-16"
                key={`days-${factor.id}-${factor.days}`}
                defaultValue={factor.days}
                disabled={!editable}
                onBlur={(event) => {
                  const days = Number(event.target.value)
                  if (days >= 1 && days !== factor.days) editRow.mutate({ id: factor.id, days, factor: factor.factor })
                }}
              />
              <MicroLabel>×</MicroLabel>
              <Input
                size="sm"
                type="number"
                min={0}
                step="0.05"
                className="w-20"
                key={`factor-${factor.id}-${factor.factor}`}
                defaultValue={factor.factor}
                disabled={!editable}
                onBlur={(event) => {
                  const value = Number(event.target.value)
                  if (value > 0 && value !== factor.factor) editRow.mutate({ id: factor.id, days: factor.days, factor: value })
                }}
              />
              {editable && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  title="Delete this row"
                  onClick={() => removeRow.mutate(factor.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </GearCard>
        ))}

        {editable && (
          <div className="flex items-end gap-1.5 border-t border-zinc-800 pt-2.5">
            <label className="flex w-20 flex-col gap-1">
              <MicroLabel>Days</MicroLabel>
              <Input size="sm" type="number" min={1} placeholder="45" value={draftDays} onChange={(e) => setDraftDays(e.target.value)} />
            </label>
            <label className="flex w-24 flex-col gap-1">
              <MicroLabel>Factor</MicroLabel>
              <Input
                size="sm"
                type="number"
                min={0}
                step="0.05"
                placeholder="8.00"
                value={draftFactor}
                onChange={(e) => setDraftFactor(e.target.value)}
              />
            </label>
            <Button size="xs" disabled={!readyToAdd || addRow.isPending} onClick={() => addRow.mutate()}>
              Add
            </Button>
          </div>
        )}
      </DrawerSection>

    </Drawer>
  )
}
