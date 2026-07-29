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
import { MobileRentalEditSheet } from '../mobile/MobileRentalEditSheet'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { hasManualPart } from '../../lib/rentalOrder'
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
  /*
    A role question, and only a role question (Wave 6c, audit.md M4). See the same note
    on `EquipmentTab`: the viewport was `&&`-ed into the role until Slice 35, and a manual
    rental quantity is a form over a row. Slice 21's FR-012 is superseded.
  */
  const editable = !readOnly

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
  const [editingId, setEditingId] = useState<number | null>(null)
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

  /*
    The three exports, as overflow entries (Wave 6c, F2 · M11).

    On the desktop they are three `xs` outline buttons in the bar. At 375px the bar has
    317px and a title plus three labelled buttons plus an add control does not fit, so
    they take the shape §7b already specified for this: a `⋯` opening a run of labelled
    rows. The price-list export stays conditional on the catalog having come from one,
    which is the desktop's rule, not a phone rule.
  */
  const exportActions = [
    {
      label: 'Export .xlsx',
      hint: 'download',
      icon: <FileSpreadsheet className="h-4 w-4" />,
      onClick: () => window.location.assign(rentalExportXlsxUrl(eventId)),
    },
    {
      label: 'Export PDF',
      hint: 'download',
      icon: <FileDown className="h-4 w-4" />,
      onClick: () => window.location.assign(rentalExportPdfUrl(eventId)),
    },
    ...(canExportPriceList
      ? [
          {
            label: 'Export price list',
            hint: 'LL.xlsx',
            icon: <Cable className="h-4 w-4" />,
            onClick: () => exportMutation.mutate(),
          },
        ]
      : []),
  ]

  if (isMobile) {
    const items = rentalQuery.data?.items ?? []
    const q = search.trim().toLowerCase()
    const visible = items.filter(
      (item) =>
        (mobileFilter !== 'problems' || item.is_over_stock || item.is_discontinued) &&
        (!q || item.inventory_item_name.toLowerCase().includes(q)),
    )
    const editing = items.find((item) => item.inventory_item_id === editingId)
    return (
      /*
        The hand-built total row is gone. It was a strip in intent — a sum in a
        `bg-zinc-900` card at the foot of the list — in the Control role's colour,
        outside the component that already does this four times (audit.md M3).
        `RentalStatusRail` states the same number *and* whether the order can be sent.
      */
      <>
      <MobilePanel
        title="Rental order"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Find a line…"
        /* Downloads, and the surface's own paper. All three do a thing and are
           finished, so they are the overflow rather than three outline buttons in a
           317px bar (contracts/phone-surfaces.md §1). */
        overflow={exportActions}
        /* Hidden, not disabled, for a role that cannot act (P7). */
        primaryAction={
          editable ? (
            <button
              aria-label="Add manual line"
              className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
              onClick={() => setAdding(true)}
              type="button"
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : undefined
        }
        strip={
          <RentalStatusRail
            summary={rentalQuery.data}
            items={items}
            manualCount={items.filter(hasManualPart).length}
            filter={mobileFilter}
            onFilterChange={readOnly ? undefined : setMobileFilter}
          />
        }
      >
        {/* The export can now be started from a phone, so its two outcomes need
            somewhere to land here too. The dropped lines stay a block rather than being
            compressed into the strip: they are a list somebody has to act on
            (design/patterns.md §5), and that is true in a loading bay as well. */}
        {exportError && (
          <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">Export failed: {exportError}</p>
        )}
        {unplacedLines.length > 0 && (
          <div className="border-b border-zinc-800 px-3 py-2 text-xs text-amber-200">
            <p className="font-semibold text-amber-100">
              The exported file is missing {unplacedLines.length} line{unplacedLines.length > 1 ? 's' : ''} — add
              these to the order by hand:
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {unplacedLines.map((line) => (
                <li key={line.inventory_item_id}>
                  {line.inventory_item_name} — audio {line.quantity_audio}, lighting {line.quantity_lighting}
                </li>
              ))}
            </ul>
          </div>
        )}

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
            /* Always tappable, whatever the role: the price, the plan/manual split and
               the note are all behind the tap (audit.md M4). */
            onClick={() => setEditingId(item.inventory_item_id)}
            trailing={item.is_over_stock ? <span className="text-[10px] font-bold text-red-400">Over stock</span> : undefined}
          />
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-3 text-sm text-zinc-500">
            {items.length === 0
              ? 'No rental items yet.'
              : mobileFilter
                ? 'Nothing left to fix — tap the strip to show everything.'
                : 'No matches.'}
          </p>
        )}
      </MobilePanel>

      {(editing || adding) && (
        <MobileRentalEditSheet
          catalog={allInventoryQuery.data ?? []}
          eventId={eventId}
          item={editing}
          onClose={() => {
            setEditingId(null)
            setAdding(false)
          }}
          readOnly={!editable}
        />
      )}
      </>
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
