import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteEventOwnedEquipment, putEventOwnedEquipment } from '../../api/owned'
import { deleteManualRental, putManualRental } from '../../api/rentals'
import type { EquipmentRow } from '../../lib/equipmentRows'
import type { InventoryItem, OwnedItem } from '../../types'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
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
  ownedCatalog,
  rentalCatalog,
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
  ownedCatalog: OwnedItem[]
  rentalCatalog: InventoryItem[]
  /** A role that may not edit gets the same sheet with no confirm and no delete (P7). */
  readOnly: boolean
  onClose: () => void
  /** Where a rented line is actually edited. Absent hides the handoff, not the sheet. */
  onOpenRental?: () => void
}) {
  const queryClient = useQueryClient()
  const [source, setSource] = useState<EquipmentRow['source']>(row?.source ?? 'owned')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState(row?.source === 'owned' ? row.qty : 1)
  const [audio, setAudio] = useState(0)
  const [light, setLight] = useState(0)
  const [note, setNote] = useState(row?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['owned-equipment', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['owned-items'] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const targetId = row?.id ?? Number(itemId)
      const notes = note || undefined
      if ((row?.source ?? source) === 'owned') {
        await putEventOwnedEquipment(eventId, targetId, { quantity, notes })
        return
      }
      await putManualRental(eventId, targetId, { quantity_audio: audio, quantity_lighting: light, notes })
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

  const ready = row != null || (itemId !== '' && (source === 'owned' ? quantity > 0 : audio > 0 || light > 0))

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
              {save.isPending ? 'Saving…' : row ? 'Save line' : 'Add line'}
            </Button>
          </div>
        )
      }
      onClose={onClose}
      open
      subtitle={row ? `owned · ${row.type} · ${row.have} in stock` : undefined}
      title={row ? row.name : 'Add a line'}
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
                // Switching source invalidates the chosen item — the two catalogs are
                // different lists — so the picker resets rather than pointing at an id
                // from the other one.
                setSource(event.target.value as EquipmentRow['source'])
                setItemId('')
              }}
              value={source}
            >
              <option value="owned">owned</option>
              <option value="rented">rented</option>
            </Select>
          </FieldStack>
          <FieldStack label="Item" width="grow">
            <Select onChange={(event) => setItemId(event.target.value)} value={itemId}>
              <option value="">Select item…</option>
              {source === 'owned'
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
        </>
      )}

      {(row?.source ?? source) === 'owned' ? (
        <FieldStack label="Quantity" width="count">
          <Input
            disabled={readOnly}
            min={0}
            onChange={(event) => setQuantity(Math.max(0, Number(event.target.value)))}
            type="number"
            value={quantity}
          />
        </FieldStack>
      ) : (
        <div className="flex gap-2.5">
          <FieldStack label="Audio" width="grow">
            <Input
              min={0}
              onChange={(event) => setAudio(Math.max(0, Number(event.target.value)))}
              type="number"
              value={audio}
            />
          </FieldStack>
          <FieldStack label="Light" width="grow">
            <Input
              min={0}
              onChange={(event) => setLight(Math.max(0, Number(event.target.value)))}
              type="number"
              value={light}
            />
          </FieldStack>
        </div>
      )}

      {/* The warning belongs to this line, so it is in the sheet rather than in the
          strip — a strip states the surface's verdict, not one row's. */}
      {row && row.source === 'owned' && quantity > row.have && (
        <div className="rounded-md border border-red-500/40 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
          Exceeds the {row.have} you own by {quantity - row.have} — the extra go on the rental order.
        </div>
      )}

      <FieldStack label="Note" width="grow">
        <Input disabled={readOnly} onChange={(event) => setNote(event.target.value)} value={note} />
      </FieldStack>
    </Sheet>
  )
}
