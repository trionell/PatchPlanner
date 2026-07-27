import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteEventOwnedEquipment, putEventOwnedEquipment } from '../../api/owned'
import { deleteManualRental, putManualRental } from '../../api/rentals'
import { useRowEditor } from '../../hooks/useRowEditor'
import { type EquipmentRow, equipmentRows, quantitySplit, rowKey } from '../../lib/equipmentRows'
import { matchesSearch } from '../../lib/patchSearch'
import type { EventOwnedEquipment, EventRental, InventoryItem, OwnedItem } from '../../types'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'
import { type EquipmentFilter, EquipmentStatusRail } from './EquipmentStatusRail'
import { RowEditor } from './RowEditor'

/**
 * Everything coming to the gig beyond the patch and the rig, as one sheet
 * (Slice 28 US2).
 *
 * It used to be two cards, because owned gear and rented extras come from two
 * endpoints. The planner's question is not *which endpoint* — it is *what is
 * coming with us, and have I got enough of it*. One list, and a `Source` column.
 *
 * `Source` is also the editor's first field, and changing it swaps the item
 * picker between your own catalog and the event's rental catalog. On an existing
 * row it is read-only: moving a line across would be a delete on one endpoint and
 * a create on another, with a different catalog on each side. That is a move, not
 * an edit (FR-035).
 */

const COLUMNS = ['Item', 'Source', 'Type', 'Qty', 'Have', 'Note']

interface RowDraft {
  quantity: number
  audio: number
  light: number
  note: string
}

interface AddDraft extends RowDraft {
  source: 'owned' | 'rented'
  itemId: string
}

const EMPTY_ADD: AddDraft = { source: 'owned', itemId: '', quantity: 1, audio: 0, light: 0, note: '' }

interface EquipmentSheetProps {
  eventId: number
  owned?: EventOwnedEquipment[]
  rental?: EventRental[]
  /** Your own gear catalog, for an owned line's item picker. */
  ownedCatalog: OwnedItem[]
  /** The event's rental catalog, for a rented line's. */
  rentalCatalog: InventoryItem[]
  search?: string
  adding?: boolean
  onAddingChange?: (adding: boolean) => void
  /** Opens the Rental Order tab, where a rented extra is also a line. */
  onOpenRental?: () => void
  readOnly?: boolean
}

