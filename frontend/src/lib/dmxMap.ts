import type { LightingFixture } from '../types'
import { duplicateFixtureNumbers } from './lightingRig'

/**
 * The rig's DMX map (Slice 27 US2).
 *
 * Nothing in the application has ever had an opinion about a rig's addressing.
 * Auto-assign packed each universe from address 1, so its own output was always
 * clean and the failure arrived with the first hand-edit afterwards — two moving
 * heads on the same channels, and the first thing to notice was a technician
 * standing in the room.
 *
 * This module is that opinion, as pure functions over a fixture list. No DOM, no
 * database, no network: see specs/027-lighting-sheet/contracts/dmx-map.md, whose
 * §8 lists the cases dmxMap.test.ts must cover.
 *
 * The four conditions are derived in an order that keeps them independent, and
 * the order is the whole trick — see `groupsOf` below.
 */

/** A DMX universe is 512 channels. The same bound the bulk-add guard uses. */
export const UNIVERSE_SIZE = 512

/** A fixture's occupied channels. `end` may exceed 512 — see `spanOf`. */
export interface Span {
  universe: number
  start: number
  count: number
  end: number
}

/**
 * Fixtures whose spans are *identical*. A fixture sharing with nobody is a group
 * of one, which is what lets every caller treat sharing as the ordinary case.
 */
export interface AddressGroup {
  universe: number
  start: number
  count: number
  end: number
  /** In rig order. */
  fixtureIds: number[]
  shared: boolean
}

export type DmxProblem =
  | { kind: 'clash'; universe: number; a: AddressGroup; b: AddressGroup }
  | { kind: 'out-of-bounds'; universe: number; group: AddressGroup }

/** A gap: unoccupied channels, contiguous. */
export interface FreeRun {
  start: number
  length: number
}

export interface UniverseMap {
  universe: number
  /** Every fixture assigned to this universe, addressed or not. */
  fixtureCount: number
  /** Distinct channels taken. Never a sum — see `occupancyOf`. */
  occupied: number
  /** 512 − occupied, including interior gaps. */
  free: number
  runs: FreeRun[]
  largestRun: FreeRun | null
  /** Ascending by start. */
  groups: AddressGroup[]
  sharedGroupCount: number
  problems: DmxProblem[]
}

/** What one row's address cell needs to know, without searching the map. */
export interface FixtureDmxState {
  /** Absent when the fixture has no start address. */
  group?: AddressGroup
  shared: boolean
  /** The first group this fixture's group clashes with, if any. */
  clashWith?: AddressGroup
  outOfBounds: boolean
}

export interface DmxMap {
  fixtureCount: number
  /** Ascending; only universes at least one fixture is assigned to. */
  universes: UniverseMap[]
  /** Fixture ids with no start address. */
  unaddressed: number[]
  /** Every universe's problems, flattened, in universe order. */
  problems: DmxProblem[]
  sharedGroupCount: number
  duplicateNumbers: Set<number>
  byFixture: Map<number, FixtureDmxState>
}

/**
 * The three normalisations, applied once here so nothing downstream re-checks
 * them (contracts §1).
 *
 * A universe below 1 becomes 1 and a channel count below 1 becomes 1, both
 * matching what auto-assign and the bulk guard have always done: these are
 * impossible values, not real ones. A fixture with no start address gets **no
 * span** rather than a span at address 0, because unaddressed is a fourth
 * condition and not a badly-placed fixture.
 *
 * `end` is deliberately **not** clamped to 512. Clamping here would hide the
 * out-of-bounds condition this map exists to report.
 */
export function universeOf(fixture: Pick<LightingFixture, 'dmx_universe'>): number {
  return fixture.dmx_universe >= 1 ? fixture.dmx_universe : 1
}

export function channelCountOf(fixture: Pick<LightingFixture, 'dmx_channel_count'>): number {
  return fixture.dmx_channel_count >= 1 ? fixture.dmx_channel_count : 1
}

export function spanOf(fixture: LightingFixture): Span | null {
  if (fixture.dmx_start_address == null) return null
  const count = channelCountOf(fixture)
  const start = fixture.dmx_start_address
  return { universe: universeOf(fixture), start, count, end: start + count - 1 }
}

