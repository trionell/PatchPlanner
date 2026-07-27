import { type DmxMap, type DmxProblem, UNIVERSE_SIZE, dmxStatusState, formatSpan } from '../../lib/dmxMap'
import type { LightingFixture } from '../../types'
import { Button } from '../ui/Button'
import { Pill } from '../ui/SheetTable'

/**
 * The strip that closes the Lighting panel, stating whether the rig's addressing
 * holds (Slice 27 US2).
 *
 * Built like `PatchStatusRail`: top border only, ground *and* rule tinted, so the
 * state reads from the edge of vision rather than only on reading.
 *
 * The one departure from its sibling is the shared-group count, which is present
 * in **all three** states and tints nothing. Sharing is derived from addresses
 * agreeing, so a bulk add run twice produces a group nobody asked for — counting
 * it always is what keeps that from being silent, while tinting the strip for the
 * most ordinary arrangement in environment lighting would be crying wolf.
 */

const STRIP_TINT = {
  clean: 'border-zinc-800 bg-zinc-950/60',
  unaddressed: 'border-amber-500/40 bg-amber-500/[0.05]',
  errors: 'border-red-400/40 bg-red-500/[0.05]',
} as const

export type LightingFilter = 'errors' | 'unaddressed' | null

interface LightingStatusRailProps {
  map: DmxMap
  fixtures: LightingFixture[]
  /** Filters the sheet to the rows the strip is reporting. Absent for a read-only role. */
  onFilterChange?: (filter: LightingFilter) => void
  filter: LightingFilter
}

export function LightingStatusRail({ map, fixtures, filter, onFilterChange }: LightingStatusRailProps) {
  const state = dmxStatusState(map)
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]))

  const label = (id: number) => {
    const fixture = byId.get(id)
    if (!fixture) return `Fixture ${id}`
    return fixture.fixture_number != null
      ? `${fixture.fixture_number} ${fixture.custom_name || fixture.inventory_item_name || ''}`.trim()
      : fixture.custom_name || fixture.inventory_item_name || `Fixture ${id}`
  }

  const describe = (problem: DmxProblem): string => {
    if (problem.kind === 'out-of-bounds') {
      const first = problem.group.fixtureIds[0]
      return `U${problem.universe} · ${label(first)} ${formatSpan(problem.group.start, problem.group.count)} runs past ${UNIVERSE_SIZE}`
    }
    return `U${problem.universe} · ${label(problem.a.fixtureIds[0])} ${formatSpan(problem.a.start, problem.a.count)} overlaps ${label(problem.b.fixtureIds[0])} ${formatSpan(problem.b.start, problem.b.count)}`
  }

  const duplicates = map.duplicateNumbers.size
  const noun = map.fixtureCount === 1 ? 'fixture' : 'fixtures'

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2 text-[11px] text-zinc-400 ${STRIP_TINT[state]}`}>
      {state === 'clean' && <Pill className="bg-emerald-500/15 text-emerald-300">addressed</Pill>}
      {state === 'unaddressed' && (
        <Pill className="bg-amber-500/15 text-amber-300">
          {map.unaddressed.length} unaddressed
        </Pill>
      )}
      {state === 'errors' && (
        <Pill className="bg-red-500/15 text-red-300">
          {map.problems.length} {map.problems.length === 1 ? 'error' : 'errors'}
        </Pill>
      )}

      <span className="font-mono tabular-nums text-zinc-200">
        {map.fixtureCount} {noun}
      </span>

      {map.universes.length > 0 && (
        <span className="font-mono tabular-nums text-zinc-500">
          {map.universes
            .map((universe) => `U${universe.universe} ${String(universe.occupied).padStart(3, '0')}/${UNIVERSE_SIZE}`)
            .join(' · ')}
        </span>
      )}

      {/* Present in every state, and tinting none of them. */}
      {map.sharedGroupCount > 0 && (
        <span className="text-zinc-500">
          {map.sharedGroupCount} shared {map.sharedGroupCount === 1 ? 'group' : 'groups'}
        </span>
      )}

      {state !== 'unaddressed' && map.unaddressed.length > 0 && (
        <span className="text-zinc-500">{map.unaddressed.length} unaddressed</span>
      )}

      {duplicates > 0 && (
        <span className="text-zinc-500">
          {duplicates} duplicate {duplicates === 1 ? 'ID' : 'IDs'}
        </span>
      )}

      {state === 'errors' && (
        <>
          <span className="text-red-300">{describe(map.problems[0])}</span>
          {map.problems.length > 1 && <span className="text-zinc-500">+{map.problems.length - 1} more</span>}
        </>
      )}

      {state === 'unaddressed' && (
        <>
          <span className="text-amber-300">{label(map.unaddressed[0])} has no DMX address</span>
          {map.unaddressed.length > 1 && <span className="text-zinc-500">+{map.unaddressed.length - 1} more</span>}
        </>
      )}

      {/*
        The strip's control is a size below `xs`, as PatchStatusRail's are and for
        the same reason: a control inside a strip has to match the strip's own
        text and must not set the height of the bar closing the panel
        (design/components.md §4).
      */}
      {onFilterChange && state !== 'clean' && (
        <Button
          size="xs"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() => onFilterChange(filter ? null : state)}
        >
          {filter ? 'Show all' : `Show only ${state === 'errors' ? 'errors' : 'unaddressed'}`}
        </Button>
      )}
    </div>
  )
}
