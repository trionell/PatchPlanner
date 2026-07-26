/**
 * Whether a row matches the audio tabs' single search term (Slice 23 FR-016).
 * Case-insensitive substring over whatever the caller considers searchable —
 * a row's number, name, notes and, from the sheet, its whole chain string, so
 * searching "Radial" finds every channel routed through the DI box.
 *
 * An empty term matches everything, which is what makes the caller's filter a
 * no-op until the user types.
 */
export function matchesSearch(term: string, ...fields: (string | number | undefined | null)[]): boolean {
  const needle = term.trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) => field != null && String(field).toLowerCase().includes(needle))
}