/**
 * Step 1 of the four conditions: partition a universe's addressed fixtures by
 * `(start, count)`.
 *
 * This is the step that makes sharing structural. Because identical spans
 * collapse into one group *before* any pair is compared, a shared group is
 * incapable of clashing with itself, and "every member of a group keeps the same
 * address" is not a rule the packer has to remember — it is a consequence of the
 * group being one item in the list it packs.
 */
function groupsOf(fixtures: LightingFixture[]): AddressGroup[] {
  const byKey = new Map<string, AddressGroup>()
  for (const fixture of fixtures) {
    const span = spanOf(fixture)
    if (!span) continue
    const key = `${span.start}:${span.count}`
    const existing = byKey.get(key)
    if (existing) {
      existing.fixtureIds.push(fixture.id)
      existing.shared = true
    } else {
      byKey.set(key, { ...span, fixtureIds: [fixture.id], shared: false })
    }
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.count - b.count)
}

/**
 * Steps 2 and 3: clashes and out-of-bounds spans, compared over **groups**.
 *
 * A clash is reported once per pair of groups, not once per overlapping channel
 * (FR-025) — three fixtures where two share and the third overlaps both is one
 * clash, and the shared pair is still shared.
 *
 * Same start with a *different* channel count lands here rather than in a group,
 * which is the strict reading recorded in the spec: the shorter fixture's
 * channels are a subset of the longer one's, which is not what patching two
 * fixtures together means.
 */
function problemsOf(universe: number, groups: AddressGroup[]): DmxProblem[] {
  const problems: DmxProblem[] = []
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i].end > UNIVERSE_SIZE) problems.push({ kind: 'out-of-bounds', universe, group: groups[i] })
    for (let j = i + 1; j < groups.length; j += 1) {
      // Sorted by start, so once a group begins after this one ends, so does
      // every group after it.
      if (groups[j].start > groups[i].end) break
      problems.push({ kind: 'clash', universe, a: groups[i], b: groups[j] })
    }
  }
  return problems
}

/**
 * Occupancy as a set of channel numbers, never a sum (contracts §3).
 *
 * Three ways a sum is wrong, all reachable at once: twenty fixtures sharing 1–7
 * are 7 channels and not 140; a clash between 49–63 and 56–70 is 22 and not 30;
 * and a span at 505–520 contributes only its 8 channels inside the universe.
 *
 * `patchCapacity.usedPorts` answers the same class of mistake for cables with the
 * same instrument — "a jack used in both directions is still one jack".
 */
function occupancyOf(groups: AddressGroup[]): { occupied: number; runs: FreeRun[] } {
  const taken = new Set<number>()
  for (const group of groups) {
    const from = Math.max(1, group.start)
    const to = Math.min(UNIVERSE_SIZE, group.end)
    for (let channel = from; channel <= to; channel += 1) taken.add(channel)
  }

  const runs: FreeRun[] = []
  let runStart: number | null = null
  for (let channel = 1; channel <= UNIVERSE_SIZE; channel += 1) {
    if (taken.has(channel)) {
      if (runStart != null) {
        runs.push({ start: runStart, length: channel - runStart })
        runStart = null
      }
    } else if (runStart == null) {
      runStart = channel
    }
  }
  if (runStart != null) runs.push({ start: runStart, length: UNIVERSE_SIZE + 1 - runStart })

  return { occupied: taken.size, runs }
}

/**
 * The largest gap, ties broken by the lower start.
 *
 * Reported separately from `free` because only this one answers "will a batch of
 * N fit?" (FR-029). A universe with 494 free channels split into gaps of four has
 * plenty free and room for nothing.
 */
function largestRunOf(runs: FreeRun[]): FreeRun | null {
  let best: FreeRun | null = null
  for (const run of runs) if (!best || run.length > best.length) best = run
  return best
}

