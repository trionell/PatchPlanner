import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteEventOwnedEquipment, putEventOwnedEquipment } from '../../api/owned'
import { deleteManualRental, putManualRental } from '../../api/rentals'
import { useRowEditor } from '../../hooks/useRowEditor'
import {
  BLANK_LINE,
  batchDefaults,
  linesReady,
  ownedCandidates,
  rentedCandidates,
  type LineValues,
  type PickerCandidate,
  type SaveLine,
} from '../../lib/equipmentCandidates'
import { type EquipmentRow, equipmentRows, quantitySplit, rowKey } from '../../lib/equipmentRows'
import { matchesSearch } from '../../lib/patchSearch'
import type { EventOwnedEquipment, EventRental, InventoryItem, OwnedItem } from '../../types'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { RecordField } from '../ui/RecordField'
import { Select } from '../ui/Select'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'
import { CatalogItemPicker } from './CatalogItemPicker'
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

/**
 * `Description` is second, between Item and Source — the position, the width and
 * the em-dash all copied from `RentalSheet`, which has carried the same column
 * for the same rented line since Slice 28. Without it two lines chosen from two
 * different cables read as two identical rows, which makes the picker's whole
 * job undone one screen later.
 */
const COLUMNS = ['Item', 'Description', 'Source', 'Type', 'Qty', 'Have', 'Note']

interface RowDraft {
  quantity: number
  audio: number
  light: number
  note: string
}

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

  /**
   * A batch is **one add and N calls** — there is no batch endpoint, and adding
   * one to save a round trip would be a migration-shaped answer to a problem
   * partial retry already solves.
   *
   * It does not stop at the first failure: the planner ticked five items, and
   * three of them landing is a better outcome than one landing and the rest
   * being abandoned because the second was rejected. What failed comes back, so
   * the editor can keep exactly that much and retry it.
   *
   * One invalidation at the end rather than N, so the sheet redraws once.
   */
  const saveLines = async (source: 'owned' | 'rented', lines: SaveLine[], note?: string) => {
    const failed: number[] = []
    let lastError = ''
    for (const line of lines) {
      try {
        if (source === 'owned') {
          await putEventOwnedEquipment(eventId, line.itemId, { quantity: line.quantity, notes: note })
        } else {
          await putManualRental(eventId, line.itemId, {
            quantity_audio: line.audio,
            quantity_lighting: line.light,
            notes: note,
          })
        }
      } catch (error) {
        failed.push(line.itemId)
        lastError = (error as Error).message
      }
    }
    if (source === 'owned') await invalidateOwned()
    else await invalidateRental()
    return { failed, lastError }
  }

  const rows = useMemo(() => equipmentRows(owned, rental), [owned, rental])
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!filter || (row.source === 'owned' && row.over)) &&
          matchesSearch(search, row.name, row.description, row.type, row.note),
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
                    <SheetCell className="max-w-56 truncate text-zinc-500" title={row.description}>
                      {row.description || <Dash />}
                    </SheetCell>
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
                            {/* The record field's two inks, so one line is named
                                the same way in the picker, the field, the row and
                                here. */}
                            <span className="flex h-8 items-center text-xs text-zinc-300">
                              {row.name}
                              {row.description && <span className="text-zinc-500"> · {row.description}</span>}
                            </span>
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
                    onCancel={() => onAddingChange?.(false)}
                    onDone={() => onAddingChange?.(false)}
                    ownedCatalog={ownedCatalog}
                    planned={rows}
                    rentalCatalog={rentalCatalog}
                    saveLines={saveLines}
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
 *
 * Since the item picker became a drawer it also adds **several lines at once**.
 * At one line it is the editor it has always been; at more than one the fields
 * move into a block, one row per item, under a single confirm.
 */
