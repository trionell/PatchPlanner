import { isoDay } from './dashboard'
import { type DmxStatusState, UNIVERSE_SIZE, dmxMap, dmxStatusState } from './dmxMap'
import { eventPhase, onSiteDays, resolveDates, showDays } from './eventTimeline'
import { buildInputChannelFlows } from './inputSignalFlow'
import { cablesPicked } from './patchCapacity'
import { buildOutputChannelFlows } from './signalFlow'
import type {
  AudioPatchResponse,
  Event,
  EventMember,
  EventOwnedEquipment,
  LightingRigResponse,
  PlotTruss,
  RentalSummary,
  StagePlot,
} from '../types'

/**
 * What the whole event amounts to, in one object (Slice 28 US5).
 *
 * Overview is the only screen positioned to answer *how is this show doing*, and
 * every piece of the answer is already derived somewhere: the patch knows its
 * gaps, the rig knows its addressing, the rental order knows its overdraft. This
 * collects them.
 *
 * **It is a derivation, not a query, and that was a decision** (research.md R1).
 * The mockup proposed `GET /events/{id}/summary`; the spec withdrew it. Three of
 * the four headline figures have real logic behind them — `signalGaps` is a walk
 * over the cable graph, `dmxState` is a partition of identical spans — and a Go
 * copy would be a second implementation with one specific, bad failure: Overview
 * says *addressed*, you click through, and Lighting's own strip says *2 errors*.
 * A summary that disagrees with the thing it summarises is worse than none.
 *
 * So this calls the same functions those tabs call, and `eventSummary.test.ts`
 * asserts the equality rather than hoping for it.
 *
 * Pure: no React, no fetch, no DOM.
 */

/** Every figure is optional, and the distinction is load-bearing — see `EventSummary`. */
export interface EventSummary {
  /**
   * Whole days from today to the event's **load-in**; negative once it is past.
   *
   * The label on this figure has said "days to load-in" since Wave 4 while the
   * value counted to the event's only date. Slice 30 gives an event a load-in
   * date, so the value moves to meet the word rather than the word being
   * walked back.
   */
  daysToLoadIn?: number
  /** How to say it: `today`, `tomorrow`, `in 18 days`, `3 days ago`, `load-in today`, `day 2 of 3`. */
  dayLabel?: string
  /** Which day of the run today is, 1-based. Only while the show is running. */
  runningDay?: number
  /** How many show days there are in total. Present whenever the event has a date. */
  showDays?: number
  /** How many days at the venue, load-in to load-out. Present whenever the event has a date. */
  onSiteDays?: number

  inputChannels?: number
  outputChannels?: number
  cablesPicked?: number
  sources?: number
  stageboxes?: number
  stageMultis?: number
  consoleName?: string
  outputDevices?: number
  signalGaps?: number
  signalHops?: number

  fixtures?: number
  universes?: number
  trusses?: number
  dmxUsed?: number
  dmxCapacity?: number
  dmxState?: DmxStatusState
  unaddressed?: number

  stagePlots?: number

  rentalLines?: number
  rentalPieces?: number
  rentalTotalExVAT?: number
  rentalOverStock?: number
  rentalDiscontinued?: number

  equipmentLines?: number
  equipmentOverOwned?: number

  members?: number
  yourRole?: string

  /** One per area, always in this order, whatever is missing. */
  readiness: ReadinessVerdict[]
}

export type ReadinessArea = 'audio' | 'lighting' | 'rental' | 'equipment' | 'plots'
export type ReadinessTone = 'ok' | 'warn' | 'error' | 'neutral'

export interface ReadinessVerdict {
  area: ReadinessArea
  /** The tab to open — a value of `EventDetail`'s tab vocabulary. */
  tab: string
  /** What the owning strip says for this state. */
  label: string
  tone: ReadinessTone
}

