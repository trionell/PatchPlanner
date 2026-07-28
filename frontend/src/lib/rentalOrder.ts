import type { EventRental } from '../types'

/**
 * What the rental order's strip and its filter agree a problem is (Slice 28 US1).
 *
 * Its own module rather than sitting beside the strip, because the sheet's filter
 * and the strip's verdict must be the *same* predicate — if they drift, "show only
 * problems" hides a line the strip is complaining about.
 */

export type RentalStatusState = 'clean' | 'discontinued' | 'over'

export function rentalStatusState(items: EventRental[]): RentalStatusState {
  if (items.some((item) => item.is_over_stock)) return 'over'
  if (items.some((item) => item.is_discontinued)) return 'discontinued'
  return 'clean'
}

export function isProblemLine(item: EventRental): boolean {
  return Boolean(item.is_over_stock || item.is_discontinued)
}

/** True when somebody typed part of this line, which is the only part they may edit. */
export function hasManualPart(item: EventRental): boolean {
  return item.manual_quantity_audio > 0 || item.manual_quantity_lighting > 0
}

/**
 * What the plan contributes, as opposed to what was added by hand.
 *
 * `quantity_audio` **includes** the manual part, so this is a subtraction — and
 * getting it backwards would be invisible on every line where nobody has typed
 * anything, which is most of them.
 */
export function plannedQuantities(item: EventRental): { audio: number; lighting: number } {
  return {
    audio: item.quantity_audio - item.manual_quantity_audio,
    lighting: item.quantity_lighting - item.manual_quantity_lighting,
  }
}
