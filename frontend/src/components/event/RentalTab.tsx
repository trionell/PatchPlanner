import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Cable, FileDown, FileSpreadsheet, Plus, Search } from 'lucide-react'
import { getEventInventory, listEventInventoryItems } from '../../api/inventory'
import {
  getRentalExportReport,
  getRentalSummary,
  rentalExportPdfUrl,
  rentalExportUrl,
  rentalExportXlsxUrl,
} from '../../api/rentals'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { UnplacedLine } from '../../types'
import { CondensedListRow } from '../mobile/CondensedListRow'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { type RentalFilter, RentalStatusRail } from './RentalStatusRail'
import { MobilePanel } from '../ui/MobilePanel'
import { PatchPanel } from '../ui/PatchPanel'
import { RentalSheet } from './RentalSheet'

/**
 * The rental order (Slice 28 US1).
 *
 * The order is *derived*: every quantity on it comes from the patch and the rig
 * except the manual lines. So the tab owns the queries and the exports, and the
 * sheet owns the one thing anybody types here.
 *
 * **No Print button**, deliberately: this tab has no print sheet, and the PDF
 * export is its paper. The exports take the Print slot in the bar
 * (design/patterns.md §1, research.md R5).
 */
export function RentalTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const isMobile = useIsMobile()
  const { openTab } = useEventTab()
  // Rental Order is a read-only lookup on mobile for every role (Slice 21 FR-012).
  const editable = !readOnly && !isMobile

  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const allInventoryQuery = useQuery({
    queryKey: ['inventory-all-items', eventId],
    queryFn: () => listEventInventoryItems(eventId),
  })
  // Shares EventInventoryCard's cache entry. The price-list export is offered
  // only for a catalog actually imported from one; every other inventory gets
  // the PDF and spreadsheet instead of a dead end.
  const inventoryQuery = useQuery({ queryKey: ['event-inventory', eventId], queryFn: () => getEventInventory(eventId) })
  const canExportPriceList = inventoryQuery.data?.sourceFormat === 'll'

  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [unplacedLines, setUnplacedLines] = useState<UnplacedLine[]>([])
  const [exportError, setExportError] = useState('')
  // The phone's strip filter — the desktop's lives in `RentalSheet` (data-model.md §3).
  const [mobileFilter, setMobileFilter] = useState<RentalFilter>(null)

  const exportMutation = useMutation({
    mutationFn: () => getRentalExportReport(eventId),
    onSuccess: (report) => {
      setExportError('')
      setUnplacedLines(report.unplaced_lines)
      // The browser handles the download natively via the attachment URL.
      window.location.assign(rentalExportUrl(eventId))
    },
    onError: (error) => {
      setUnplacedLines([])
      setExportError(error.message)
    },
  })

  if (isMobile) {
    const items = rentalQuery.data?.items ?? []
    const q = search.trim().toLowerCase()
    const visible = items.filter(
      (item) =>
        (mobileFilter !== 'problems' || item.is_over_stock || item.is_discontinued) &&
        (!q || item.inventory_item_name.toLowerCase().includes(q)),
    )
    return (
      /*
        The hand-built total row is gone. It was a strip in intent — a sum in a
        `bg-zinc-900` card at the foot of the list — in the Control role's colour,
        outside the component that already does this four times (audit.md M3).
        `RentalStatusRail` states the same number *and* whether the order can be sent.
      */
      <MobilePanel
        title="Rental order"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Find a line…"
        strip={
          <RentalStatusRail
            summary={rentalQuery.data}
            items={items}
            manualCount={0}
            filter={mobileFilter}
            onFilterChange={setMobileFilter}
          />
        }
      >
        {visible.map((item) => (
          <CondensedListRow
            key={item.inventory_item_id}
            title={
              <>
                {item.inventory_item_name}
                {item.is_discontinued && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-400">discontinued</span>
                )}
              </>
            }
            subtitle={`Audio ${item.quantity_audio} · Lighting ${item.quantity_lighting} · ${item.subtotal_ex_vat.toFixed(2)} kr`}
            trailing={item.is_over_stock ? <span className="text-[10px] font-bold text-red-400">Over stock</span> : undefined}
          />
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-3 text-sm text-zinc-500">{items.length === 0 ? 'No rental items yet.' : 'No matches.'}</p>
        )}
      </MobilePanel>
    )
  }

  return (
    <PatchPanel
      bar={
        <>
          <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Rental order</span>

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

          <Button size="xs" variant="outline" onClick={() => window.location.assign(rentalExportXlsxUrl(eventId))}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Export .xlsx
          </Button>
          <Button size="xs" variant="outline" onClick={() => window.location.assign(rentalExportPdfUrl(eventId))}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Export PDF
          </Button>
          {canExportPriceList && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              <Cable className="mr-1.5 h-3.5 w-3.5" />
              {exportMutation.isPending ? 'Exporting…' : 'Export LL.xlsx'}
            </Button>
          )}

          <span className="flex-1" />

          {editable && (
            <Button size="xs" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Manual line
            </Button>
          )}
        </>
      }
    >
      {exportError && (
        <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">Export failed: {exportError}</p>
      )}

      {/*
        The dropped lines are a list somebody has to act on, so they stay a block
        rather than being compressed into the strip (design/patterns.md §5).
      */}
      {unplacedLines.length > 0 && (
        <div className="border-b border-zinc-800 px-3 py-2">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-2 text-xs text-amber-200">
            <p className="font-semibold text-amber-100">
              The exported file is missing {unplacedLines.length} line{unplacedLines.length > 1 ? 's' : ''} — add
              these to the order by hand:
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {unplacedLines.map((line) => (
                <li key={line.inventory_item_id}>
                  {line.inventory_item_name} — audio {line.quantity_audio}, lighting {line.quantity_lighting}{' '}
                  <span className="text-zinc-400">
                    ({line.reason === 'discontinued' ? 'no longer in the price list' : 'price-list row changed since the last import'})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <RentalSheet
        eventId={eventId}
        summary={rentalQuery.data}
        catalog={allInventoryQuery.data ?? []}
        search={search}
        adding={adding}
        onAddingChange={setAdding}
        onOpenEquipment={() => openTab('equipment')}
        readOnly={!editable}
      />
    </PatchPanel>
  )
}