/** The whole map. Memoise this per fixture list; it is cheap but not free. */
export function dmxMap(fixtures: LightingFixture[]): DmxMap {
  const byUniverse = new Map<number, LightingFixture[]>()
  for (const fixture of fixtures) {
    const universe = universeOf(fixture)
    const list = byUniverse.get(universe)
    if (list) list.push(fixture)
    else byUniverse.set(universe, [fixture])
  }

  const universes: UniverseMap[] = []
  const byFixture = new Map<number, FixtureDmxState>()
  const unaddressed: number[] = []

  for (const universe of [...byUniverse.keys()].sort((a, b) => a - b)) {
    const own = byUniverse.get(universe)!
    const groups = groupsOf(own)
    const problems = problemsOf(universe, groups)
    const { occupied, runs } = occupancyOf(groups)

    for (const fixture of own) if (fixture.dmx_start_address == null) unaddressed.push(fixture.id)

    for (const group of groups) {
      const clash = problems.find(
        (problem) => problem.kind === 'clash' && (problem.a === group || problem.b === group),
      )
      const clashWith = clash?.kind === 'clash' ? (clash.a === group ? clash.b : clash.a) : undefined
      const outOfBounds = group.end > UNIVERSE_SIZE
      for (const id of group.fixtureIds) byFixture.set(id, { group, shared: group.shared, clashWith, outOfBounds })
    }

    universes.push({
      universe,
      fixtureCount: own.length,
      occupied,
      free: UNIVERSE_SIZE - occupied,
      runs,
      largestRun: largestRunOf(runs),
      groups,
      sharedGroupCount: groups.filter((group) => group.shared).length,
      problems,
    })
  }

  for (const id of unaddressed) byFixture.set(id, { shared: false, outOfBounds: false })

  return {
    fixtureCount: fixtures.length,
    universes,
    unaddressed,
    problems: universes.flatMap((map) => map.problems),
    sharedGroupCount: universes.reduce((total, map) => total + map.sharedGroupCount, 0),
    duplicateNumbers: duplicateFixtureNumbers(fixtures),
    byFixture,
  }
}

/**
 * Which of the strip's three states to show, in order of how much attention each
 * needs (FR-055).
 *
 * Shared groups are deliberately **not** a state: they are counted in every one
 * of these, because sharing is information rather than a condition to resolve.
 * Tinting the strip for the most ordinary arrangement in environment lighting
 * would be crying wolf.
 */
export type DmxStatusState = 'errors' | 'unaddressed' | 'clean'

export function dmxStatusState(map: DmxMap): DmxStatusState {
  if (map.problems.length > 0) return 'errors'
  if (map.unaddressed.length > 0) return 'unaddressed'
  return 'clean'
}

export function universeMap(map: DmxMap, universe: number): UniverseMap | undefined {
  return map.universes.find((entry) => entry.universe === universe)
}

/**
 * Where a batch of `count` channels would go: the first gap big enough, not one
 * past the highest occupied channel (FR-030).
 *
 * An unused universe has no `UniverseMap` at all, and its whole 512 channels are
 * free — which is why the undefined case answers address 1 rather than nothing.
 */
export function firstRunFitting(map: UniverseMap | undefined, count: number): FreeRun | null {
  const width = Math.max(1, count)
  if (!map) return width <= UNIVERSE_SIZE ? { start: 1, length: UNIVERSE_SIZE } : null
  return map.runs.find((run) => run.length >= width) ?? null
}

/** Whether a proposed span would touch anything already in its universe. */
export function groupsInTheWay(
  map: DmxMap,
  span: { universe: number; start: number; count: number },
  excludeFixtureId?: number,
): AddressGroup[] {
  const universe = universeMap(map, span.universe)
  if (!universe) return []
  const end = span.start + Math.max(1, span.count) - 1
  return universe.groups
    .map((group) =>
      excludeFixtureId == null
        ? group
        : { ...group, fixtureIds: group.fixtureIds.filter((id) => id !== excludeFixtureId) },
    )
    .filter((group) => group.fixtureIds.length > 0 && group.start <= end && span.start <= group.end)
}

/**
 * The sheet's address cell, zero-padded so a column of them is a column.
 * `formatDMXRange` in `lib/utils` stays as it is — the phone view uses it, and
 * padding is a work-surface concern.
 */
export function formatSpan(start?: number, count?: number): string {
  if (start == null) return '—'
  const width = count && count > 0 ? count : 1
  const pad = (value: number) => String(value).padStart(3, '0')
  return width > 1 ? `${pad(start)}–${pad(start + width - 1)}` : pad(start)
}