export function EquipmentSheet({
  eventId,
  owned,
  rental,
  ownedCatalog,
  rentalCatalog,
  search = '',
  adding = false,
  onAddingChange,
  onOpenRental,
  readOnly = false,
}: EquipmentSheetProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<EquipmentFilter>(null)

  const invalidateOwned = async () => {
    await queryClient.invalidateQueries({ queryKey: ['owned-equipment', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['owned-items'] })
  }
  const invalidateRental = () => queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })

  const setOwned = useMutation({
    mutationFn: ({ itemId, quantity, notes }: { itemId: number; quantity: number; notes?: string }) =>
      putEventOwnedEquipment(eventId, itemId, { quantity, notes }),
    onSuccess: invalidateOwned,
  })
  const clearOwned = useMutation({
    mutationFn: (itemId: number) => deleteEventOwnedEquipment(eventId, itemId),
    onSuccess: invalidateOwned,
  })
  const setRented = useMutation({
    mutationFn: ({ itemId, audio, light, notes }: { itemId: number; audio: number; light: number; notes?: string }) =>
      putManualRental(eventId, itemId, { quantity_audio: audio, quantity_lighting: light, notes }),
    onSuccess: invalidateRental,
  })
  const clearRented = useMutation({
    mutationFn: (itemId: number) => deleteManualRental(eventId, itemId),
    onSuccess: invalidateRental,
  })

  const rows = useMemo(() => equipmentRows(owned, rental), [owned, rental])
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!filter || (row.source === 'owned' && row.over)) &&
          matchesSearch(search, row.name, row.type, row.note),
      ),
    [filter, rows, search],
  )

  const editor = useRowEditor<EquipmentRow, RowDraft>({
    rows: visible,
    // The two id spaces overlap, so the editor keys on the composite too.
    idOf: (row) => (row.source === 'owned' ? row.id : row.id + 1_000_000),
    draftOf: (row) => ({
      quantity: row.source === 'owned' ? row.qty : 0,
      audio: row.source === 'rented' ? row.audio : 0,
      light: row.source === 'rented' ? row.light : 0,
      note: row.note ?? '',
    }),
    persist: (row, draft) => {
      if (row.source === 'owned') {
        if (draft.quantity === row.qty && draft.note === (row.note ?? '')) return
        setOwned.mutate({ itemId: row.id, quantity: draft.quantity, notes: draft.note || undefined })
        return
      }
      if (draft.audio === row.audio && draft.light === row.light && draft.note === (row.note ?? '')) return
      setRented.mutate({ itemId: row.id, audio: draft.audio, light: draft.light, notes: draft.note || undefined })
    },
  })

  return (
    <>
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
            {visible.map((row, index) => {
              const key = editor.openId
              const rowId = row.source === 'owned' ? row.id : row.id + 1_000_000
              const open = key === rowId
              const split = row.source === 'rented' ? quantitySplit(row) : undefined
              return (
                <Fragment key={rowKey(row)}>
                  <SheetRow
                    striped={index % 2 === 1}
                    open={open}
                    className={readOnly ? undefined : 'cursor-pointer'}
                    onClick={readOnly ? undefined : () => editor.openRow(row)}
                  >
                    <SheetCell className="whitespace-nowrap text-zinc-100">{row.name}</SheetCell>
                    <SheetCell>
                      {/* A vocabulary tint, not a warning — the word carries the
                          meaning and amber here means "comes from elsewhere",
                          the same sense `return` has in lib/vocabularyTint. */}
                      <Pill
                        className={
                          row.source === 'owned' ? 'bg-zinc-700 text-zinc-100' : 'bg-amber-500/15 text-amber-300'
                        }
                      >
                        {row.source}
                      </Pill>
                    </SheetCell>
                    <SheetCell className="text-zinc-500">{row.type || <Dash />}</SheetCell>
                    <NumCell>
                      {row.qty}
                      {split && (
                        <span
                          className="ml-1.5 rounded-sm bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400"
                          title={`${row.source === 'rented' ? row.audio : 0} audio · ${row.source === 'rented' ? row.light : 0} lighting`}
                        >
                          {split}
                        </span>
                      )}
                    </NumCell>
                    <NumCell
                      className={row.source === 'owned' && row.over ? 'text-red-400' : undefined}
                      title={
                        row.source === 'owned' && row.over
                          ? `${row.qty} planned, you own ${row.have}`
                          : undefined
                      }
                    >
                      {row.source === 'owned' ? row.have : <Dash />}
                    </NumCell>
                    <SheetCell className="max-w-56 truncate text-zinc-500">{row.note || <Dash />}</SheetCell>
                  </SheetRow>

                  {open && editor.draft && (
                    <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                      <td colSpan={COLUMNS.length} className="px-2 pb-2">
                        <RowEditor
                          saveLabel="Save line"
                          onSave={editor.save}
                          onCancel={editor.close}
                          onKeyDown={editor.onKeyDown}
                          onDelete={() => {
                            if (row.source === 'owned') clearOwned.mutate(row.id)
                            else clearRented.mutate(row.id)
                            editor.close()
                          }}
                          handoff={
                            row.source === 'rented' && onOpenRental
                              ? { label: 'Rental', text: 'See on rental order', onSelect: onOpenRental }
                              : undefined
                          }
                        >
                          <FieldStack label="Source" width="short">
                            {/* Read-only on an existing row: moving a line
                                between the two is a delete and a create against
                                different catalogs, which is a different
                                operation than editing (FR-035). */}
                            <span className="flex h-8 items-center text-xs text-zinc-400">{row.source}</span>
                          </FieldStack>
                          <FieldStack label="Item" width="grow">
                            <span className="flex h-8 items-center text-xs text-zinc-300">{row.name}</span>
                          </FieldStack>
                          {row.source === 'owned' ? (
                            <FieldStack label="Qty" width="count">
                              <Input
                                size="sm"
                                type="number"
                                min={0}
                                value={editor.draft.quantity}
                                onChange={(event) =>
                                  editor.setDraft((draft) =>
                                    draft ? { ...draft, quantity: Math.max(0, Number(event.target.value)) } : draft,
                                  )
                                }
                              />
                            </FieldStack>
                          ) : (
                            <>
                              <FieldStack label="Audio" width="count">
                                <Input
                                  size="sm"
                                  type="number"
                                  min={0}
                                  value={editor.draft.audio}
                                  onChange={(event) =>
                                    editor.setDraft((draft) =>
                                      draft ? { ...draft, audio: Math.max(0, Number(event.target.value)) } : draft,
                                    )
                                  }
                                />
                              </FieldStack>
                              <FieldStack label="Light" width="count">
                                <Input
                                  size="sm"
                                  type="number"
                                  min={0}
                                  value={editor.draft.light}
                                  onChange={(event) =>
                                    editor.setDraft((draft) =>
                                      draft ? { ...draft, light: Math.max(0, Number(event.target.value)) } : draft,
                                    )
                                  }
                                />
                              </FieldStack>
                            </>
                          )}
                          <FieldStack label="Note" width="grow">
                            <Input
                              size="sm"
                              value={editor.draft.note}
                              onChange={(event) =>
                                editor.setDraft((draft) => (draft ? { ...draft, note: event.target.value } : draft))
                              }
                            />
                          </FieldStack>
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
                  {rows.length === 0
                    ? ownedCatalog.length === 0
                      ? 'Your owned-gear catalog is empty — add items on the Inventory page first.'
                      : 'Nothing beyond the patch and the rig yet.'
                    : 'No line matches.'}
                </SheetCell>
              </tr>
            )}

            {adding && !readOnly && (
              <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                <td colSpan={COLUMNS.length} className="px-2 py-2">
                  <AddEquipmentLine
                    ownedCatalog={ownedCatalog}
                    rentalCatalog={rentalCatalog}
                    pending={setOwned.isPending || setRented.isPending}
                    onCancel={() => onAddingChange?.(false)}
                    onSave={(draft) => {
                      const done = { onSuccess: () => onAddingChange?.(false) }
                      if (draft.source === 'owned') {
                        setOwned.mutate(
                          { itemId: Number(draft.itemId), quantity: draft.quantity, notes: draft.note || undefined },
                          done,
                        )
                      } else {
                        setRented.mutate(
                          {
                            itemId: Number(draft.itemId),
                            audio: draft.audio,
                            light: draft.light,
                            notes: draft.note || undefined,
                          },
                          done,
                        )
                      }
                    }}
                  />
                </td>
              </tr>
            )}
          </SheetBody>
        </SheetTable>
      </div>

      <EquipmentStatusRail rows={rows} filter={filter} onFilterChange={readOnly ? undefined : setFilter} />
    </>
  )
}

function Dash() {
  return <span className="text-zinc-600">—</span>
}

/**
 * The add editor, whose **first** field is where the line comes from — and the
 * item picker follows it. One editor and one switch, instead of two forms that
 * differed only in which endpoint they posted to.
 */
function AddEquipmentLine({
  ownedCatalog,
  rentalCatalog,
  pending,
  onSave,
  onCancel,
}: {
  ownedCatalog: OwnedItem[]
  rentalCatalog: InventoryItem[]
  pending: boolean
  onSave: (draft: AddDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<AddDraft>(EMPTY_ADD)
  const ready =
    draft.itemId !== '' && (draft.source === 'owned' ? draft.quantity > 0 : draft.audio > 0 || draft.light > 0)

  return (
    <RowEditor
      saveLabel={pending ? 'Adding…' : 'Add line'}
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
      <FieldStack label="Source" width="short">
        <Select
          size="sm"
          value={draft.source}
          onChange={(event) =>
            // Switching source invalidates the chosen item — the two catalogs
            // are different lists — so the picker resets rather than pointing at
            // an id from the other one.
            setDraft((prev) => ({ ...prev, source: event.target.value as AddDraft['source'], itemId: '' }))
          }
        >
          <option value="owned">owned</option>
          <option value="rented">rented</option>
        </Select>
      </FieldStack>
      <FieldStack label="Item" width="grow">
        <Select
          size="sm"
          value={draft.itemId}
          onChange={(event) => setDraft((prev) => ({ ...prev, itemId: event.target.value }))}
        >
          <option value="">Select item…</option>
          {draft.source === 'owned'
            ? ownedCatalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category_type} — {item.name}
                </option>
              ))
            : rentalCatalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category_name ? `${item.category_name} — ${item.name}` : item.name}
                </option>
              ))}
        </Select>
      </FieldStack>
      {draft.source === 'owned' ? (
        <FieldStack label="Qty" width="count">
          <Input
            size="sm"
            type="number"
            min={0}
            value={draft.quantity}
            onChange={(event) => setDraft((prev) => ({ ...prev, quantity: Math.max(0, Number(event.target.value)) }))}
          />
        </FieldStack>
      ) : (
        <>
          <FieldStack label="Audio" width="count">
            <Input
              size="sm"
              type="number"
              min={0}
              value={draft.audio}
              onChange={(event) => setDraft((prev) => ({ ...prev, audio: Math.max(0, Number(event.target.value)) }))}
            />
          </FieldStack>
          <FieldStack label="Light" width="count">
            <Input
              size="sm"
              type="number"
              min={0}
              value={draft.light}
              onChange={(event) => setDraft((prev) => ({ ...prev, light: Math.max(0, Number(event.target.value)) }))}
            />
          </FieldStack>
        </>
      )}
      <FieldStack label="Note" width="grow">
        <Input
          size="sm"
          value={draft.note}
          placeholder="e.g. FOH laptop"
          onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
        />
      </FieldStack>
    </RowEditor>
  )
}
