import { rentalStatusState } from '../../lib/rentalOrder'
import type { EventRental, RentalSummary } from '../../types'
import { Pill } from '../ui/SheetTable'
import { StatusStrip } from './StatusStrip'

/**
 * The strip that closes the Rental panel, stating whether the order can be sent
 * (Slice 28 US1).
 *
 * Built like `LightingStatusRail`: top border only, ground *and* rule tinted, so
 * the state reads from the edge of vision rather than only on reading.
 *
 * It also replaces the totals row that used to sit in the table body. A row whose
 * cells are sums is data-shaped chrome — at three hundred lines it is three
 * hundred rows away from the number you wanted, and it would sort and export with
 * the real rows the moment anyone added either.
 */

const STRIP_TINT = {
  clean: 'border-zinc-800 bg-zinc-950/60',
  discontinued: 'border-amber-500/40 bg-amber-500/[0.05]',
  over: 'border-red-400/40 bg-red-500/[0.05]',
} as const

export type RentalFilter = 'problems' | null

interface RentalStatusRailProps {
  summary?: RentalSummary
  items: EventRental[]
  manualCount: number
  filter: RentalFilter
  /** Absent for a read-only role, which cannot act on what the strip reports. */
  onFilterChange?: (filter: RentalFilter) => void
}

export function RentalStatusRail({ summary, items, manualCount, filter, onFilterChange }: RentalStatusRailProps) {
  const state = rentalStatusState(items)
  const overStock = items.filter((item) => item.is_over_stock)
  const discontinued = items.filter((item) => item.is_discontinued)

  const first = overStock[0] ?? discontinued[0]
  const problems = overStock.length + discontinued.length
  const describe = (item: EventRental): string =>
    item.is_over_stock
      ? `${item.inventory_item_name} needs ${item.total_quantity}, renter has ${item.quantity_available}`
      : `${item.inventory_item_name} is no longer in the price list`

  return (
    <StatusStrip
      tint={STRIP_TINT[state]}
      filter={
        onFilterChange && state !== 'clean'
          ? { label: filter ? 'Show all' : 'Show only problems', onClick: () => onFilterChange(filter ? null : 'problems') }
          : undefined
      }
    >
      {state === 'clean' && <Pill className="bg-emerald-500/15 text-emerald-300">in stock</Pill>}
      {state === 'discontinued' && (
        <Pill className="bg-amber-500/15 text-amber-300">{discontinued.length} discontinued</Pill>
      )}
      {state === 'over' && <Pill className="bg-red-500/15 text-red-300">{overStock.length} over stock</Pill>}

      <span className="font-mono tabular-nums text-zinc-200">
        {summary?.total_items ?? items.length} {(summary?.total_items ?? items.length) === 1 ? 'line' : 'lines'}
      </span>
      <span className="font-mono tabular-nums text-zinc-500">{summary?.total_quantity ?? 0} pieces</span>
      <span className="font-mono tabular-nums text-zinc-200">
        {(summary?.total_ex_vat ?? 0).toFixed(2)} kr ex VAT
      </span>

      {manualCount > 0 && (
        <span className="text-zinc-500">
          {manualCount} manual {manualCount === 1 ? 'line' : 'lines'}
        </span>
      )}
      {/* Counted in every state — a discontinued line is still worth knowing
          about while an over-stock line is what tints the strip. */}
      {state !== 'discontinued' && discontinued.length > 0 && (
        <span className="text-zinc-500">{discontinued.length} discontinued</span>
      )}

      {state !== 'clean' && first && (
        <>
          <span className={state === 'over' ? 'text-red-300' : 'text-amber-300'}>{describe(first)}</span>
          {problems > 1 && <span className="text-zinc-500">+{problems - 1} more</span>}
        </>
      )}

    </StatusStrip>
  )
}
