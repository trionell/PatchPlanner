import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Search } from 'lucide-react'
import { listEventInventoryItems } from '../../api/inventory'
import { listEventOwnedEquipment, listOwnedItems } from '../../api/owned'
import { getRentalSummary } from '../../api/rentals'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { equipmentRows, quantitySplit, rowKey } from '../../lib/equipmentRows'
import { CondensedListRow } from '../mobile/CondensedListRow'
import { MobileEquipmentEditSheet } from '../mobile/MobileEquipmentEditSheet'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { type EquipmentFilter, EquipmentStatusRail } from './EquipmentStatusRail'
import { MobilePanel } from '../ui/MobilePanel'
import { PatchPanel } from '../ui/PatchPanel'
import { EquipmentSheet } from './EquipmentSheet'

/**
 * Everything coming to the gig beyond the patch and the rig (Slice 28 US2).
 *
 * Two cards — owned gear, rented extras — became one sheet with a `Source`
 * column. They were two because they come from two endpoints, which is a reason
 * the person planning the show does not have.
 */
export function EquipmentTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const isMobile = useIsMobile()
  const { openTab } = useEventTab()
  /*
    A role question, and only a role question (Wave 6c, audit.md M4).

    This had the viewport `&&`-ed into the role until Slice 35, which made every check
    say *you may not* when the truth was *nobody built the phone form yet* — and the two
    have different answers (patterns.md §7g, P9). An equipment line is a quantity and a
    note, which is a form over a row, which is what a phone is good at. Slice 21's FR-012
    is superseded.
  */
  const editable = !readOnly

  const ownedCatalogQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })
  const ownedLinesQuery = useQuery({ queryKey: ['owned-equipment', eventId], queryFn: () => listEventOwnedEquipment(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const allInventoryQuery = useQuery({
    queryKey: ['inventory-all-items', eventId],
    queryFn: () => listEventInventoryItems(eventId),
  })

  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  // Keyed by the composite `rowKey`, because owned and rented ids overlap.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  // The phone's strip filter — the desktop's lives in `EquipmentSheet` (data-model.md §3).
  const [mobileFilter, setMobileFilter] = useState<EquipmentFilter>(null)

  if (isMobile) {
    const rows = equipmentRows(ownedLinesQuery.data, rentalQuery.data?.items)
    const q = search.trim().toLowerCase()
    const visible = rows.filter(
      (row) =>
        (mobileFilter !== 'problems' || (row.source === 'owned' && row.over)) &&
        (!q ||
          row.name.toLowerCase().includes(q) ||
          (row.description ?? '').toLowerCase().includes(q) ||
          row.type.toLowerCase().includes(q)),
    )
    const editing = editingKey ? rows.find((row) => rowKey(row) === editingKey) : undefined
    return (
      <>
        <MobilePanel
          title="Equipment"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Find a line…"
          /* Hidden, not disabled, for a role that cannot act (P7). */
          primaryAction={
            editable ? (
              <button
                aria-label="Add line"
                className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
                onClick={() => setAdding(true)}
                type="button"
              >
                <Plus className="h-5 w-5" />
              </button>
            ) : undefined
          }
          strip={<EquipmentStatusRail rows={rows} filter={mobileFilter} onFilterChange={readOnly ? undefined : setMobileFilter} />}
        >
          {visible.map((row) => {
            const split = row.source === 'rented' ? quantitySplit(row) : undefined
            return (
              <CondensedListRow
                key={rowKey(row)}
                title={row.name}
                /*
                  Ranked, not appended (patterns.md §7c). The line already joined
                  five facts onto one truncating line and the description would
                  be a sixth, so something had to lose its standing slot — and it
                  is `type`, the coarsest of them, which is what the description
                  was being substituted for in the first place. It keeps the
                  slot whenever there is no description, so nothing is lost; it
                  is paid for.

                  The over-owned warning is conditional rather than ranked: an
                  alarm is never dropped to make room for detail.
                */
                subtitle={[
                  row.description || row.type,
                  row.source,
                  split ?? String(row.qty),
                  row.source === 'owned' && row.over ? `exceeds owned ${row.have}` : undefined,
                  row.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                /* Always tappable, whatever the role. A phone row is a truncation — the
                   type, the note and the stock are behind the tap — so a viewer who
                   cannot open it cannot read the plan at all (audit.md M4). */
                onClick={() => setEditingKey(rowKey(row))}
                trailing={editable ? <Pencil className="h-4 w-4 text-zinc-500" /> : undefined}
              />
            )
          })}
          {visible.length === 0 && (
            <p className="px-3 py-3 text-sm text-zinc-500">
              {rows.length === 0
                ? 'Nothing beyond the patch and the rig yet.'
                : mobileFilter
                  ? 'Nothing left to fix — tap the strip to show everything.'
                  : 'No matches.'}
            </p>
          )}
        </MobilePanel>

        {(editing || adding) && (
          <MobileEquipmentEditSheet
            eventId={eventId}
            onClose={() => {
              setEditingKey(null)
              setAdding(false)
            }}
            onOpenRental={() => openTab('rentals')}
            ownedCatalog={ownedCatalogQuery.data ?? []}
            planned={rows}
            readOnly={!editable}
            rentalCatalog={allInventoryQuery.data ?? []}
            row={editing}
          />
        )}
      </>
    )
  }

  return (
    <PatchPanel
      bar={
        <>
          <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Equipment</span>

          <div className="relative min-w-[10rem] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              size="sm"
              className="pl-7"
              placeholder="Find a line…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <span className="flex-1" />

          {editable && (
            <Button size="xs" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Line
            </Button>
          )}
        </>
      }
    >
      <EquipmentSheet
        eventId={eventId}
        owned={ownedLinesQuery.data}
        rental={rentalQuery.data?.items}
        ownedCatalog={ownedCatalogQuery.data ?? []}
        rentalCatalog={allInventoryQuery.data ?? []}
        search={search}
        adding={adding}
        onAddingChange={setAdding}
        onOpenRental={() => openTab('rentals')}
        readOnly={!editable}
      />
    </PatchPanel>
  )
}
