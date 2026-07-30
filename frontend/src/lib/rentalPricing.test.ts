import { describe, expect, it } from 'vitest'
import {
  billedSpanWords,
  chargedDaysWords,
  factorSourceWords,
  formatPercent,
  ledgerRows,
  lookupRentFactor,
} from './rentalPricing'
import type { RentFactor, RentalPricing } from '../types'

/**
 * The rate card from LL.xlsx's Hyresfaktor sheet, abridged around the gaps that
 * matter: it jumps 14 → 21 → 30, which is what makes stepping down a decision
 * rather than a detail.
 *
 * Deliberately the same table as `domain/pricing_test.go`'s. Two
 * implementations of one rule are only safe while both are tested against the
 * same cases.
 */
const LL_RATE_CARD: RentFactor[] = [
  { id: 1, days: 1, factor: 1 },
  { id: 2, days: 2, factor: 1.5 },
  { id: 3, days: 3, factor: 1.8 },
  { id: 4, days: 4, factor: 2 },
  { id: 5, days: 5, factor: 2.2 },
  { id: 6, days: 14, factor: 4 },
  { id: 7, days: 21, factor: 5.4 },
  { id: 8, days: 30, factor: 6.6 },
]

describe('lookupRentFactor — a rate card is a step function', () => {
  it.each([
    ['an exact row', 5, 2.2, 5],
    ['between rows, stepping down', 17, 4, 14],
    ['one day past a row', 6, 2.2, 5],
    ['above the last row, held', 45, 6.6, 30],
    ['the last row itself', 30, 6.6, 30],
    ['the first row', 1, 1, 1],
  ])('%s', (_name, days, factor, row) => {
    expect(lookupRentFactor(LL_RATE_CARD, days)).toMatchObject({ factor, days: row })
  })

  it('below the first row takes the first row', () => {
    const sparse: RentFactor[] = [
      { id: 1, days: 3, factor: 1.8 },
      { id: 2, days: 7, factor: 2.6 },
    ]
    expect(lookupRentFactor(sparse, 1)).toMatchObject({ days: 3, factor: 1.8 })
  })

  it('a single row applies to every hire length', () => {
    const single: RentFactor[] = [{ id: 1, days: 7, factor: 2.6 }]
    expect(lookupRentFactor(single, 60)).toMatchObject({ factor: 2.6 })
    expect(lookupRentFactor(single, 2)).toMatchObject({ factor: 2.6 })
  })

  it('an empty card has no answer, and the caller uses ×1.00', () => {
    expect(lookupRentFactor([], 5)).toBeNull()
  })
})

/** The worked example the spec, the mockup and every export are specified against. */
const PRICED: RentalPricing = {
  billed_days: 5,
  charged_days: 'onsite',
  charged_days_source: 'inventory',
  first_day: '2026-08-12',
  last_day: '2026-08-16',
  rent_factor: 2.2,
  rent_factor_source: 'table',
  rent_factor_days: 5,
  discount_percent: 25,
  discount_amount: 3120,
  subtotal_ex_vat: 12480,
  total_ex_vat: 20592,
  vat_percent: 25,
  vat_source: 'inventory',
  vat_amount: 5148,
  total_inc_vat: 25740,
}

describe('ledgerRows — every operation, not only its result', () => {
  it('states the whole derivation when there is a discount', () => {
    expect(ledgerRows(PRICED).map((row) => [row.label, row.value])).toEqual([
      ['Subtotal, per day', '12480.00'],
      ['Discount 25%', '−3120.00'],
      ['Rent factor · 5 days', '×2.20'],
      ['Total ex VAT', '20592.00'],
      ['VAT 25%', '+5148.00'],
      ['Total inc VAT', '25740.00'],
    ])
  })

  it('omits the discount line when nothing was agreed', () => {
    const rows = ledgerRows({ ...PRICED, discount_percent: 0, discount_amount: 0 })
    expect(rows.map((row) => row.key)).not.toContain('discount')
  })

  it('keeps the VAT line at a zero rate, because exempt is a real answer', () => {
    const rows = ledgerRows({ ...PRICED, vat_percent: 0, vat_amount: 0, total_inc_vat: 20592 })
    expect(rows.find((row) => row.key === 'vat')).toMatchObject({ label: 'VAT 0%', value: '+0.00' })
  })

  it('emphasises the two totals and nothing else', () => {
    expect(ledgerRows(PRICED).filter((row) => row.emphasis).map((row) => row.key)).toEqual(['total-ex', 'total-inc'])
  })

  it('says one day, not one days', () => {
    const rows = ledgerRows({ ...PRICED, billed_days: 1 })
    expect(rows.find((row) => row.key === 'factor')?.label).toBe('Rent factor · 1 day')
  })
})

describe('the words for where a number came from', () => {
  it('names the row when it is the one the hire asked for', () => {
    expect(factorSourceWords(PRICED)).toBe('the 5-day row')
  })

  it('makes a step-down visible rather than leaving it to be inferred', () => {
    expect(factorSourceWords({ ...PRICED, billed_days: 17, rent_factor_days: 14 })).toBe(
      'the 14-day row, for 17 days',
    )
  })

  it("says when the number is this event's own", () => {
    expect(factorSourceWords({ ...PRICED, rent_factor_source: 'override' })).toBe("this event's own")
  })

  it('says when there is no rate card at all', () => {
    expect(factorSourceWords({ ...PRICED, rent_factor_source: 'none' })).toContain('no rate card')
  })

  it('distinguishes the catalog rule from the event departing from it', () => {
    expect(chargedDaysWords(PRICED)).toBe("all on-site days — the catalog's rule")
    expect(chargedDaysWords({ ...PRICED, charged_days: 'show', charged_days_source: 'event' })).toBe(
      "show days only — this event's own",
    )
  })

  it('states the span the day count was taken over', () => {
    expect(billedSpanWords(PRICED)).toBe('2026-08-12 → 2026-08-16')
    expect(billedSpanWords({ ...PRICED, first_day: '2026-08-13', last_day: '2026-08-13' })).toBe('2026-08-13')
    expect(billedSpanWords({ ...PRICED, first_day: undefined, last_day: undefined })).toContain('no dates')
  })
})

describe('formatPercent — typed by hand, read at a glance', () => {
  it('trims a whole number', () => {
    expect(formatPercent(25)).toBe('25')
  })

  it('keeps a real fraction', () => {
    expect(formatPercent(12.5)).toBe('12.5')
  })
})
