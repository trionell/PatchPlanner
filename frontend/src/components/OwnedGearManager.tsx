import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { createOwnedItem, deleteOwnedItem, listOwnedItems, updateOwnedItem, type OwnedItemDraft } from '../api/owned'
import { useRowEditor } from '../hooks/useRowEditor'
import { matchesSearch } from '../lib/patchSearch'
import type { OwnedItem } from '../types'
import { RowEditor } from './event/RowEditor'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FieldStack } from './ui/GearList'
import { Input } from './ui/Input'
import { PatchPanel } from './ui/PatchPanel'
import { Select } from './ui/Select'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from './ui/SheetTable'

/**
 * The technician's own (non-rental) equipment catalog (Slice 29 US3).
 *
 * The same conversion the inventory catalog got, without a rail — there is
 * nothing here to filter by, and inventing a filter to have something to put in
 * one would be the pattern applied rather than used.
 *
 * `Planned on` is the column worth keeping exactly as it was: it counts how many
 * events reference each item, it is why deleting one takes gear off other plans,
 * and it is the only reason to open this page rather than the event you are
 * working on.
 */

const CATEGORY_TYPES = ['audio', 'lighting', 'rigging', 'video', 'misc'] as const
const COLUMNS = ['Item', 'Type', 'Owned', 'Planned on', 'Notes']

const EMPTY: OwnedItemDraft = { name: '', description: '', category_type: 'misc', quantity_owned: 1, notes: '' }

export function OwnedGearManager() {
  const queryClient = useQueryClient()
  const itemsQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  /* The item, never a boolean: the sentence counts the events that plan it, so the
     confirm has to know which row it was raised for and read that row's own count. */
  const [pendingItem, setPendingItem] = useState<OwnedItem | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['owned-items'] })
  const save = useMutation({
    mutationFn: ({ id, draft }: { id: number; draft: OwnedItemDraft }) => updateOwnedItem(id, draft),
    onSuccess: invalidate,
  })
  const create = useMutation({ mutationFn: (draft: OwnedItemDraft) => createOwnedItem(draft), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: number) => deleteOwnedItem(id), onSuccess: invalidate })

  const items = itemsQuery.data ?? []
  const visible = items.filter((item) =>
    matchesSearch(search, item.name, item.description, item.notes, item.category_type),
  )

  const editor = useRowEditor<OwnedItem, OwnedItemDraft>({
    rows: visible,
    idOf: (item) => item.id,
    draftOf: (item) => ({
      name: item.name,
      description: item.description ?? '',
      category_type: item.category_type,
      quantity_owned: item.quantity_owned,
      notes: item.notes ?? '',
    }),
    persist: (item, draft) => {
      const unchanged =
        draft.name === item.name &&
        draft.description === (item.description ?? '') &&
        draft.category_type === item.category_type &&
        draft.quantity_owned === item.quantity_owned &&
        draft.notes === (item.notes ?? '')
      if (unchanged) return
      save.mutate({ id: item.id, draft })
    },
  })

  const byType = CATEGORY_TYPES.map((type) => ({
    type,
    count: items.filter((item) => item.category_type === type).length,
  })).filter((entry) => entry.count > 0)
  const planned = items.filter((item) => item.planned_on_events > 0).length

  return (
    <>
    <PatchPanel
      bar={
        <>
          <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Owned gear</span>

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

          <span className="flex-1" />

          <Button size="xs" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Item
          </Button>
        </>
      }
    >
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
                    className="cursor-pointer"
                    onClick={() => editor.openRow(item)}
                  >
                    <SheetCell className="whitespace-nowrap text-zinc-100">
                      {item.name}
                      {item.description && <span className="ml-1.5 text-zinc-500">{item.description}</span>}
                    </SheetCell>
                    <SheetCell>
                      <Pill className="bg-zinc-700 text-zinc-100">{item.category_type}</Pill>
                    </SheetCell>
                    <NumCell>{item.quantity_owned}</NumCell>
                    <NumCell>
                      {item.planned_on_events > 0 ? (
                        `${item.planned_on_events} event${item.planned_on_events > 1 ? 's' : ''}`
                      ) : (
                        <Dash />
                      )}
                    </NumCell>
                    <SheetCell className="max-w-64 truncate text-zinc-500">{item.notes || <Dash />}</SheetCell>
                  </SheetRow>

                  {open && editor.draft && (
                    <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                      <td colSpan={COLUMNS.length} className="px-2 pb-2">
                        <RowEditor
                          saveLabel="Save item"
                          onSave={editor.save}
                          onCancel={editor.close}
                          onKeyDown={editor.onKeyDown}
                          onDelete={() => setPendingItem(item)}
                        >
                          <OwnedFields draft={editor.draft} setDraft={editor.setDraft} />
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
                  {items.length === 0 ? 'No owned gear yet — add your first item.' : 'No item matches.'}
                </SheetCell>
              </tr>
            )}

            {adding && (
              <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                <td colSpan={COLUMNS.length} className="px-2 py-2">
                  <AddOwnedItem
                    pending={create.isPending}
                    onCancel={() => setAdding(false)}
                    onSave={(draft) => create.mutate(draft, { onSuccess: () => setAdding(false) })}
                  />
                </td>
              </tr>
            )}
          </SheetBody>
        </SheetTable>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
        <Pill className="bg-emerald-500/15 text-emerald-300">{items.length === 0 ? 'nothing owned' : 'your gear'}</Pill>
        <span className="font-mono tabular-nums text-zinc-200">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
        {byType.map((entry) => (
          <span key={entry.type} className="font-mono tabular-nums text-zinc-500">
            {entry.count} {entry.type}
          </span>
        ))}
        {planned > 0 && <span className="text-zinc-500">{planned} planned on an event</span>}
      </div>
    </PatchPanel>

    {/* Last sibling, outside the panel. This is raised from a `RowEditor` inside a
        `<tr>`; a dialog rendered there would be inside the table's own stacking. */}
    <ConfirmDialog
      open={pendingItem != null}
      title="Delete owned item"
      onCancel={() => setPendingItem(null)}
      onConfirm={() => {
        if (pendingItem) remove.mutate(pendingItem.id)
        setPendingItem(null)
        editor.close()
      }}
    >
      {pendingItem &&
        /* Deleting takes the item off other people's plans, so the sentence says how
           many rather than asking the generic question. */
        (pendingItem.planned_on_events > 0 ? (
          <>
            <span className="text-zinc-200">{pendingItem.name}</span> is planned on {pendingItem.planned_on_events}{' '}
            {pendingItem.planned_on_events === 1 ? 'event' : 'events'}. Deleting it removes it from those plans too.
          </>
        ) : (
          <>
            <span className="text-zinc-200">{pendingItem.name}</span> is removed from your owned gear.
          </>
        ))}
    </ConfirmDialog>
    </>
  )
}

