import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteManualRental, putManualRental } from '../../api/rentals'
import { useRowEditor } from '../../hooks/useRowEditor'
import { matchesSearch } from '../../lib/patchSearch'
import { hasManualPart, isProblemLine, plannedQuantities } from '../../lib/rentalOrder'
import type { EventRental, InventoryItem, ManualRentalRequest, RentalSummary } from '../../types'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'
import { type RentalFilter, RentalStatusRail } from './RentalStatusRail'
import { RowEditor } from './RowEditor'

/**
 * The rental order, as a sheet (Slice 28 US1).
 *
 * The tab with the most rows in a real event and the fewest editable values:
 * almost every number on it is **derived** from the patch and the rig, and the
 * only thing a person types is a manual line — something the plan cannot know
 * about, like spares.
 *
 * That asymmetry used to be invisible. A four-field form sat open above the table
 * whether or not it was wanted, and each manual row grew two buttons the other
 * rows did not have. Now the editor opens under the row it edits, and its first
 * field is the one that cannot be changed here: what the plan contributes.
 */

const COLUMNS = ['Item', 'Description', 'Audio', 'Light', 'Qty', 'Stock', 'Price', 'Subtotal', 'Note']

interface ManualDraft {
  quantityAudio: number
  quantityLighting: number
  notes: string
}

interface AddDraft extends ManualDraft {
  itemId: string
}

const EMPTY_ADD: AddDraft = { itemId: '', quantityAudio: 0, quantityLighting: 0, notes: '' }

interface RentalSheetProps {
  eventId: number
  summary?: RentalSummary
  /** The whole catalog, for the add editor's item picker. */
  catalog: InventoryItem[]
  search?: string
  adding?: boolean
  onAddingChange?: (adding: boolean) => void
  /** Opens the Equipment tab, where the same manual line also appears. */
  onOpenEquipment?: () => void
  readOnly?: boolean
}

