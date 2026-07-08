import type { LightingFixture } from '../types'

/**
 * Console fixture IDs used by more than one fixture in the rig. Unset
 * numbers never count; duplicates are flagged in the UI but never block —
 * renumbering legitimately passes through duplicate states.
 */
export function duplicateFixtureNumbers(fixtures: LightingFixture[]): Set<number> {
  const counts = new Map<number, number>()
  for (const fixture of fixtures) {
    if (fixture.fixture_number == null) continue
    counts.set(fixture.fixture_number, (counts.get(fixture.fixture_number) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number))
}

/**
 * Suggested start for bulk numbering: one past the highest ID in use,
 * or 101 (the common console hundred-block start) for an unnumbered rig.
 */
export function nextFixtureNumber(fixtures: LightingFixture[]): number {
  const numbers = fixtures.map((fixture) => fixture.fixture_number).filter((n): n is number => n != null)
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 101
}
