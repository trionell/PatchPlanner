import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2, Upload } from 'lucide-react'
import {
  createCategory,
  deleteCategory,
  importInventoryXlsx,
  inventoryTemplateUrl,
  updateCategory,
  updateCategoryPickerRole,
  type CategoryDraft,
} from '../../api/inventories'
import type { Inventory, InventoryCategory, InventoryImportResult } from '../../types'
import { Button } from '../ui/Button'
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
    <Drawer
      open={open}
      onClose={onClose}
      title="Categories"
      subtitle="How this catalog is divided, and which pickers it feeds"
      width="narrow"
      footer={
        <>
          A category's <b className="font-medium text-zinc-400">picker role</b> is what makes its items appear in a
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
                  onClick={() => {
                    if (window.confirm(`Delete the category "${category.name}"?`)) remove.mutate(category.id)
                  }}
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
      width="narrow"
      footer={
        <>
          An import <b className="font-medium text-zinc-400">replaces</b> the imported part of the catalog. Items you
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