export function RentalSheet({
  eventId,
  summary,
  catalog,
  search = '',
  adding = false,
  onAddingChange,
  onOpenEquipment,
  readOnly = false,
}: RentalSheetProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<RentalFilter>(null)

  const items = useMemo(() => summary?.items ?? [], [summary])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })

  const setManual = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: number; payload: ManualRentalRequest }) =>
      putManualRental(eventId, itemId, payload),
    onSuccess: invalidate,
  })
  const clearManual = useMutation({
    mutationFn: (itemId: number) => deleteManualRental(eventId, itemId),
    onSuccess: invalidate,
  })

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (!filter || isProblemLine(item)) &&
          matchesSearch(search, item.inventory_item_name, item.description, item.manual_notes),
      ),
    [filter, items, search],
  )

  const editor = useRowEditor<EventRental, ManualDraft>({
    rows: visible,
    idOf: (item) => item.inventory_item_id,
    draftOf: (item) => ({
      quantityAudio: item.manual_quantity_audio,
      quantityLighting: item.manual_quantity_lighting,
      notes: item.manual_notes ?? '',
    }),
    persist: (item, draft) => {
      if (
        draft.quantityAudio === item.manual_quantity_audio &&
        draft.quantityLighting === item.manual_quantity_lighting &&
        draft.notes === (item.manual_notes ?? '')
      ) {
        return
      }
      setManual.mutate({
        itemId: item.inventory_item_id,
        payload: {
          quantity_audio: draft.quantityAudio,
          quantity_lighting: draft.quantityLighting,
          notes: draft.notes || undefined,
        },
      })
    },
  })

  const manualCount = items.filter(hasManualPart).length

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
            {visible.map((item, index) => {
              const open = editor.openId === item.inventory_item_id
              const planned = plannedQuantities(item)
              return (
                <Fragment key={item.inventory_item_id}>
                  <SheetRow
                    striped={index % 2 === 1}
                    open={open}
                    className={readOnly ? undefined : 'cursor-pointer'}
                    onClick={readOnly ? undefined : () => editor.openRow(item)}
                  >
                    <SheetCell className="whitespace-nowrap text-zinc-100">
                      {item.inventory_item_name}
                      {item.is_discontinued && (
                        <Pill className="ml-1.5 bg-amber-500/15 text-amber-300">discontinued</Pill>
                      )}
                    </SheetCell>
                    <SheetCell className="max-w-56 truncate text-zinc-500">{item.description || <Dash />}</SheetCell>
                    <QuantityCell total={item.quantity_audio} manual={item.manual_quantity_audio} planned={planned.audio} unit="audio" />
                    <QuantityCell
                      total={item.quantity_lighting}
                      manual={item.manual_quantity_lighting}
                      planned={planned.lighting}
                      unit="lighting"
                    />
                    <NumCell>{item.total_quantity}</NumCell>
                    <NumCell
                      className={item.is_over_stock ? 'text-red-400' : undefined}
                      title={
                        item.is_over_stock
                          ? `${item.total_quantity} planned, the renter has ${item.quantity_available}`
                          : undefined
                      }
                    >
                      {item.quantity_available}
                    </NumCell>
                    <NumCell>{item.price_ex_vat.toFixed(2)}</NumCell>
                    <NumCell>{item.subtotal_ex_vat.toFixed(2)}</NumCell>
                    <SheetCell className="max-w-48 truncate text-zinc-500">{item.manual_notes || <Dash />}</SheetCell>
                  </SheetRow>

                  {open && editor.draft && (
                    <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                      <td colSpan={COLUMNS.length} className="px-2 pb-2">
                        <RowEditor
                          saveLabel="Save line"
                          onSave={editor.save}
                          onCancel={editor.close}
                          onKeyDown={editor.onKeyDown}
                          onDelete={
                            hasManualPart(item)
                              ? () => {
                                  clearManual.mutate(item.inventory_item_id)
                                  editor.close()
                                }
                              : undefined
                          }
                          handoff={
                            onOpenEquipment && hasManualPart(item)
                              ? { label: 'Equipment', text: 'See on Equipment', onSelect: onOpenEquipment }
                              : undefined
                          }
                        >
                          {/*
                            Read-only, and the first thing in the editor: this is
                            what the tab is *for*. The number comes from the patch
                            and the rig, and the only way to change it is to change
                            those (FR-015). A disabled input would say the same
                            thing while implying it could be enabled.
                          */}
                          <FieldStack label="From the plan">
                            <span className="flex h-8 items-center font-mono text-xs tabular-nums text-zinc-400">
                              {planned.audio} audio · {planned.lighting} lighting
                            </span>
                          </FieldStack>
                          <FieldStack label="Manual audio" width="count">
                            <Input
                              size="sm"
                              type="number"
                              min={0}
                              value={editor.draft.quantityAudio}
                              onChange={(event) =>
                                editor.setDraft((draft) =>
                                  draft ? { ...draft, quantityAudio: Math.max(0, Number(event.target.value)) } : draft,
                                )
                              }
                            />
                          </FieldStack>
                          <FieldStack label="Manual light" width="count">
                            <Input
                              size="sm"
                              type="number"
                              min={0}
                              value={editor.draft.quantityLighting}
                              onChange={(event) =>
                                editor.setDraft((draft) =>
                                  draft
                                    ? { ...draft, quantityLighting: Math.max(0, Number(event.target.value)) }
                                    : draft,
                                )
                              }
                            />
                          </FieldStack>
                          <FieldStack label="Note" width="grow">
                            <Input
                              size="sm"
                              value={editor.draft.notes}
                              placeholder="e.g. spares"
                              onChange={(event) =>
                                editor.setDraft((draft) => (draft ? { ...draft, notes: event.target.value } : draft))
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
                  {items.length === 0
                    ? 'Nothing on the order yet — it fills itself from the patch and the rig.'
                    : 'No line matches.'}
                </SheetCell>
              </tr>
            )}

            {adding && !readOnly && (
              <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                <td colSpan={COLUMNS.length} className="px-2 py-2">
                  <AddManualLine
                    catalog={catalog}
                    pending={setManual.isPending}
                    onCancel={() => onAddingChange?.(false)}
                    onSave={(draft) =>
                      setManual.mutate(
                        {
                          itemId: Number(draft.itemId),
                          payload: {
                            quantity_audio: draft.quantityAudio,
                            quantity_lighting: draft.quantityLighting,
                            notes: draft.notes || undefined,
                          },
                        },
                        { onSuccess: () => onAddingChange?.(false) },
                      )
                    }
                  />
                </td>
              </tr>
            )}
          </SheetBody>
        </SheetTable>
      </div>

      <RentalStatusRail
        summary={summary}
        items={items}
        manualCount={manualCount}
        filter={filter}
        onFilterChange={readOnly ? undefined : setFilter}
      />
    </>
  )
}

function Dash() {
  return <span className="text-zinc-600">—</span>
}

/**
 * A quantity, and how much of it somebody typed.
 *
 * The badge is Slice 27's shared-address badge, unchanged, because it means the
 * same thing there: a count that qualifies the number beside it. Information, not
 * a warning — no amber, no red.
 */
function QuantityCell({
  total,
  manual,
  planned,
  unit,
}: {
  total: number
  manual: number
  planned: number
  unit: string
}) {
  if (total === 0) {
    return (
      <NumCell>
        <Dash />
      </NumCell>
    )
  }
  return (
    <NumCell>
      {total}
      {manual > 0 && (
        <span
          className="ml-1.5 rounded-sm bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400"
          title={`${planned} from the plan · ${manual} added by hand (${unit})`}
        >
          +{manual}
        </span>
      )}
    </NumCell>
  )
}

/**
 * The add editor, at the foot of the sheet — the same construction as the row
 * editor, with an item picker and no delete, which is what makes adding and
 * editing look like one operation.
 *
 * Its own component so the draft is created on mount and destroyed on close,
 * rather than being reset by an effect somebody has to remember to write.
 */
function AddManualLine({
  catalog,
  pending,
  onSave,
  onCancel,
}: {
  catalog: InventoryItem[]
  pending: boolean
  onSave: (draft: AddDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<AddDraft>(EMPTY_ADD)
  const ready = draft.itemId !== '' && (draft.quantityAudio > 0 || draft.quantityLighting > 0)

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
      <FieldStack label="Catalog item" width="grow">
        <Select
          size="sm"
          value={draft.itemId}
          onChange={(event) => setDraft((prev) => ({ ...prev, itemId: event.target.value }))}
        >
          <option value="">Select item…</option>
          {catalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.category_name ? `${item.category_name} — ${item.name}` : item.name}
            </option>
          ))}
        </Select>
      </FieldStack>
      <FieldStack label="Manual audio" width="count">
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.quantityAudio}
          onChange={(event) => setDraft((prev) => ({ ...prev, quantityAudio: Math.max(0, Number(event.target.value)) }))}
        />
      </FieldStack>
      <FieldStack label="Manual light" width="count">
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.quantityLighting}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, quantityLighting: Math.max(0, Number(event.target.value)) }))
          }
        />
      </FieldStack>
      <FieldStack label="Note" width="grow">
        <Input
          size="sm"
          value={draft.notes}
          placeholder="e.g. spares"
          onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
        />
      </FieldStack>
    </RowEditor>
  )
}
