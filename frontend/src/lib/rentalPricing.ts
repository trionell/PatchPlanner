import type { RentFactor, RentalPricing } from '../types'

/**
 * How a day rate becomes a hire price, for the surfaces that show it (Slice 31).
 *
 * The server computes every number in `RentalPricing`; nothing here recomputes a
 * total. What lives here is the *reading* of it — the ledger's rows, the words
 * for where each value came from — plus one thing the browser genuinely needs
 * for itself: the rate-card lookup, so the catalog's Pricing drawer can show
 * what a given hire length would cost without asking the server.
 */

/**
 * Reads a rate card by **stepping down** to the highest row at or below the
 * hire, clamped at both ends. Seventeen days gets the fourteen-day factor; past
 * the last row the last row holds; below the first row, the first row.
 *
 * The deliberate twin of `domain.LookupRentFactor` on the server, tested against
 * the same table of cases. Two implementations of one rule is a cost paid on
 * purpose: the alternative is a round trip to answer "what would a week cost",
 * inside a drawer whose whole job is to make that answer visible.
 *
 * `factors` must be ordered by `days` ascending; the API guarantees it.
 */
export function lookupRentFactor(factors: RentFactor[], days: number): RentFactor | null {
  if (factors.length === 0) return null
  let best = factors[0]
  for (const candidate of factors) {
    if (candidate.days > days) break
    best = candidate
  }
  return best
}

/**
 * Trims a percentage to what somebody typed: `25`, not `25.00`, but `12.5` when
 * that is what it is. Percentages are typed by hand and read at a glance, unlike
 * money, which is always two decimals.
 */
export function formatPercent(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function formatMoney(value: number): string {
  return value.toFixed(2)
}

/** One line of the ledger. `emphasis` marks the two totals. */
export interface LedgerRow {
  key: string
  label: string
  value: string
  emphasis?: boolean
}

/**
 * The ledger: subtotal, everything that acts on it, and both totals.
 *
 * It states every **operation** rather than only its result, so a number that
 * looks wrong can be traced without leaving the drawer. Drawn identically on the
 * desktop and the phone, because it is a mono list that already fits 375 px.
 */
export function ledgerRows(pricing: RentalPricing): LedgerRow[] {
  const rows: LedgerRow[] = [{ key: 'subtotal', label: 'Subtotal, per day', value: formatMoney(pricing.subtotal_ex_vat) }]

  if (pricing.discount_percent > 0) {
    rows.push({
      key: 'discount',
      label: `Discount ${formatPercent(pricing.discount_percent)}%`,
      value: `−${formatMoney(pricing.discount_amount)}`,
    })
  }
  rows.push({
    key: 'factor',
    label: `Rent factor · ${pricing.billed_days} ${pricing.billed_days === 1 ? 'day' : 'days'}`,
    value: `×${pricing.rent_factor.toFixed(2)}`,
  })
  rows.push({ key: 'total-ex', label: 'Total ex VAT', value: formatMoney(pricing.total_ex_vat), emphasis: true })

  // A zero rate is a real answer — some hires are exempt — so the VAT line is
  // shown whatever the rate, and only the two totals are emphasised.
  rows.push({
    key: 'vat',
    label: `VAT ${formatPercent(pricing.vat_percent)}%`,
    value: `+${formatMoney(pricing.vat_amount)}`,
  })
  rows.push({ key: 'total-inc', label: 'Total inc VAT', value: formatMoney(pricing.total_inc_vat), emphasis: true })
  return rows
}

/**
 * Where the factor came from, in words. A number whose origin is invisible is a
 * number nobody will trust the first time it looks wrong — and a step-down is
 * invisible unless it is said: 17 billed days reading the 14-day row.
 */
export function factorSourceWords(pricing: RentalPricing): string {
  if (pricing.rent_factor_source === 'override') return "this event's own"
  if (pricing.rent_factor_source === 'none') return 'no rate card — every hire is ×1.00'
  if (pricing.rent_factor_days === pricing.billed_days) return `the ${pricing.rent_factor_days}-day row`
  return `the ${pricing.rent_factor_days}-day row, for ${pricing.billed_days} days`
}

/** Where the charged-days rule came from, in words. */
export function chargedDaysWords(pricing: RentalPricing): string {
  const rule = pricing.charged_days === 'show' ? 'show days only' : 'all on-site days'
  return pricing.charged_days_source === 'event' ? `${rule} — this event's own` : `${rule} — the catalog's rule`
}

/** The span the day count was taken over, for the card that states it. */
export function billedSpanWords(pricing: RentalPricing): string {
  if (!pricing.first_day || !pricing.last_day) return 'this event has no dates — one day'
  if (pricing.first_day === pricing.last_day) return pricing.first_day
  return `${pricing.first_day} → ${pricing.last_day}`
}

export const CHARGED_DAYS_LABELS: Record<'onsite' | 'show', string> = {
  onsite: 'All on-site days (load-in → load-out)',
  show: 'Show days only (start → end)',
}