/**
 * One row of Overview's phone form (Wave 6c): a verdict, and the figure that goes with
 * it, on one line.
 *
 * The desktop draws these in **two** bands — five 26px figures across the top, five
 * `area + Pill` verdicts across the bottom — because a desk has room to read across. A
 * 375px screen does not, so the phone puts each area's number and each area's verdict on
 * the same 44px row and the run becomes the index of the show: five things that both
 * state where the plan stands and open the section that fixes it.
 *
 * It derives **nothing new**. `area`, `tab`, `label` and `tone` are `ReadinessVerdict`
 * verbatim, and `figure` is formatted from the same `EventSummary` fields `NumbersBand`
 * reads. If the phone formatted its own, `16 / 8` and `16 ch in · 8 out` would be two
 * renderings of one fact with two places to get it wrong — which is the mistake this
 * module exists to prevent.
 */
export interface ReadinessLine extends ReadinessVerdict {
  /**
   * What the desktop's numbers band says about this area.
   *
   * **Absent, never `'0'`, for an area with no plan at all.** An event has not got zero
   * channels; it has no patch — the same Undeclared/Empty distinction that makes `Meter`
   * withhold itself at an undeclared capacity, and the one most easily lost in
   * translation from a figure to a row.
   */
  figure?: string
}

export function readinessLines(summary: EventSummary): ReadinessLine[] {
  const figures: Record<ReadinessArea, string | undefined> = {
    audio:
      summary.inputChannels == null
        ? undefined
        : `${summary.inputChannels} in · ${summary.outputChannels ?? 0} out`,
    lighting:
      summary.fixtures == null
        ? undefined
        : `${summary.fixtures} ${summary.fixtures === 1 ? 'fixture' : 'fixtures'}`,
    rental:
      summary.rentalTotalExVAT == null
        ? undefined
        : `${Math.round(summary.rentalTotalExVAT).toLocaleString('sv-SE')} kr`,
    equipment:
      summary.equipmentLines == null
        ? undefined
        : `${summary.equipmentLines} ${summary.equipmentLines === 1 ? 'line' : 'lines'}`,
    // The plots verdict already *is* the count, so a figure would say it twice.
    plots: undefined,
  }

  return summary.readiness.map((verdict) => ({ ...verdict, figure: figures[verdict.area] }))
}

export interface EventSummaryInput {
  event?: Event
  patch?: AudioPatchResponse
  rig?: LightingRigResponse
  trusses?: PlotTruss[]
  plots?: StagePlot[]
  rental?: RentalSummary
  equipment?: EventOwnedEquipment[]
  members?: EventMember[]
  /** Injectable so the day arithmetic is testable without freezing the clock. */
  today?: Date
}

/** Midnight local, so a show later today is 0 days away and not 0.4. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(isoDate: string, today: Date): number | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!parts) return undefined
  const target = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  return Math.round((startOfDay(target) - startOfDay(today)) / DAY_MS)
}

function dayLabelFor(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${-days} days ago`
}

/**
 * The whole event, derived.
 *
 * Anything absent from `input` comes back `undefined` rather than `0`, because
 * *not known yet* and *counted, and it is zero* are different facts and the
 * numbers band draws them differently (FR-062). An event with no patch has not
 * got zero channels; it has no patch. This is the same Undeclared/Empty
 * distinction that makes `Meter` withhold itself at an undeclared capacity.
 */
