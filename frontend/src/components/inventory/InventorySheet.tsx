import { Fragment, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createItem, deleteItem, listFixtureModes, updateItem, type ItemDraft } from '../../api/inventories'
import { useRowEditor } from '../../hooks/useRowEditor'
import { matchesSearch } from '../../lib/patchSearch'
import type { InventoryCategory, InventoryItem } from '../../types'
import { FixtureModeManager } from '../FixtureModeManager'
import { RowEditor } from '../event/RowEditor'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'
import { useQuery } from '@tanstack/react-query'

/**
 * The inventory catalog, as a sheet (Slice 29 US1).
 *
 * 308 items in the sample price list, rendered at `px-3 py-3` on the navigation
 * tier — the largest table in the application by row count, and by P2's question
 * unambiguously a work surface: it is the list the whole rental order is derived
 * from.
 *
 * The DMX modes dialog is gone. A mode belongs to an item, and opening a dialog
 * *from a row* to edit part of that row is the pattern this convergence has been
 * removing since Slice 27 deleted Lighting's two. It lives in the editor's
 * `notice` slot now, and the sheet gained a `Modes` column so which items carry
 * modes is visible without opening anything — which used to cost one click each.
 */

const COLUMNS = ['Item', 'Description', 'Category', 'Qty', 'Price', 'Modes']

const EMPTY: ItemDraft = { category_id: 0, name: '', description: '', quantity_available: 0, price_ex_vat: 0 }

interface InventorySheetProps {
  inventoryId: number
  items: InventoryItem[]
  categories: InventoryCategory[]
  search?: string
  adding?: boolean
  onAddingChange?: (adding: boolean) => void
  onError?: (message: string) => void
  readOnly?: boolean
}