function Dash() {
  return <span className="text-zinc-600">—</span>
}

function OwnedFields({
  draft,
  setDraft,
}: {
  draft: OwnedItemDraft
  setDraft: (update: (draft: OwnedItemDraft | null) => OwnedItemDraft | null) => void
}) {
  const patch = (change: Partial<OwnedItemDraft>) => setDraft((prev) => (prev ? { ...prev, ...change } : prev))
  return (
    <>
      <FieldStack label="Name" width="grow">
        <Input size="sm" value={draft.name} placeholder="e.g. Shure SM7B" onChange={(e) => patch({ name: e.target.value })} />
      </FieldStack>
      <FieldStack label="Description" width="grow">
        <Input
          size="sm"
          value={draft.description ?? ''}
          placeholder="optional"
          onChange={(e) => patch({ description: e.target.value })}
        />
      </FieldStack>
      <FieldStack label="Type" width="short">
        <Select
          size="sm"
          value={draft.category_type}
          onChange={(e) => patch({ category_type: e.target.value as OwnedItemDraft['category_type'] })}
        >
          {CATEGORY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </FieldStack>
      <FieldStack label="Owned" width="count">
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.quantity_owned}
          onChange={(e) => patch({ quantity_owned: Math.max(0, Number(e.target.value)) })}
        />
      </FieldStack>
      <FieldStack label="Notes" width="grow">
        <Input size="sm" value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} />
      </FieldStack>
    </>
  )
}

function AddOwnedItem({
  pending,
  onSave,
  onCancel,
}: {
  pending: boolean
  onSave: (draft: OwnedItemDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<OwnedItemDraft>(EMPTY)
  const ready = draft.name.trim().length > 0
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
      <OwnedFields draft={draft} setDraft={(update) => setDraft((prev) => update(prev) ?? prev)} />
    </RowEditor>
  )
}
