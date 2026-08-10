import type { EventOwnedEquipment, EventRental } from '../types'

/**
 * One list out of two endpoints (Slice 28 US2).
 *
 * Owned gear and rented extras were two cards because they come from two
 * endpoints — a reason the person planning the show does not have. What they are
 * asking is *what is coming with us, and have I got enough of it*: one question,
 * one list, with a column saying where each line comes from.
 *
 * A rented line carries two quantities because the rental order splits by
 * department, and an owned line carries one. Rather than give the sheet two
 * mostly-empty columns, `qty` is the total and `split` qualifies it.
 */

export interface OwnedRow {
  source: 'owned'
  /** The *item* id. The two id spaces are separate, so a React key needs the source too. */
  id: number
  name: string
  /**
   * The catalog item's description. Both sources carry one, because a name is
   * not an identity — fifteen items in the live catalog are called
   * `Mikrofonkabel` and differ only here.
   */
  description?: string
  type: string
  qty: number
  have: number
  over: boolean
  note?: string
}

export interface RentedRow {
  source: 'rented'
  id: number
  name: string
  description?: string
  type: string
  audio: number
  light: number
  qty: number
  note?: string
}

export type EquipmentRow = OwnedRow | RentedRow

export function rowKey(row: EquipmentRow): string {
  return `${row.source}-${row.id}`
}

/**
 * How a rented line's two quantities read in one cell: `2a`, `1l`, `8a·4l`.
 * Undefined when the line is entirely one department and the total already says
 * it — a badge repeating the number beside it is the Dashboard's stat chip.
 */
export function quantitySplit(row: RentedRow): string | undefined {
  if (row.audio > 0 && row.light > 0) return `${row.audio}a·${row.light}l`
  if (row.audio > 0) return `${row.audio}a`
  if (row.light > 0) return `${row.light}l`
  return undefined
}

/**
 * Every line coming to the gig, owned first, then rented, then by name.
 *
 * The two blocks that used to be two cards are still two blocks — on one scroll,
 * under one set of column heads, counted by one strip.
 */
export function equipmentRows(
  owned: EventOwnedEquipment[] | undefined,
  rental: EventRental[] | undefined,
): EquipmentRow[] {
  const ownedRows: OwnedRow[] = (owned ?? []).map((line) => ({
    source: 'owned',
    id: line.owned_item_id,
    name: line.owned_item_name,
    description: line.description || undefined,
    type: line.category_type,
    qty: line.quantity,
    have: line.quantity_owned,
    over: line.is_over_owned,
    note: line.notes || undefined,
  }))

  const rentedRows: RentedRow[] = (rental ?? [])
    .filter((item) => item.manual_quantity_audio > 0 || item.manual_quantity_lighting > 0)
    .map((item) => ({
      source: 'rented',
      id: item.inventory_item_id,
      name: item.inventory_item_name ?? 'Catalog item',
      description: item.description || undefined,
      type: item.category_name || item.category_type || '',
      audio: item.manual_quantity_audio,
      light: item.manual_quantity_lighting,
      qty: item.manual_quantity_audio + item.manual_quantity_lighting,
      note: item.manual_notes || undefined,
    }))

  const byName = (a: EquipmentRow, b: EquipmentRow) => a.name.localeCompare(b.name)
  return [...ownedRows.sort(byName), ...rentedRows.sort(byName)]
}

export function overOwnedCount(rows: EquipmentRow[]): number {
  return rows.filter((row) => row.source === 'owned' && row.over).length
}
