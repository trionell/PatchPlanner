import { type EquipmentRow, overOwnedCount } from '../../lib/equipmentRows'
import { Button } from '../ui/Button'
import { Pill } from '../ui/SheetTable'

/**
 * The strip that closes the Equipment panel (Slice 28 US2).
 *
 * Two cards used to state their own counts in two headers; one sheet states them
 * once, and states the only thing that can be wrong here — planning more of
 * something than you own.
 */

export type EquipmentFilter = 'problems' | null

interface EquipmentStatusRailProps {
  rows: EquipmentRow[]
  filter: EquipmentFilter
  /** Absent for a read-only role. */
  onFilterChange?: (filter: EquipmentFilter) => void
}

export function EquipmentStatusRail({ rows, filter, onFilterChange }: EquipmentStatusRailProps) {
  const over = rows.filter((row) => row.source === 'owned' && row.over)
  const owned = rows.filter((row) => row.source === 'owned').length
  const rented = rows.length - owned
  const problems = overOwnedCount(rows)

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2 text-[11px] text-zinc-400 ${
        problems > 0 ? 'border-red-400/40 bg-red-500/[0.05]' : 'border-zinc-800 bg-zinc-950/60'
      }`}
    >
      {problems > 0 ? (
        <Pill className="bg-red-500/15 text-red-300">{problems} over owned</Pill>
      ) : (
        <Pill className="bg-emerald-500/15 text-emerald-300">{rows.length === 0 ? 'nothing listed' : 'all covered'}</Pill>
      )}

      <span className="font-mono tabular-nums text-zinc-200">
        {rows.length} {rows.length === 1 ? 'line' : 'lines'}
      </span>
      <span className="font-mono tabular-nums text-zinc-500">{owned} owned</span>
      <span className="font-mono tabular-nums text-zinc-500">{rented} rented</span>

      {over[0] && over[0].source === 'owned' && (
        <>
          <span className="text-red-300">
            {over[0].name}: {over[0].qty} planned, you own {over[0].have}
          </span>
          {problems > 1 && <span className="text-zinc-500">+{problems - 1} more</span>}
        </>
      )}

      {onFilterChange && problems > 0 && (
        <Button
          size="xs"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() => onFilterChange(filter ? null : 'problems')}
        >
          {filter ? 'Show all' : 'Show only problems'}
        </Button>
      )}
    </div>
  )
}
