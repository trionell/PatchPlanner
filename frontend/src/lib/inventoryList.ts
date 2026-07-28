import { matchesSearch } from './patchSearch'
import type { Inventory } from '../types'

/**
 * What the catalog list shows, and what its strip says about it (Slice 32).
 *
 * The strip is a readout of what the search left, so the filter and the
 * totals have to be computed in one place or they can disagree — a strip
 * reading `0 of 5 catalogs` above five visible rows is the bug this module
 * exists to make testable.
 *
 * Everything else on that page is either ordered by the server or counted by
 * it: this is the page's only derivation.
 */
export interface InventoryListSummary {
  /** The rows to draw, in the order the server returned them (name ASC). */
  visible: Inventory[]
  /** How many catalogs exist, whatever the search left. */
  total: number
  /** Items across the visible catalogs. */
  items: number
  /** Events running on the visible catalogs. */
  events: number
  /** Visible catalogs no event uses. */
  unused: number
}

/** Absent and zero mean the same thing — the server omits a zero count. */
const countOf = (value: number | undefined) => value ?? 0

/**
 * Filters by name and by the file the catalog was imported from — searching
 * `2025` finds last year's price list whether the user named it that or the
 * spreadsheet did — and totals what is left.
 */
export function summariseInventories(
  inventories: Inventory[] | undefined,
  search = '',
): InventoryListSummary {
  const all = inventories ?? []
  const visible = all.filter((inventory) => matchesSearch(search, inventory.name, inventory.sourceFilename))

  return {
    visible,
    total: all.length,
    items: visible.reduce((sum, inventory) => sum + countOf(inventory.itemCount), 0),
    events: visible.reduce((sum, inventory) => sum + countOf(inventory.eventCount), 0),
    unused: visible.filter((inventory) => countOf(inventory.eventCount) === 0).length,
  }
}