export function InventorySheet({
  inventoryId,
  items,
  categories,
  search = '',
  adding = false,
  onAddingChange,
  onError,
  readOnly = false,
}: InventorySheetProps) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inventory-categories', inventoryId] })
    await queryClient.invalidateQueries({ queryKey: ['inventory-items', inventoryId] })
  }
  const fail = (error: Error) => onError?.(error.message)

  const save = useMutation({
    mutationFn: ({ id, draft }: { id: number; draft: Partial<ItemDraft> }) => updateItem(inventoryId, id, draft),
    onSuccess: invalidate,
    onError: fail,
  })
  const create = useMutation({
    mutationFn: (draft: ItemDraft) => createItem(inventoryId, draft),
    onSuccess: invalidate,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteItem(inventoryId, id),
    onSuccess: invalidate,
    onError: fail,
  })

  const visible = items.filter((item) => matchesSearch(search, item.name, item.description, item.category_name))

  const editor = useRowEditor<InventoryItem, ItemDraft>({
    rows: visible,
    idOf: (item) => item.id,
    draftOf: (item) => ({
      category_id: item.category_id,
      name: item.name,
      description: item.description ?? '',
      quantity_available: item.quantity_available,
      price_ex_vat: item.price_ex_vat,
    }),
    persist: (item, draft) => {
      const unchanged =
        draft.category_id === item.category_id &&
        draft.name === item.name &&
        draft.description === (item.description ?? '') &&
        draft.quantity_available === item.quantity_available &&
        draft.price_ex_vat === item.price_ex_vat
      if (unchanged) return
      save.mutate({ id: item.id, draft })
    },
  })

  return (
    <div className="overflow-x-auto">
      <SheetTable>
        <SheetHead>
          <tr>
            {COLUMNS.map((column) => (
              <SheetHeadCell key={column}>{column}</SheetHeadCell>
            ))}
          </tr>
        </SheetHead>
        <SheetBody>
          {visible.map((item, index) => {
            const open = editor.openId === item.id
            return (
              <Fragment key={item.id}>
                <SheetRow
                  striped={index % 2 === 1}
                  open={open}
                  className={readOnly ? undefined : 'cursor-pointer'}
                  onClick={readOnly ? undefined : () => editor.openRow(item)}
                >
                  <SheetCell className="whitespace-nowrap text-zinc-100">
                    {item.name}
                    {item.is_manual && (
                      <span
                        className="ml-1.5 rounded-sm bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400"
                        title="Added by hand — an import leaves it alone"
                      >
                        manual
                      </span>
                    )}
                  </SheetCell>
                  <SheetCell className="max-w-64 truncate text-zinc-500">{item.description || <Dash />}</SheetCell>
                  <SheetCell className="text-zinc-500">{item.category_name || <Dash />}</SheetCell>
                  <NumCell>{item.quantity_available}</NumCell>
                  <NumCell>{item.price_ex_vat.toFixed(2)}</NumCell>
                  <ModesCell inventoryId={inventoryId} item={item} />
                </SheetRow>

                {open && editor.draft && (
                  <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                    <td colSpan={COLUMNS.length} className="px-2 pb-2">
                      <RowEditor
                        saveLabel="Save item"
                        onSave={editor.save}
                        onCancel={editor.close}
                        onKeyDown={editor.onKeyDown}
                        onDelete={() => {
                          if (window.confirm(`Delete "${item.name}" from this inventory?`)) {
                            remove.mutate(item.id)
                            editor.close()
                          }
                        }}
                        notice={
                          // A mode belongs to an item, so it is edited with the
                          // item — never in a dialog opened from its own row.
                          item.category_type === 'lighting' ? (
                            <FixtureModeManager inventoryId={inventoryId} itemId={item.id} />
                          ) : undefined
                        }
                      >
                        <ItemFields draft={editor.draft} setDraft={editor.setDraft} categories={categories} />
                      </RowEditor>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}

          {visible.length === 0 && (
            <tr>
              <SheetCell colSpan={COLUMNS.length} className="text-zinc-500">
                {items.length === 0
                  ? 'Nothing in this catalog yet — import a price list, or add an item.'
                  : 'No item matches.'}
              </SheetCell>
            </tr>
          )}

          {adding && !readOnly && (
            <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
              <td colSpan={COLUMNS.length} className="px-2 py-2">
                <AddItem
                  categories={categories}
                  pending={create.isPending}
                  onCancel={() => onAddingChange?.(false)}
                  onSave={(draft) => create.mutate(draft, { onSuccess: () => onAddingChange?.(false) })}
                />
              </td>
            </tr>
          )}
        </SheetBody>
      </SheetTable>
    </div>
  )
}

function Dash() {
  return <span className="text-zinc-600">—</span>
}

/** How many DMX modes a lighting item carries — one click each, before this column. */
function ModesCell({ inventoryId, item }: { inventoryId: number; item: InventoryItem }) {
  const isLighting = item.category_type === 'lighting'
  const modesQuery = useQuery({
    queryKey: ['fixture-modes', item.id],
    queryFn: () => listFixtureModes(inventoryId, item.id),
    enabled: isLighting,
  })
  if (!isLighting) {
    return (
      <NumCell>
        <Dash />
      </NumCell>
    )
  }
  const count = modesQuery.data?.length
  return <NumCell>{count == null ? <span className="text-zinc-600">·</span> : count || <Dash />}</NumCell>
}

function ItemFields({
  draft,
  setDraft,
  categories,
}: {
  draft: ItemDraft
  setDraft: (update: (draft: ItemDraft | null) => ItemDraft | null) => void
  categories: InventoryCategory[]
}) {
  const patch = (change: Partial<ItemDraft>) => setDraft((prev) => (prev ? { ...prev, ...change } : prev))
  return (
    <>
      <FieldStack label="Category" width="short">
        <Select size="sm" value={draft.category_id || ''} onChange={(e) => patch({ category_id: Number(e.target.value) })}>
          <option value="">Select…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </FieldStack>
      <FieldStack label="Name" width="grow">
        <Input size="sm" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
      </FieldStack>
      <FieldStack label="Description" width="grow">
        <Input size="sm" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="optional" />
      </FieldStack>
      <FieldStack label="Qty" width="count">
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.quantity_available}
          onChange={(e) => patch({ quantity_available: Math.max(0, Number(e.target.value)) })}
        />
      </FieldStack>
      <FieldStack label="Price" width="count">
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.price_ex_vat}
          onChange={(e) => patch({ price_ex_vat: Math.max(0, Number(e.target.value)) })}
        />
      </FieldStack>
    </>
  )
}

/** The add editor: the same construction, mounted only while adding. */
function AddItem({
  categories,
  pending,
  onSave,
  onCancel,
}: {
  categories: InventoryCategory[]
  pending: boolean
  onSave: (draft: ItemDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ItemDraft>({ ...EMPTY, category_id: categories[0]?.id ?? 0 })
  const ready = draft.name.trim().length > 0 && draft.category_id > 0
  return (
    <RowEditor
      saveLabel={pending ? 'Adding…' : 'Add item'}
      onSave={() => ready && onSave(draft)}
      onCancel={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready) {
          event.preventDefault()
          onSave(draft)
        }
      }}
    >
      <ItemFields
        draft={draft}
        setDraft={(update) => setDraft((prev) => update(prev) ?? prev)}
        categories={categories}
      />
    </RowEditor>
  )
}
