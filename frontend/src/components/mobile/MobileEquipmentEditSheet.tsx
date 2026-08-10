import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteEventOwnedEquipment, putEventOwnedEquipment } from '../../api/owned'
import { deleteManualRental, putManualRental } from '../../api/rentals'
import {
  BLANK_LINE,
  batchDefaults,
  linesReady,
  ownedCandidates,
  rentedCandidates,
  type LineValues,
  type PickerCandidate,
} from '../../lib/equipmentCandidates'
import type { EquipmentRow } from '../../lib/equipmentRows'
import type { InventoryItem, OwnedItem } from '../../types'
import { CatalogItemPicker } from '../event/CatalogItemPicker'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { RecordField } from '../ui/RecordField'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'

/**
 * One equipment line, edited on site (Wave 6c, audit.md M4).
 *
 * The phone could not edit this until now, and the reason it gave was wrong: both
 * `EquipmentTab` and `RentalTab` had the viewport `&&`-ed into the role, so every
 * downstream check read *you may not* when the truth was *nobody built it*. A capability
 * is a role question; whether a surface has a phone form is a fact about the surface
 * (patterns.md §7g). Correcting the expression is what made this component necessary.
 *
 * **It is not one configurable form with the rental sheet**, per `components.md` §5 and
 * `GearList`'s reasoning: the two differ in their fields, in whether delete exists, and
 * in whether a second read-only shape is possible. A `kind` prop and four conditionals
 * is `<EntityList fields={…}>` again.
 *
 * The fields are the desktop `RowEditor`'s, value for value — the same clamping and the
 * same call — because a phone edit and a desk edit of one line must not be two
 * operations.
 */