export function eventSummary(input: EventSummaryInput): EventSummary {
  const today = input.today ?? new Date()
  const summary: EventSummary = { readiness: [] }

  // ---- when ----
  // Counts to load-in, and says which day of the run it is once the run has
  // started. Both come from the same resolution the timeline uses, so the
  // dashboard and the Events page cannot disagree about when a show is.
  const dates = input.event ? resolveDates(input.event) : undefined
  if (input.event && dates) {
    summary.showDays = showDays(dates)
    summary.onSiteDays = onSiteDays(dates)
    const days = daysBetween(dates.loadIn, today)
    if (days !== undefined) {
      summary.daysToLoadIn = days
      const phase = eventPhase(input.event, isoDay(today))
      if (phase === 'load-in') {
        summary.dayLabel = 'load-in today'
      } else if (phase === 'running') {
        // `daysBetween` counts forward from today to the target, so the first
        // show day is *negative* once the run has started. The day of the run
        // is the other direction: 1 on the first show day, 2 the next morning.
        const untilFirst = daysBetween(dates.first, today) ?? 0
        summary.runningDay = Math.max(1, 1 - untilFirst)
        summary.dayLabel =
          summary.showDays > 1 ? `day ${summary.runningDay} of ${summary.showDays}` : 'today'
      } else {
        summary.dayLabel = dayLabelFor(days)
      }
    }
  }

  // ---- audio ----
  const patch = input.patch
  if (patch) {
    summary.inputChannels = patch.input_channels.length
    summary.outputChannels = patch.outputs.length
    summary.sources = patch.input_sources.length
    summary.stageboxes = patch.stageboxes.length
    summary.stageMultis = patch.stage_multis.length
    summary.outputDevices = patch.output_devices.length
    summary.consoleName = patch.consoles[0]?.name
    summary.cablesPicked = cablesPicked(patch.input_cables) + cablesPicked(patch.output_cables)

    // The same walk Signal Flow does, so the two cannot disagree (FR-079).
    // Labels are irrelevant to a count, so the map is empty rather than fetched.
    const itemLabelById = new Map<number, string>()
    const inputFlows = buildInputChannelFlows(patch.input_channels, {
      sources: patch.input_sources,
      channels: patch.input_channels,
      devices: patch.input_devices,
      stageboxes: patch.stageboxes,
      stageMultis: patch.stage_multis,
      cables: patch.input_cables,
      consoles: patch.consoles,
      itemLabelById,
    })
    const outputFlows = buildOutputChannelFlows(patch.outputs, {
      stageboxes: patch.stageboxes,
      stageMultis: patch.stage_multis,
      devices: patch.output_devices,
      cables: patch.output_cables,
      consoles: patch.consoles,
      itemLabelById,
    })
    summary.signalGaps =
      inputFlows.filter((flow) => flow.hasGap).length + outputFlows.filter((flow) => flow.hasGap).length
    summary.signalHops = countHops(inputFlows) + countHops(outputFlows)
  }

  // ---- lighting ----
  if (input.rig) {
    const map = dmxMap(input.rig.fixtures)
    summary.fixtures = map.fixtureCount
    summary.universes = map.universes.length
    summary.unaddressed = map.unaddressed.length
    summary.dmxState = dmxStatusState(map)
    summary.dmxUsed = map.universes.reduce((total, universe) => total + universe.occupied, 0)
    // Universes *in use* — an unmentioned universe is not spare capacity.
    summary.dmxCapacity = map.universes.length * UNIVERSE_SIZE
  }
  if (input.trusses) summary.trusses = input.trusses.length
  if (input.plots) summary.stagePlots = input.plots.length

  // ---- rental ----
  const rental = input.rental
  if (rental) {
    summary.rentalLines = rental.total_items
    summary.rentalPieces = rental.total_quantity
    summary.rentalTotalExVAT = rental.total_ex_vat
    summary.rentalOverStock = rental.items.filter((item) => item.is_over_stock).length
    summary.rentalDiscontinued = rental.items.filter((item) => item.is_discontinued).length
  }

  // ---- equipment ----
  if (input.equipment) {
    const rented = rental ? rental.items.filter(hasManualPart).length : 0
    summary.equipmentLines = input.equipment.length + rented
    summary.equipmentOverOwned = input.equipment.filter((line) => line.is_over_owned).length
  }

  // ---- access ----
  if (input.members) summary.members = input.members.length
  if (input.event?.yourRole) summary.yourRole = input.event.yourRole

  summary.readiness = [
    audioVerdict(summary),
    lightingVerdict(summary),
    rentalVerdict(summary),
    equipmentVerdict(summary),
    plotsVerdict(summary),
  ]

  return summary
}