function AddEquipmentLine({
  ownedCatalog,
  rentalCatalog,
  planned,
  saveLines,
  onDone,
  onCancel,
}: {
  ownedCatalog: OwnedItem[]
  rentalCatalog: InventoryItem[]
  /** Every line the event already has, so the picker can refuse to overwrite one. */
  planned: EquipmentRow[]
  saveLines: (
    source: 'owned' | 'rented',
    lines: SaveLine[],
    note?: string,
  ) => Promise<{ failed: number[]; lastError: string }>
  onDone: () => void
  onCancel: () => void
}) {
  const [source, setSource] = useState<'owned' | 'rented'>('rented')
  const [chosen, setChosen] = useState<PickerCandidate[]>([])
  const [values, setValues] = useState<Record<number, LineValues>>({})
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(
    () => (source === 'owned' ? ownedCandidates(ownedCatalog) : rentedCandidates(rentalCatalog)),
    [ownedCatalog, rentalCatalog, source],
  )
  const onSheet = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of planned) if (row.source === source) map.set(row.id, row.qty)
    return map
  }, [planned, source])

  /* Nothing chosen yet still needs somewhere to hold a typed quantity, which is
     what the form has always allowed. Id 0 is that place. */
  const key = chosen.length === 1 ? chosen[0].id : 0
  const single = values[key] ?? BLANK_LINE

  const setSingle = (patch: Partial<LineValues>) =>
    setValues((prev) => ({ ...prev, [key]: { ...(prev[key] ?? BLANK_LINE), ...patch } }))

  const ready = linesReady(source, chosen.map((item) => item.id), values)

  const choose = (ids: number[]) => {
    const picked = ids.map((id) => candidates.find((item) => item.id === id)!).filter(Boolean)
    setPicking(false)
    setChosen(picked)
    setValues((prev) => {
      const next: Record<number, LineValues> = {}
      for (const item of picked) {
        /*
          A batch line lands at one, in the department its category names — which
          is what makes the fast path *tick five, confirm, save* rather than
          *tick five, fill five fields, save*. Every value is still editable
          below before anything is written.

          **A single add is left exactly as it was** — a rented line starts 0/0
          and will not save until a quantity is typed. The batch's default is a
          convenience the batch needed; letting it leak into the single path
          would change behaviour nobody asked to change.
        */
        next[item.id] =
          picked.length > 1
            ? batchDefaults(item)
            : (prev[item.id] ?? prev[0] ?? BLANK_LINE)
      }
      return next
    })
  }

  const save = async () => {
    if (!ready || saving) return
    setSaving(true)
    setError(null)
    const lines: SaveLine[] = chosen.map((item) => ({ itemId: item.id, ...(values[item.id] ?? BLANK_LINE) }))
    // A batch carries no per-line note; the single add keeps its Note field.
    const { failed, lastError } = await saveLines(source, lines, chosen.length === 1 ? note || undefined : undefined)
    setSaving(false)
    if (failed.length === 0) {
      onDone()
      return
    }
    /*
      The successes are already rows behind this editor, so what is named first
      is what *landed* — the fact the planner cannot see from here. The editor
      keeps only what failed, quantities intact, and its confirm re-reads for the
      remainder, so pressing it again retries exactly that.
    */
    const landed = lines.length - failed.length
    setChosen(chosen.filter((item) => failed.includes(item.id)))
    setError(`${landed} of ${lines.length} lines were added. ${failed.length} failed: ${lastError}`)
  }

  const many = chosen.length > 1

  return (
    <>
      <RowEditor
        onCancel={onCancel}
        onKeyDown={(event) => {
          /* The picker is a sibling, not a child, so its own Escape never
             reaches this handler — see where it is rendered below. */
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready) {
            event.preventDefault()
            void save()
          }
        }}
        notice={
          error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : undefined
        }
        onSave={() => void save()}
        saveLabel={saving ? 'Adding…' : many ? `Add ${chosen.length} lines` : 'Add line'}
      >
        <FieldStack label="Source" width="short">
          <Select
            size="sm"
            value={source}
            onChange={(event) => {
              // The two catalogs are different lists with different quantity
              // shapes, so the whole batch goes — the same rule that has always
              // cleared one chosen item.
              setSource(event.target.value as 'owned' | 'rented')
              setChosen([])
              setValues({})
            }}
          >
            <option value="owned">owned</option>
            <option value="rented">rented</option>
          </Select>
        </FieldStack>

        <FieldStack label="Item" width="grow">
          <RecordField
            count={chosen.length}
            onOpen={() => setPicking(true)}
            placeholder="Choose an item…"
            record={
              chosen.length === 1 ? { name: chosen[0].name, qualifier: chosen[0].description } : undefined
            }
            size="sm"
          />
        </FieldStack>

        {/* At one line this is literally the editor it has always been. The
            per-line fields only move into a block once there is more than one. */}
        {!many &&
          (source === 'owned' ? (
            <FieldStack label="Qty" width="count">
              <Input
                size="sm"
                type="number"
                min={0}
                value={single.quantity}
                onChange={(event) => setSingle({ quantity: Math.max(0, Number(event.target.value)) })}
              />
            </FieldStack>
          ) : (
            <>
              <FieldStack label="Audio" width="count">
                <Input
                  size="sm"
                  type="number"
                  min={0}
                  value={single.audio}
                  onChange={(event) => setSingle({ audio: Math.max(0, Number(event.target.value)) })}
                />
              </FieldStack>
              <FieldStack label="Light" width="count">
                <Input
                  size="sm"
                  type="number"
                  min={0}
                  value={single.light}
                  onChange={(event) => setSingle({ light: Math.max(0, Number(event.target.value)) })}
                />
              </FieldStack>
            </>
          ))}

        {!many && (
          <FieldStack label="Note" width="grow">
            <Input
              size="sm"
              value={note}
              placeholder="e.g. FOH laptop"
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldStack>
        )}

        {/* A full-width child of the editor's own flow, so the confirm wraps
            below it rather than being pushed off the end of a row. No component
            change: `RowEditor` already wraps. */}
        {many && (
          <div className="w-full rounded-md border border-zinc-800 bg-zinc-900/60">
            {chosen.map((item) => {
              const value = values[item.id] ?? BLANK_LINE
              return (
                <div
                  className="flex items-center gap-3 border-b border-zinc-800/60 px-2.5 py-1.5 last:border-b-0"
                  key={item.id}
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-100">
                    {item.name}
                    {item.description && <span className="text-zinc-500"> · {item.description}</span>}
                  </span>
                  {source === 'owned' ? (
                    <BatchNumber
                      label="Qty"
                      onChange={(quantity) => setValues((prev) => ({ ...prev, [item.id]: { ...value, quantity } }))}
                      value={value.quantity}
                    />
                  ) : (
                    <>
                      <BatchNumber
                        label="Audio"
                        onChange={(audio) => setValues((prev) => ({ ...prev, [item.id]: { ...value, audio } }))}
                        value={value.audio}
                      />
                      <BatchNumber
                        label="Light"
                        onChange={(light) => setValues((prev) => ({ ...prev, [item.id]: { ...value, light } }))}
                        value={value.light}
                      />
                    </>
                  )}
                  <button
                    aria-label={`Remove ${item.name}`}
                    className="flex-none px-1 text-zinc-500 hover:text-zinc-200"
                    onClick={() => setChosen((prev) => prev.filter((one) => one.id !== item.id))}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </RowEditor>

      {/*
        **Beside the editor, never within it.** React events bubble the React
        tree, so a drawer rendered inside `RowEditor`'s children would deliver
        one Escape to both handlers — closing the picker *and* discarding the
        add. As siblings, Escape closes the picker, and a second Escape cancels
        the line. No prop, no `stopPropagation`, no dependence on handler order.
      */}
      {picking && (
        <CatalogItemPicker
          candidates={candidates}
          emptyMessage={
            source === 'owned'
              ? 'Your owned-gear catalog is empty — add items on the Inventory page first.'
              : 'Nothing in this catalog yet.'
          }
          onChoose={choose}
          onClose={() => setPicking(false)}
          onSheet={onSheet}
          selection={chosen.map((item) => item.id)}
        />
      )}
    </>
  )
}

function BatchNumber({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-none items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <Input
        className="w-14"
        min={0}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
        size="sm"
        type="number"
        value={value}
      />
    </label>
  )
}
