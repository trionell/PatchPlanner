import { describe, expect, it } from 'vitest'
import { equipmentRows, overOwnedCount, quantitySplit, rowKey, type RentedRow } from './equipmentRows'
import type { EventOwnedEquipment, EventRental } from '../types'

function owned(overrides: Partial<EventOwnedEquipment> = {}): EventOwnedEquipment {
  return {
    owned_item_id: 1,
    owned_item_name: 'MacBook Pro 16"',
    category_type: 'control',
    quantity: 1,
    quantity_owned: 1,
    is_over_owned: false,
    ...overrides,
  }
}

function rental(overrides: Partial<EventRental> = {}): EventRental {
  return {
    inventory_item_id: 1,
    inventory_item_name: 'K&M 210/9',
    quantity_audio: 10,
    quantity_lighting: 0,
    total_quantity: 10,
    manual_quantity_audio: 0,
    manual_quantity_lighting: 0,
    price_ex_vat: 25,
    subtotal_ex_vat: 250,
    quantity_available: 40,
    is_over_stock: false,
    ...overrides,
  } as EventRental
}

describe('equipmentRows', () => {
  it('puts owned lines first, then rented, each sorted by name', () => {
    const rows = equipmentRows(
      [owned({ owned_item_id: 1, owned_item_name: 'Zoom F8' }), owned({ owned_item_id: 2, owned_item_name: 'DiGiCo SD-Rack' })],
      [
        rental({ inventory_item_id: 10, inventory_item_name: 'Midas DL16', manual_quantity_audio: 2 }),
        rental({ inventory_item_id: 11, inventory_item_name: 'Chamsys wing', manual_quantity_lighting: 1 }),
      ],
    )
    expect(rows.map((row) => row.name)).toEqual(['DiGiCo SD-Rack', 'Zoom F8', 'Chamsys wing', 'Midas DL16'])
    expect(rows.map((row) => row.source)).toEqual(['owned', 'owned', 'rented', 'rented'])
  })

  it('keeps only the rental lines somebody added by hand', () => {
    const rows = equipmentRows(
      [],
      [
        rental({ inventory_item_id: 1, inventory_item_name: 'From the patch' }),
        rental({ inventory_item_id: 2, inventory_item_name: 'Added by hand', manual_quantity_audio: 2 }),
      ],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Added by hand')
  })

  it('counts a rented line by its manual parts, not by the plan', () => {
    const [row] = equipmentRows([], [rental({ manual_quantity_audio: 2, quantity_audio: 10, total_quantity: 10 })])
    expect(row.qty).toBe(2)
  })

  it('is empty, not undefined, when nothing has loaded', () => {
    expect(equipmentRows(undefined, undefined)).toEqual([])
  })

  it('keys the two id spaces apart', () => {
    const rows = equipmentRows([owned({ owned_item_id: 7 })], [rental({ inventory_item_id: 7, manual_quantity_audio: 1 })])
    expect(rowKey(rows[0])).toBe('owned-7')
    expect(rowKey(rows[1])).toBe('rented-7')
    expect(rowKey(rows[0])).not.toBe(rowKey(rows[1]))
  })

  it('takes a rented line’s type from its catalog category', () => {
    const [row] = equipmentRows([], [rental({ manual_quantity_audio: 1, category_name: 'Stands' })])
    expect(row.type).toBe('Stands')
  })
})

describe('quantitySplit', () => {
  const base: RentedRow = { source: 'rented', id: 1, name: 'x', type: '', audio: 0, light: 0, qty: 0 }

  it('names both departments when both are present', () => {
    expect(quantitySplit({ ...base, audio: 8, light: 4 })).toBe('8a·4l')
  })

  it('names the one department that is present', () => {
    expect(quantitySplit({ ...base, audio: 2 })).toBe('2a')
    expect(quantitySplit({ ...base, light: 1 })).toBe('1l')
  })

  it('says nothing when there is nothing to qualify', () => {
    expect(quantitySplit(base)).toBeUndefined()
  })
})

describe('overOwnedCount', () => {
  it('counts only owned lines over their owned quantity', () => {
    const rows = equipmentRows(
      [
        owned({ owned_item_id: 1, quantity: 4, quantity_owned: 2, is_over_owned: true }),
        owned({ owned_item_id: 2 }),
      ],
      [rental({ manual_quantity_audio: 99 })],
    )
    expect(overOwnedCount(rows)).toBe(1)
  })
})

describe('the description', () => {
  it('carries from both sources, so two same-named lines are told apart', () => {
    const rows = equipmentRows(
      [
        owned({ owned_item_id: 1, owned_item_name: 'Mikrofonkabel', description: '0,5m' }),
        owned({ owned_item_id: 2, owned_item_name: 'Mikrofonkabel', description: '20m' }),
      ],
      [rental({ inventory_item_id: 10, inventory_item_name: 'Mikrofonkabel', description: '7,5m', manual_quantity_audio: 2 })],
    )
    expect(rows.map((row) => row.description)).toEqual(['0,5m', '20m', '7,5m'])
  })

  it('is undefined rather than empty when the catalog has none', () => {
    const [ownedRow, rentedRow] = equipmentRows(
      [owned({ owned_item_id: 1, description: '' })],
      [rental({ inventory_item_id: 10, description: undefined, manual_quantity_audio: 1 })],
    )
    expect(ownedRow.description).toBeUndefined()
    expect(rentedRow.description).toBeUndefined()
  })
})
