/**
 * The first `limit` ports and how many are left, for a box that would otherwise draw
 * thirty-two rows (Slice 25 FR-029). A 32-jack stagebox is ordinary, and eight rows
 * plus a count is legible where a wall of thirty-two is not — so truncation here is
 * a readability device, not an apology.
 *
 * At or under the limit nothing is hidden, so no `MoreRow` is drawn; one over says
 * "1 more" rather than being rounded away as not worth mentioning.
 */
export function visiblePorts<T>(ports: T[], limit: number): { shown: T[]; hidden: number } {
  if (ports.length <= limit) return { shown: ports, hidden: 0 }
  return { shown: ports.slice(0, limit), hidden: ports.length - limit }
}
