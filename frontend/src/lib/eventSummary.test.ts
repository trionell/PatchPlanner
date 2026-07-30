import { describe, expect, it } from 'vitest'
import { dmxMap, dmxStatusState } from './dmxMap'
import { buildInputChannelFlows } from './inputSignalFlow'
import { eventSummary, readinessLines } from './eventSummary'
import { buildOutputChannelFlows } from './signalFlow'
import type {
  AudioPatchResponse,
  Event,
  EventOwnedEquipment,
  InputChannel,
  InputSource,
  LightingFixture,
  LightingRigResponse,
  RentalSummary,
  EventRental,
} from '../types'

/**
 * The cases in specs/028-event-tabs/quickstart.md, plus SC-008 — which is the
 * load-bearing one: the summary's verdicts must *equal* what the owning
 * derivations return, not merely resemble them.
 */

const TODAY = new Date(2026, 6, 28) // 2026-07-28, local

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    name: 'Fest i Parken 2026',
    created_at: '2026-03-02T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
    inventoryId: 1,
    ...overrides,
  }
}

function emptyPatch(overrides: Partial<AudioPatchResponse> = {}): AudioPatchResponse {
  return {
    stageboxes: [],
    stage_multis: [],
    groups: [],
    dcas: [],
    input_sources: [],
    input_channels: [],
    input_devices: [],
    input_cables: [],
    outputs: [],
    output_devices: [],
    output_cables: [],
    consoles: [],
    ...overrides,
  }
}

function channel(number: number, overrides: Partial<InputChannel> = {}): InputChannel {
  return {
    id: number,
    event_id: 1,
    channel_number: number,
    channel_name: `Ch ${number}`,
    width: 'mono',
    phantom_power: false,
    ...overrides,
  } as InputChannel
}

function source(id: number, overrides: Partial<InputSource> = {}): InputSource {
  return {
    id,
    event_id: 1,
    name: `Source ${id}`,
    kind: 'mic',
    phantom_power: false,
    connector_type: 'xlr',
    width: 'mono',
    position_x: 0,
    position_y: 0,
    ...overrides,
  } as InputSource
}

function fixture(id: number, start: number | null, count = 16, universe = 1): LightingFixture {
  return {
    id,
    rig_id: 1,
    custom_name: `Fixture ${id}`,
    dmx_universe: universe,
    dmx_start_address: start ?? undefined,
    dmx_channel_count: count,
    position_index: id,
    power_connection: 'grid',
    power_connector_in: '',
  }
}

function rig(fixtures: LightingFixture[]): LightingRigResponse {
  return { rig: { id: 1, event_id: 1, name: 'Main rig' } as LightingRigResponse['rig'], fixtures }
}

function rentalItem(overrides: Partial<EventRental> = {}): EventRental {
  return {
    inventory_item_id: 1,
    inventory_item_name: 'Shure SM58',
    quantity_audio: 8,
    quantity_lighting: 0,
    total_quantity: 8,
    manual_quantity_audio: 0,
    manual_quantity_lighting: 0,
    price_ex_vat: 45,
    subtotal_ex_vat: 360,
    quantity_available: 24,
    is_over_stock: false,
    ...overrides,
  } as EventRental
}

function rental(items: EventRental[], pricingOverrides: Partial<RentalSummary['pricing']> = {}): RentalSummary {
  const subtotal = items.reduce((total, item) => total + item.subtotal_ex_vat, 0)
  return {
    items,
    total_items: items.length,
    total_quantity: items.reduce((total, item) => total + item.total_quantity, 0),
    subtotal_ex_vat: subtotal,
    has_over_stock: items.some((item) => item.is_over_stock),
    // The unpriced case, which is what every catalog without a rate card
    // means: one day, ×1.00, nothing off, and the total equal to the subtotal.
    pricing: {
      billed_days: 1,
      charged_days: 'onsite',
      charged_days_source: 'inventory',
      rent_factor: 1,
      rent_factor_source: 'none',
      discount_percent: 0,
      discount_amount: 0,
      subtotal_ex_vat: subtotal,
      total_ex_vat: subtotal,
      vat_percent: 25,
      vat_source: 'inventory',
      vat_amount: subtotal * 0.25,
      total_inc_vat: subtotal * 1.25,
      ...pricingOverrides,
    },
  }
}

