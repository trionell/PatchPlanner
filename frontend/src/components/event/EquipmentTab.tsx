import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { listEventInventoryItems } from '../../api/inventory'
import { listEventOwnedEquipment, listOwnedItems } from '../../api/owned'
import { getRentalSummary } from '../../api/rentals'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { equipmentRows, quantitySplit, rowKey } from '../../lib/equipmentRows'
import { CondensedListRow } from '../mobile/CondensedListRow'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
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
  // Equipment is a read-only lookup on mobile for every role (Slice 21 FR-012) —
  // not just a viewer-role restriction, so this gate is separate from readOnly.
  const editable = !readOnly && !isMobile

  const ownedCatalogQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })
  const ownedLinesQuery = useQuery({ queryKey: ['owned-equipment', eventId], queryFn: () => listEventOwnedEquipment(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const allInventoryQuery = useQuery({
    queryKey: ['inventory-all-items', eventId],
    queryFn: () => listEventInventoryItems(eventId),
  })

  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  if (isMobile) {
    const rows = equipmentRows(ownedLinesQuery.data, rentalQuery.data?.items)
    return (
      <div className="space-y-1">
        {rows.map((row) => {
          const split = row.source === 'rented' ? quantitySplit(row) : undefined
          return (
            <CondensedListRow
              key={rowKey(row)}
              title={row.name}
              subtitle={[
                row.source,
                row.type,
                split ?? String(row.qty),
                row.source === 'owned' && row.over ? `exceeds owned ${row.have}` : undefined,
                row.note,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )
        })}
        {rows.length === 0 && <p className="px-1 py-2 text-sm text-zinc-500">Nothing beyond the patch and the rig yet.</p>}
      </div>
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