export function hasManualPart(item: { manual_quantity_audio: number; manual_quantity_lighting: number }): boolean {
  return item.manual_quantity_audio > 0 || item.manual_quantity_lighting > 0
}

function countHops(flows: { paths: { hops: unknown[] }[] }[]): number {
  return flows.reduce(
    (total, flow) => total + flow.paths.reduce((pathTotal, path) => pathTotal + path.hops.length, 0),
    0,
  )
}

/**
 * The five verdicts.
 *
 * Each takes its words from the derivation that owns the tab it links to, so the
 * pill and that tab's own status strip cannot say different things (R12). Where
 * nothing has been planned the verdict is `neutral` and says so — an empty rig is
 * not a rig with problems, and it must not wear a warning.
 */
function audioVerdict(summary: EventSummary): ReadinessVerdict {
  const base = { area: 'audio' as const, tab: 'audio-inputs' }
  if (summary.inputChannels === undefined) return { ...base, label: 'no patch', tone: 'neutral' }
  if (summary.inputChannels === 0 && summary.outputChannels === 0)
    return { ...base, label: 'no patch', tone: 'neutral' }
  if (summary.signalGaps) return { ...base, label: `${summary.signalGaps} gaps`, tone: 'warn' }
  return { ...base, label: 'routed', tone: 'ok' }
}

function lightingVerdict(summary: EventSummary): ReadinessVerdict {
  const base = { area: 'lighting' as const, tab: 'lighting-rig' }
  if (summary.fixtures === undefined) return { ...base, label: 'no rig', tone: 'neutral' }
  if (summary.fixtures === 0) return { ...base, label: 'no fixtures', tone: 'neutral' }
  if (summary.dmxState === 'errors') return { ...base, label: 'address errors', tone: 'error' }
  if (summary.dmxState === 'unaddressed')
    return { ...base, label: `${summary.unaddressed} unaddressed`, tone: 'warn' }
  return { ...base, label: 'addressed', tone: 'ok' }
}

function rentalVerdict(summary: EventSummary): ReadinessVerdict {
  const base = { area: 'rental' as const, tab: 'rentals' }
  if (summary.rentalLines === undefined) return { ...base, label: 'no order', tone: 'neutral' }
  if (summary.rentalLines === 0) return { ...base, label: 'nothing on order', tone: 'neutral' }
  if (summary.rentalOverStock) return { ...base, label: `${summary.rentalOverStock} over stock`, tone: 'error' }
  if (summary.rentalDiscontinued)
    return { ...base, label: `${summary.rentalDiscontinued} discontinued`, tone: 'warn' }
  return { ...base, label: 'in stock', tone: 'ok' }
}

function equipmentVerdict(summary: EventSummary): ReadinessVerdict {
  const base = { area: 'equipment' as const, tab: 'equipment' }
  if (summary.equipmentLines === undefined) return { ...base, label: 'not listed', tone: 'neutral' }
  if (summary.equipmentLines === 0) return { ...base, label: 'nothing listed', tone: 'neutral' }
  if (summary.equipmentOverOwned)
    return { ...base, label: `${summary.equipmentOverOwned} over owned`, tone: 'error' }
  return { ...base, label: `${summary.equipmentLines} lines`, tone: 'ok' }
}

function plotsVerdict(summary: EventSummary): ReadinessVerdict {
  const base = { area: 'plots' as const, tab: 'stage-plots' }
  if (summary.stagePlots === undefined) return { ...base, label: 'no plots', tone: 'neutral' }
  if (summary.stagePlots === 0) return { ...base, label: 'no plots', tone: 'neutral' }
  return {
    ...base,
    label: `${summary.stagePlots} ${summary.stagePlots === 1 ? 'plot' : 'plots'}`,
    tone: 'ok',
  }
}