describe('eventSummary — nothing loaded', () => {
  it('returns every figure undefined rather than zero', () => {
    const summary = eventSummary({ today: TODAY })
    expect(summary.inputChannels).toBeUndefined()
    expect(summary.fixtures).toBeUndefined()
    expect(summary.rentalLines).toBeUndefined()
    expect(summary.cablesPicked).toBeUndefined()
    expect(summary.daysToLoadIn).toBeUndefined()
  })

  it('still returns five verdicts, all neutral, in order', () => {
    const summary = eventSummary({ today: TODAY })
    expect(summary.readiness.map((verdict) => verdict.area)).toEqual([
      'audio',
      'lighting',
      'rental',
      'equipment',
      'plots',
    ])
    expect(summary.readiness.every((verdict) => verdict.tone === 'neutral')).toBe(true)
  })

  it('distinguishes an empty plan from no plan', () => {
    const empty = eventSummary({ today: TODAY, patch: emptyPatch(), rig: rig([]), rental: rental([]) })
    expect(empty.inputChannels).toBe(0)
    expect(empty.fixtures).toBe(0)
    expect(empty.rentalLines).toBe(0)
    // …and having counted zero is still not a problem worth warning about.
    expect(empty.readiness.every((verdict) => verdict.tone === 'neutral')).toBe(true)
  })
})

describe('eventSummary — the day arithmetic', () => {
  it('is undefined when the event has no date', () => {
    const summary = eventSummary({ today: TODAY, event: event({ startDate: undefined }) })
    expect(summary.daysToLoadIn).toBeUndefined()
    expect(summary.dayLabel).toBeUndefined()
  })

  it('counts whole days regardless of the time of day', () => {
    const summary = eventSummary({ today: new Date(2026, 6, 28, 23, 55), event: event({ startDate: '2026-08-14' }) })
    expect(summary.daysToLoadIn).toBe(17)
    expect(summary.dayLabel).toBe('in 17 days')
  })

  it('says today, tomorrow and yesterday rather than a number', () => {
    expect(eventSummary({ today: TODAY, event: event({ startDate: '2026-07-28' }) }).dayLabel).toBe('today')
    expect(eventSummary({ today: TODAY, event: event({ startDate: '2026-07-29' }) }).dayLabel).toBe('tomorrow')
    expect(eventSummary({ today: TODAY, event: event({ startDate: '2026-07-27' }) }).dayLabel).toBe('yesterday')
  })

  it('says a past date in the past tense, never as a negative', () => {
    const summary = eventSummary({ today: TODAY, event: event({ startDate: '2026-07-18' }) })
    expect(summary.daysToLoadIn).toBe(-10)
    expect(summary.dayLabel).toBe('10 days ago')
  })

  it('ignores a timestamp suffix on the stored date', () => {
    expect(eventSummary({ today: TODAY, event: event({ startDate: '2026-08-14T00:00:00Z' }) }).daysToLoadIn).toBe(17)
  })
})