export function MobileEquipmentEditSheet({
  eventId,
  row,
  planned,
  ownedCatalog,
  ownedCatalogLoading = false,
  rentalCatalog,
  rentalCatalogLoading = false,
  readOnly,
  onClose,
  onOpenRental,
}: {
  eventId: number
  /**
   * The line being edited. **Omitted means adding one** — add and edit are one
   * construction (`patterns.md` §2), which is also why the desktop's add row is the
   * same `RowEditor` as its edit row.
   */
  row?: EquipmentRow
  /** Every line the event already has, so the picker can refuse to overwrite one. */
  planned: EquipmentRow[]
  ownedCatalog: OwnedItem[]
  ownedCatalogLoading?: boolean
  rentalCatalog: InventoryItem[]
  rentalCatalogLoading?: boolean
  /** A role that may not edit gets the same sheet with no confirm and no delete (P7). */
  readOnly: boolean
  onClose: () => void
  /** Where a rented line is actually edited. Absent hides the handoff, not the sheet. */
  onOpenRental?: () => void
}) {
  const queryClient = useQueryClient()
  /* `rented` is the catalog that has anything in it — the owned one is empty
     until the planner builds it, and defaulting to it opened the picker onto
     nothing at all. */
  const [source, setSource] = useState<EquipmentRow['source']>(row?.source ?? 'rented')
  const [chosen, setChosen] = useState<PickerCandidate[]>([])
  const [values, setValues] = useState<Record<number, LineValues>>({})
  const [picking, setPicking] = useState(false)
  const [quantity, setQuantity] = useState(row?.source === 'owned' ? row.qty : 1)
  const [note, setNote] = useState(row?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(
    () => (source === 'owned' ? ownedCandidates(ownedCatalog) : rentedCandidates(rentalCatalog)),
    [ownedCatalog, rentalCatalog, source],
  )
  const onSheet = useMemo(() => {
    const map = new Map<number, number>()
    for (const line of planned) if (line.source === source) map.set(line.id, line.qty)
    return map
  }, [planned, source])

  /* Nothing chosen yet still needs somewhere to hold a typed quantity. Id 0 is it. */
  const key = chosen.length === 1 ? chosen[0].id : 0
  const single = values[key] ?? BLANK_LINE
  const setSingle = (patch: Partial<LineValues>) =>
    setValues((prev) => ({ ...prev, [key]: { ...(prev[key] ?? BLANK_LINE), ...patch } }))
  const many = chosen.length > 1

  const choose = (ids: number[]) => {
    const picked = ids.flatMap((id) => {
      const found = candidates.find((item) => item.id === id)
      return found ? [found] : []
    })
    setPicking(false)
    setChosen(picked)
    setValues((prev) => {
      const next: Record<number, LineValues> = {}
      for (const item of picked) {
        next[item.id] = picked.length > 1 ? batchDefaults(item) : (prev[item.id] ?? prev[0] ?? BLANK_LINE)
      }
      return next
    })
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['owned-equipment', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['owned-items'] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const kind = row?.source ?? source
      // Editing one line is one call, exactly as before.
      if (row) {
        const notes = note || undefined
        if (kind === 'owned') {
          await putEventOwnedEquipment(eventId, row.id, { quantity, notes })
          return
        }
        await putManualRental(eventId, row.id, { quantity_audio: single.audio, quantity_lighting: single.light, notes })
        return
      }
      /*
        Adding is N calls, and it does not stop at the first failure — three of
        five landing beats one landing and the rest being abandoned. What failed
        stays in the sheet so pressing the confirm again retries exactly that;
        the message names what *landed*, since that is the fact a phone screen
        behind this sheet cannot show.
      */
      const notes = chosen.length === 1 ? note || undefined : undefined
      const failed: PickerCandidate[] = []
      let lastError = ''
      for (const item of chosen) {
        const value = values[item.id] ?? BLANK_LINE
        try {
          if (kind === 'owned') {
            await putEventOwnedEquipment(eventId, item.id, { quantity: value.quantity, notes })
          } else {
            await putManualRental(eventId, item.id, {
              quantity_audio: value.audio,
              quantity_lighting: value.light,
              notes,
            })
          }
        } catch (err) {
          failed.push(item)
          lastError = (err as Error).message
        }
      }
      if (failed.length > 0) {
        setChosen(failed)
        /* The lines that *did* land are rows on the sheet behind this one, and
           they must be there when it closes — or when it does not. Invalidating
           only on success left a partial batch invisible until the next refetch. */
        await invalidate()
        throw new Error(
          `${chosen.length - failed.length} of ${chosen.length} lines were added. ${failed.length} failed: ${lastError}`,
        )
      }
    },
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    /* The sheet stays open with every value intact. A phone edit happens in a loading
       bay on a bad connection, and losing the draft retypes the form (patterns.md §7d). */
    onError: (err: Error) => setError(err.message),
  })

  const remove = useMutation({
    mutationFn: () =>
      row?.source === 'rented' ? deleteManualRental(eventId, row.id) : deleteEventOwnedEquipment(eventId, row!.id),
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const ready =
    row != null || linesReady(source, chosen.map((item) => item.id), values)

  /*
    A rented line is read-only here at every width — the desktop row editor does the
    same thing, offering a handoff rather than the fields. The quantities live on the
    rental order because that is the document they are part of.
  */
  if (row?.source === 'rented') {
    return (
      <Sheet onClose={onClose} open subtitle={`rented · ${row.type}`} title={row.name}>
        <p className="text-sm text-zinc-400">
          This line is on the rental order. Its quantities are edited there, so the order and the plan cannot
          disagree.
        </p>
        {onOpenRental && (
          <Button className="w-full" onClick={onOpenRental} variant="outline">
            See on rental order
          </Button>
        )}
      </Sheet>
    )
  }

  return (
    <>
    <Sheet
      footer={
        readOnly ? undefined : (
          /* Delete kept apart from the confirm, which is §2's rule written for a mouse
             and matters more here: at 375px a destructive control beside the confirm is
             10px from the corner a thumb rests on (patterns.md §7d). */
          <div className="flex w-full items-center gap-3">
            {row && (
              <Button
                className="text-red-400"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
                size="md"
                variant="ghost"
              >
                Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button className="flex-1" disabled={save.isPending || !ready} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : row ? 'Save line' : many ? `Add ${chosen.length} lines` : 'Add line'}
            </Button>
          </div>
        )
      }
      onClose={onClose}
      open
      subtitle={
        row ? [`owned`, row.description || row.type, `${row.have} in stock`].join(' · ') : undefined
      }
      title={row ? row.name : many ? `Add ${chosen.length} lines` : 'Add a line'}
    >
      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Only while adding. On an existing line the source is fixed: moving a line
          between the two catalogs is a delete and a create against different lists,
          which the desktop editor also refuses to call an edit. */}
      {!row && (
        <>
          <FieldStack label="Source" width="grow">
            <Select
              onChange={(event) => {
                // The two catalogs are different lists with different quantity
                // shapes, so the whole batch goes with the source.
                setSource(event.target.value as EquipmentRow['source'])
                setChosen([])
                setValues({})
              }}
              value={source}
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
              record={chosen.length === 1 ? { name: chosen[0].name, qualifier: chosen[0].description } : undefined}
            />
          </FieldStack>
        </>
      )}

      {/* At one line these are the fields the sheet has always had. More than one
          and they move into the block below, one row per item — the same
          construction as the desk, because `ui/Drawer`'s own rule says a batch
          reads the same at both widths. */}
      {!many &&
        ((row?.source ?? source) === 'owned' ? (
          <FieldStack label="Quantity" width="count">
            <Input
              disabled={readOnly}
              min={0}
              onChange={(event) =>
                row ? setQuantity(Math.max(0, Number(event.target.value))) : setSingle({ quantity: Math.max(0, Number(event.target.value)) })
              }
              type="number"
              value={row ? quantity : single.quantity}
            />
          </FieldStack>
        ) : (
          <div className="flex gap-2.5">
            <FieldStack label="Audio" width="grow">
              <Input
                min={0}
                onChange={(event) => setSingle({ audio: Math.max(0, Number(event.target.value)) })}
                type="number"
                value={single.audio}
              />
            </FieldStack>
            <FieldStack label="Light" width="grow">
              <Input
                min={0}
                onChange={(event) => setSingle({ light: Math.max(0, Number(event.target.value)) })}
                type="number"
                value={single.light}
              />
            </FieldStack>
          </div>
        ))}

      {many && (
        <div className="rounded-md border border-zinc-800">
          {chosen.map((item) => {
            const value = values[item.id] ?? BLANK_LINE
            return (
              <div className="flex items-center gap-2 border-b border-zinc-800/60 px-2.5 py-2 last:border-b-0" key={item.id}>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                  {item.name}
                  {item.description && <span className="text-zinc-500"> · {item.description}</span>}
                </span>
                {source === 'owned' ? (
                  <PhoneNumber
                    label="Qty"
                    onChange={(quantity) => setValues((prev) => ({ ...prev, [item.id]: { ...value, quantity } }))}
                    value={value.quantity}
                  />
                ) : (
                  <>
                    <PhoneNumber
                      label="A"
                      onChange={(audio) => setValues((prev) => ({ ...prev, [item.id]: { ...value, audio } }))}
                      value={value.audio}
                    />
                    <PhoneNumber
                      label="L"
                      onChange={(light) => setValues((prev) => ({ ...prev, [item.id]: { ...value, light } }))}
                      value={value.light}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* The warning belongs to this line, so it is in the sheet rather than in the
          strip — a strip states the surface's verdict, not one row's. */}
      {row && row.source === 'owned' && quantity > row.have && (
        <div className="rounded-md border border-red-500/40 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
          Exceeds the {row.have} you own by {quantity - row.have} — the extra go on the rental order.
        </div>
      )}

      {/* A batch carries no per-line note — five note fields is a form nobody
          fills in — so the field is absent rather than present and discarded,
          which is what it was doing. The desk hides it on the same test. */}
      {!many && (
        <FieldStack label="Note" width="grow">
          <Input disabled={readOnly} onChange={(event) => setNote(event.target.value)} value={note} />
        </FieldStack>
      )}
    </Sheet>

    {/*
      A **second sheet layer**, not a replacement of this one's contents. The add
      sheet stays mounted, so a draft typed in a loading bay on a bad connection
      survives a visit to the catalog; replacing the contents in place would need
      a back control and a navigation stack inside a component that has six props
      on purpose. The construction already ships — D4's browse opens a sheet from
      inside a sheet, and `useEscapeToClose` already keeps the overlay stack — so
      Back, Escape and the scrim close the picker only.
    */}
    {picking && (
      <CatalogItemPicker
        candidates={candidates}
        emptyMessage={
          source === 'owned'
            ? 'Your owned-gear catalog is empty — add items on the Inventory page first.'
            : 'Nothing in this catalog yet.'
        }
        loading={source === 'owned' ? ownedCatalogLoading : rentalCatalogLoading}
        onChoose={choose}
        onClose={() => setPicking(false)}
        onSheet={onSheet}
        selection={chosen.map((item) => item.id)}
      />
    )}
    </>
  )
}

/**
 * A batch line's number in the hand: the name at the left, the editable value at
 * the right edge — `components.md` §`ui/Drawer`'s own rule, which already says a
 * batch reads the same at both widths, so this is not a phone composition.
 */
function PhoneNumber({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-none items-center gap-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <Input
        className="w-14"
        min={0}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
        type="number"
        value={value}
      />
    </label>
  )
}
