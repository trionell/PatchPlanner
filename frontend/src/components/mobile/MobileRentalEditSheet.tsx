import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { putManualRental } from '../../api/rentals'
import type { EventRental, InventoryItem } from '../../types'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { MicroLabel } from '../ui/Label'
import { Sheet } from '../ui/Sheet'

/**
 * The manual part of one rental line, edited on site (Wave 6c, audit.md M4).
 *
 * A rental line has two halves and only one of them is editable anywhere: the
 * **plan** half is derived from the patch and the rig and changes when they do, and the
 * **manual** half is what someone adds by hand. That is why there is no delete here —
 * a plan-derived line is not deletable on the desk either, and zeroing the manual
 * quantities is what removes a hand-added one.
 *
 * Separate from `MobileEquipmentEditSheet` on purpose (`components.md` §5): two fields
 * against three, a delete against none, and a second read-only shape on that one and
 * not this one.
 */
export function MobileRentalEditSheet({
  eventId,
  item,
  catalog,
  readOnly,
  onClose,
}: {
  eventId: number
  /**
   * The line being edited. **Omitted means adding a manual one** — add and edit are one
   * construction (`patterns.md` §2), as they are on the desktop.
   */
  item?: EventRental
  /** Offered only while adding. */
  catalog: InventoryItem[]
  /** A role that may not edit gets the same sheet with no confirm (P7). */
  readOnly: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [itemId, setItemId] = useState('')
  const [audio, setAudio] = useState(item?.manual_quantity_audio ?? 0)
  const [light, setLight] = useState(item?.manual_quantity_lighting ?? 0)
  const [note, setNote] = useState(item?.manual_notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      putManualRental(eventId, item?.inventory_item_id ?? Number(itemId), {
        quantity_audio: audio,
        quantity_lighting: light,
        notes: note || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
      onClose()
    },
    /* Open, intact, error above the fields — the loading-bay rule (patterns.md §7d). */
    onError: (err: Error) => setError(err.message),
  })

  const planAudio = item ? item.quantity_audio - item.manual_quantity_audio : 0
  const planLight = item ? item.quantity_lighting - item.manual_quantity_lighting : 0
  const ready = item != null || (itemId !== '' && (audio > 0 || light > 0))

  return (
    <Sheet
      footer={
        readOnly ? undefined : (
          <Button className="w-full" disabled={save.isPending || !ready} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : item ? 'Save line' : 'Add line'}
          </Button>
        )
      }
      onClose={onClose}
      open
      subtitle={item ? `${item.price_ex_vat.toFixed(2)} kr · ${item.total_quantity} on the order` : undefined}
      title={item ? (item.inventory_item_name ?? 'Rental line') : 'Add a manual line'}
    >
      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {!item && (
        <FieldStack label="Catalog item" width="grow">
          <Select onChange={(event) => setItemId(event.target.value)} value={itemId}>
            <option value="">Select item…</option>
            {catalog.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.category_name ? `${entry.category_name} — ${entry.name}` : entry.name}
              </option>
            ))}
          </Select>
        </FieldStack>
      )}

      {/* What the plan already asks for, stated so the manual numbers read as an
          addition rather than as the whole line. Not editable anywhere. */}
      {item && (
        <div className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
          <MicroLabel>From the plan</MicroLabel>
          <span className="ml-auto font-mono text-xs tabular-nums text-zinc-300">
            audio {planAudio} · lighting {planLight}
          </span>
        </div>
      )}

      {item?.is_discontinued && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200">
          No longer in the price list — this line will not survive the next import.
        </div>
      )}
      {item?.is_over_stock && (
        <div className="rounded-md border border-red-500/40 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
          More than the supplier has in stock.
        </div>
      )}

      {/* Side by side, because a manual audio count and a manual light count are one
          idea — the same rule that pairs universe with address (patterns.md §7d). */}
      <div className="flex gap-2.5">
        <FieldStack label="Manual audio" width="grow">
          <Input
            disabled={readOnly}
            min={0}
            onChange={(event) => setAudio(Math.max(0, Number(event.target.value)))}
            type="number"
            value={audio}
          />
        </FieldStack>
        <FieldStack label="Manual light" width="grow">
          <Input
            disabled={readOnly}
            min={0}
            onChange={(event) => setLight(Math.max(0, Number(event.target.value)))}
            type="number"
            value={light}
          />
        </FieldStack>
      </div>

      <FieldStack label="Note" width="grow">
        <Input disabled={readOnly} onChange={(event) => setNote(event.target.value)} value={note} />
      </FieldStack>
    </Sheet>
  )
}