describe('eventSummary — the day arithmetic, with length (Slice 30)', () => {
  it('counts to load-in, not to the first show day', () => {
    // The label has said "days to load-in" since Wave 4 while the value counted
    // to the event's only date. Now the value means what the label says.
    const summary = eventSummary({
      today: TODAY,
      event: event({ loadInDate: '2026-08-13', startDate: '2026-08-14' }),
    })
    expect(summary.daysToLoadIn).toBe(16)
    expect(summary.dayLabel).toBe('in 16 days')
  })

  it('says load-in today on the rig day', () => {
    const summary = eventSummary({
      today: TODAY,
      event: event({ loadInDate: '2026-07-28', startDate: '2026-07-29', endDate: '2026-07-31' }),
    })
    expect(summary.dayLabel).toBe('load-in today')
    expect(summary.daysToLoadIn).toBe(0)
  })

  it('says which day of the run it is once the run has started', () => {
    const summary = eventSummary({
      today: TODAY,
      event: event({ startDate: '2026-07-27', endDate: '2026-07-29' }),
    })
    expect(summary.dayLabel).toBe('day 2 of 3')
    expect(summary.runningDay).toBe(2)
    expect(summary.showDays).toBe(3)
  })

  it('is on the first day of the run when today is the first show day', () => {
    const summary = eventSummary({
      today: TODAY,
      event: event({ loadInDate: '2026-07-27', startDate: '2026-07-28', endDate: '2026-07-30' }),
    })
    expect(summary.dayLabel).toBe('day 1 of 3')
  })

  it('still says today for a one-day event, rather than day 1 of 1', () => {
    expect(eventSummary({ today: TODAY, event: event({ startDate: '2026-07-28' }) }).dayLabel).toBe('today')
  })

  it('reports both spans whenever the event has a date', () => {
    const summary = eventSummary({
      today: TODAY,
      event: event({
        loadInDate: '2026-09-17',
        startDate: '2026-09-18',
        endDate: '2026-09-20',
        loadOutDate: '2026-09-21',
      }),
    })
    expect(summary.showDays).toBe(3)
    expect(summary.onSiteDays).toBe(5)
  })

  it('leaves both spans undefined for an undated event', () => {
    const summary = eventSummary({ today: TODAY, event: event({ startDate: undefined }) })
    expect(summary.showDays).toBeUndefined()
    expect(summary.onSiteDays).toBeUndefined()
  })
})

describe('eventSummary — audio', () => {
  const patch = emptyPatch({
    input_channels: [channel(1), channel(2), channel(3)],
    input_sources: [source(1)],
    outputs: [{ id: 1, event_id: 1, output_number: 1, output_type: 'foh', width: 'mono' }] as AudioPatchResponse['outputs'],
    input_cables: [
      { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, cable_item_id: 401 },
      { id: 2, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 2, to_port: 0 },
    ] as AudioPatchResponse['input_cables'],
  })

  it('counts channels, outputs and sources', () => {
    const summary = eventSummary({ today: TODAY, patch })
    expect(summary.inputChannels).toBe(3)
    expect(summary.outputChannels).toBe(1)
    expect(summary.sources).toBe(1)
  })

  it('counts only cables with an item chosen', () => {
    expect(eventSummary({ today: TODAY, patch }).cablesPicked).toBe(1)
  })

  it('counts gaps by the same walk Signal Flow does', () => {
    const summary = eventSummary({ today: TODAY, patch })
    const itemLabelById = new Map<number, string>()
    const expected =
      buildInputChannelFlows(patch.input_channels, {
        sources: patch.input_sources,
        channels: patch.input_channels,
        devices: patch.input_devices,
        stageboxes: patch.stageboxes,
        stageMultis: patch.stage_multis,
        cables: patch.input_cables,
        consoles: patch.consoles,
        itemLabelById,
      }).filter((flow) => flow.hasGap).length +
      buildOutputChannelFlows(patch.outputs, {
        stageboxes: patch.stageboxes,
        stageMultis: patch.stage_multis,
        devices: patch.output_devices,
        cables: patch.output_cables,
        consoles: patch.consoles,
        itemLabelById,
      }).filter((flow) => flow.hasGap).length
    expect(summary.signalGaps).toBe(expected)
  })

  it('reports gaps as a warning, and a clean patch as routed', () => {
    const gappy = eventSummary({ today: TODAY, patch })
    const audio = gappy.readiness.find((verdict) => verdict.area === 'audio')!
    expect(audio.tab).toBe('audio-inputs')
    if (gappy.signalGaps) {
      expect(audio.tone).toBe('warn')
      expect(audio.label).toBe(`${gappy.signalGaps} gaps`)
    } else {
      expect(audio.tone).toBe('ok')
    }
  })
})

