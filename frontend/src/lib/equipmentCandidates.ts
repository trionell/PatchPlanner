import type { InventoryItem, OwnedItem } from '../types'

/**
 * The two catalogs, flattened to one shape the item picker can list.
 *
 * It lives here rather than beside either caller because **both reaches map
 * them** — the desk's add row and the phone's add sheet — and the mapping is
 * where the two catalogs' one real difference is absorbed: owned gear groups by
 * a fixed five-value `category_type`, rented gear by the inventory's own
 * free-form category names. Past this function nothing branches on which
 * catalog it is looking at.
 */
export interface PickerCandidate {
  id: number
  name: string
  description?: string
  /** Groups the rail. Free-form names and fixed types are both just keys. */
  categoryKey: string
  categoryLabel: string
  /** A muted word after the rail's label — a category's type, nothing longer. */
  categoryQualifier?: string
  /** Available to draw on: the catalog's stock, or the quantity owned. */
  stock: number
  /**
   * Which department a batch line defaults into. Everything that is not
   * lighting lands in Audio: the rental order has exactly two departments and
   * audio is the general one (confirmed with the user). It sets a **default**,
   * never a constraint — every line is editable before it is saved.
   */
  lighting: boolean
}

export interface LineValues {
  quantity: number
  audio: number
  light: number
}

export interface SaveLine extends LineValues {
  itemId: number
}

/**
 * What a line holds before anything is chosen — and what a **single** add still
 * starts from. A rented line at `0 / 0` will not save until a quantity is typed,
 * which is exactly what the form did before the picker existed. Only a batch of
 * more than one defaults its quantities (see `batchDefaults`), because that
 * default is a convenience the batch needed and letting it leak into the single
 * path would change behaviour nobody asked to change.
 */
export const BLANK_LINE: LineValues = { quantity: 1, audio: 0, light: 0 }

/** One line of a batch: one, in the department the item's category names. */
export function batchDefaults(item: PickerCandidate): LineValues {
  return { quantity: 1, audio: item.lighting ? 0 : 1, light: item.lighting ? 1 : 0 }
}

export function ownedCandidates(catalog: OwnedItem[]): PickerCandidate[] {
  return catalog.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    categoryKey: item.category_type,
    categoryLabel: item.category_type,
    stock: item.quantity_owned,
    lighting: item.category_type === 'lighting',
  }))
}

export function rentedCandidates(catalog: InventoryItem[]): PickerCandidate[] {
  return catalog.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    categoryKey: String(item.category_id),
    categoryLabel: item.category_name || 'Uncategorised',
    categoryQualifier: item.category_type,
    stock: item.quantity_available,
    lighting: item.category_type === 'lighting',
  }))
}

/** Whether every chosen line has a quantity its source will accept. */
export function linesReady(source: 'owned' | 'rented', ids: number[], values: Record<number, LineValues>): boolean {
  if (ids.length === 0) return false
  return ids.every((id) => {
    const value = values[id] ?? BLANK_LINE
    return source === 'owned' ? value.quantity > 0 : value.audio > 0 || value.light > 0
  })
}
