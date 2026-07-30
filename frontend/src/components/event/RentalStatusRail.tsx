import { rentalStatusState } from '../../lib/rentalOrder'
import { formatPercent } from '../../lib/rentalPricing'
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
        onFilterChange && (state !== 'clean' || filter)
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

      {/*
        The derivation, left to right, ending on the number you came for — the
        only one at full contrast (Slice 31 FR-023). The day rate stays because
        it is what every line in the sheet above adds up to, and a strip whose
        total no longer matches the column above it is a strip nobody trusts.
      */}
      <span className="font-mono tabular-nums text-zinc-500">
        {(summary?.subtotal_ex_vat ?? 0).toFixed(2)} kr/day
      </span>
      {summary?.pricing && (
        <>
          <span className="text-zinc-700">·</span>
          {/* Always shown: the day count is the fact Slice 30 earned, and a
              five-day hire priced at ×1.00 is worth seeing. */}
          <span className="font-mono tabular-nums text-zinc-500">
            {summary.pricing.billed_days} {summary.pricing.billed_days === 1 ? 'day' : 'days'}
            {summary.pricing.rent_factor_source !== 'none' && ` ×${summary.pricing.rent_factor.toFixed(2)}`}
          </span>
          {/* The one case the slice exists to make visible, and it would
              otherwise be silent. Amber WORDS — the strip's tint stays the stock
              verdict it has always been (FR-024). */}
          {summary.pricing.rent_factor_source === 'none' && (
            <span className="font-mono tabular-nums text-amber-300">×1.00 no rate card</span>
          )}
          {summary.pricing.discount_percent > 0 && (
            <span className="font-mono tabular-nums text-zinc-500">
              −{formatPercent(summary.pricing.discount_percent)}%
            </span>
          )}
          <span className="font-mono tabular-nums text-zinc-200">
            {summary.pricing.total_ex_vat.toFixed(2)} kr ex VAT
          </span>
          <span className="font-mono tabular-nums text-zinc-500">
            {summary.pricing.total_inc_vat.toFixed(2)} inc
          </span>
        </>
      )}

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