describe('eventSummary — lighting', () => {
  it('takes its verdict from dmxStatusState, not from its own rules', () => {
    const fixtures = [fixture(1, 1), fixture(2, 9)] // 1–16 and 9–24 overlap
    const summary = eventSummary({ today: TODAY, rig: rig(fixtures) })
    expect(summary.dmxState).toBe(dmxStatusState(dmxMap(fixtures)))
    expect(summary.dmxState).toBe('errors')
    expect(summary.readiness.find((verdict) => verdict.area === 'lighting')!.tone).toBe('error')
  })

  it('does not call a shared address an error', () => {
    const fixtures = [fixture(1, 1), fixture(2, 1), fixture(3, 1)] // identical spans
    const summary = eventSummary({ today: TODAY, rig: rig(fixtures) })
    expect(summary.dmxState).toBe('clean')
    expect(summary.readiness.find((verdict) => verdict.area === 'lighting')!.label).toBe('addressed')
  })

  it('warns about unaddressed fixtures and names how many', () => {
    const summary = eventSummary({ today: TODAY, rig: rig([fixture(1, 1), fixture(2, null)]) })
    expect(summary.unaddressed).toBe(1)
    const lighting = summary.readiness.find((verdict) => verdict.area === 'lighting')!
    expect(lighting.tone).toBe('warn')
    expect(lighting.label).toBe('1 unaddressed')
  })

  it('measures capacity over universes in use, not up to the highest number', () => {
    // One fixture in universe 1 and one in universe 7: two universes, not seven.
    const summary = eventSummary({ today: TODAY, rig: rig([fixture(1, 1, 16, 1), fixture(2, 1, 16, 7)]) })
    expect(summary.universes).toBe(2)
    expect(summary.dmxCapacity).toBe(1024)
    expect(summary.dmxUsed).toBe(32)
  })
})

describe('eventSummary — rental and equipment', () => {
  const summary = eventSummary({
    today: TODAY,
    rental: rental([
      rentalItem(),
      rentalItem({ inventory_item_id: 2, inventory_item_name: 'Radial JDI', quantity_available: 4, total_quantity: 6, is_over_stock: true }),
      rentalItem({ inventory_item_id: 3, inventory_item_name: 'MQ50', is_discontinued: true }),
      rentalItem({ inventory_item_id: 4, inventory_item_name: 'K&M 210/9', manual_quantity_audio: 2 }),
    ]),
    equipment: [
      { owned_item_id: 1, owned_item_name: 'MacBook Pro', category_type: 'control', quantity: 1, quantity_owned: 1, is_over_owned: false },
      { owned_item_id: 2, owned_item_name: 'PSM1000', category_type: 'audio', quantity: 4, quantity_owned: 2, is_over_owned: true },
    ] satisfies EventOwnedEquipment[],
  })

  it('reads the totals the server already computed rather than re-adding them', () => {
    expect(summary.rentalLines).toBe(4)
    expect(summary.rentalTotalExVAT).toBe(1440)
  })

  it('counts over-stock and discontinued lines separately', () => {
    expect(summary.rentalOverStock).toBe(1)
    expect(summary.rentalDiscontinued).toBe(1)
  })

  it('reports over stock as an error and discontinued as a warning', () => {
    const verdict = summary.readiness.find((item) => item.area === 'rental')!
    expect(verdict.tone).toBe('error')
    expect(verdict.label).toBe('1 over stock')
    // With no over-stock line, the discontinued one is what the strip says.
    const softer = eventSummary({ today: TODAY, rental: rental([rentalItem({ is_discontinued: true })]) })
    const softerVerdict = softer.readiness.find((item) => item.area === 'rental')!
    expect(softerVerdict.tone).toBe('warn')
    expect(softerVerdict.label).toBe('1 discontinued')
  })

  it('counts equipment as owned lines plus rented extras', () => {
    // Two owned lines, and one rental line carrying a manual part.
    expect(summary.equipmentLines).toBe(3)
    expect(summary.equipmentOverOwned).toBe(1)
    expect(summary.readiness.find((item) => item.area === 'equipment')!.tone).toBe('error')
  })
})

describe('SC-008 — the summary agrees with the tabs it links to', () => {
  const fixtures = [fixture(1, 1), fixture(2, 17), fixture(3, null)]
  const patch = emptyPatch({
    input_channels: [channel(1), channel(2)],
    input_sources: [source(1)],
    input_cables: [
      { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0 },
    ] as AudioPatchResponse['input_cables'],
  })
  const order = rental([rentalItem(), rentalItem({ inventory_item_id: 2, is_over_stock: true })])
  const summary = eventSummary({ today: TODAY, patch, rig: rig(fixtures), rental: order })

  it('states the DMX verdict Lighting states', () => {
    expect(summary.dmxState).toBe(dmxStatusState(dmxMap(fixtures)))
    expect(summary.unaddressed).toBe(dmxMap(fixtures).unaddressed.length)
  })

  it('states the gap count Signal Flow states', () => {
    const flows = buildInputChannelFlows(patch.input_channels, {
      sources: patch.input_sources,
      channels: patch.input_channels,
      devices: patch.input_devices,
      stageboxes: patch.stageboxes,
      stageMultis: patch.stage_multis,
      cables: patch.input_cables,
      consoles: patch.consoles,
      itemLabelById: new Map(),
    })
    expect(summary.signalGaps).toBe(flows.filter((flow) => flow.hasGap).length)
  })

  it('states the rental figures the rental strip states', () => {
    expect(summary.rentalLines).toBe(order.total_items)
    expect(summary.rentalPieces).toBe(order.total_quantity)
    expect(summary.rentalTotalExVAT).toBe(order.pricing.total_ex_vat)
    expect(summary.rentalOverStock).toBe(order.items.filter((item) => item.is_over_stock).length)
  })
})

/**
 * `readinessLines` — the phone's index of the show (Wave 6c).
 *
 * The point of these is that they add no derivation. So what is asserted is that they
 * *agree* with the summary they came from, and the one place a translation from a figure
 * to a row could lose something: **undeclared is not zero.**
 */
describe('readinessLines', () => {
  it('is the readiness row, in order, with nothing added or dropped', () => {
    const summary = eventSummary({ today: TODAY })
    const lines = readinessLines(summary)
    expect(lines).toHaveLength(summary.readiness.length)
    expect(lines.map((line) => line.area)).toEqual(summary.readiness.map((verdict) => verdict.area))
    lines.forEach((line, index) => {
      expect(line.label).toBe(summary.readiness[index].label)
      expect(line.tone).toBe(summary.readiness[index].tone)
      expect(line.tab).toBe(summary.readiness[index].tab)
    })
  })

  it('an area with no plan gets no figure — a dash, never a zero', () => {
    // Nothing loaded: an event has not got zero channels, it has no patch.
    const lines = readinessLines(eventSummary({ today: TODAY }))
    expect(lines.every((line) => line.figure === undefined)).toBe(true)
  })

  it('states the same numbers the desktop band states', () => {
    const summary = eventSummary({
      today: TODAY,
      patch: emptyPatch({ input_channels: [channel(1), channel(2)] }),
      rig: rig([fixture(1, 1)]),
      rental: rental([rentalItem()]),
      equipment: [
        { owned_item_id: 1, owned_item_name: 'MacBook Pro', category_type: 'control', quantity: 1, quantity_owned: 1, is_over_owned: false },
      ] satisfies EventOwnedEquipment[],
    })
    const byArea = new Map(readinessLines(summary).map((line) => [line.area, line.figure]))
    expect(byArea.get('audio')).toBe(`${summary.inputChannels} in · ${summary.outputChannels} out`)
    expect(byArea.get('lighting')).toContain(String(summary.fixtures))
    expect(byArea.get('equipment')).toContain(String(summary.equipmentLines))
    // The plots verdict already is the count, so a figure would say it twice.
    expect(byArea.get('plots')).toBeUndefined()
  })
})
