import type { ReactNode } from 'react'
import type { EventSummary, ReadinessVerdict } from '../../lib/eventSummary'
import { NODE_BORDER, NODE_BORDER_DESK } from './graph/tokens'
import { Meter } from '../ui/GearList'
import { MicroLabel } from '../ui/Label'
import { Pill } from '../ui/SheetTable'

/**
 * The three bands that make Overview worth landing on (Slice 28 US4).
 *
 * All three read one `EventSummary`, which is derived by calling the same
 * functions the owning tabs call — so nothing here can disagree with the strip on
 * the tab it links to.
 */

/* ------------------------------------------------------------------ numbers */

interface Figure {
  label: string
  value?: number
  /** Rendered small after the number: `/ 16`, `kr`. */
  unit?: string
  /** Overrides the formatted number, for the countdown's `today`. */
  text?: string
  tab: string
}

/**
 * Five figures, and the one place in the application where type gets big.
 *
 * Everything else is 10–14 px on purpose, which is exactly what makes a row of
 * 26 px mono numerals land: it is scale contrast, not decoration. The density
 * tiers govern controls and rows, and this is neither.
 *
 * **An undefined figure renders `—`, never `0`** (FR-062). An event with no patch
 * has not got zero channels; it has no patch. Same Undeclared/Empty distinction
 * that makes `Meter` withhold itself at an undeclared capacity.
 */
export function NumbersBand({ summary, onOpenTab }: { summary: EventSummary; onOpenTab: (tab: string) => void }) {
  const figures: Figure[] = [
    {
      label: 'days to load-in',
      value: summary.daysToLoadIn != null ? Math.abs(summary.daysToLoadIn) : undefined,
      text: summary.dayLabel === 'today' || summary.dayLabel === 'tomorrow' ? summary.dayLabel : undefined,
      unit: summary.daysToLoadIn != null && summary.daysToLoadIn < 0 ? 'ago' : undefined,
      tab: 'overview',
    },
    {
      label: 'channels in / out',
      value: summary.inputChannels,
      unit: summary.outputChannels != null ? `/ ${summary.outputChannels}` : undefined,
      tab: 'audio-inputs',
    },
    { label: 'fixtures', value: summary.fixtures, tab: 'lighting-rig' },
    { label: 'cables picked', value: summary.cablesPicked, tab: 'audio-outputs' },
    {
      label: 'rental, ex vat',
      value: summary.rentalTotalExVAT != null ? Math.round(summary.rentalTotalExVAT) : undefined,
      unit: 'kr',
      tab: 'rentals',
    },
  ]

  return (
    <div className="flex flex-wrap border-y border-zinc-800 bg-zinc-950/60">
      {figures.map((figure) => (
        <button
          key={figure.label}
          type="button"
          onClick={() => onOpenTab(figure.tab)}
          className="min-w-[8rem] flex-1 border-l border-zinc-800 px-5 py-3.5 text-left transition-colors first:border-l-0 hover:bg-zinc-900/60"
        >
          <div className="font-mono text-[26px] font-semibold leading-none tabular-nums text-zinc-100">
            {figure.text ?? (figure.value != null ? figure.value.toLocaleString('sv-SE') : <span className="text-zinc-600">—</span>)}
            {figure.unit && figure.value != null && !figure.text && (
              <span className="ml-1 text-sm font-medium text-zinc-500">{figure.unit}</span>
            )}
          </div>
          <MicroLabel className="mt-1.5 block">{figure.label}</MicroLabel>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------- ribbon */

/**
 * The rig, drawn as the flow canvas one row high.
 *
 * Real nodes with their real border and shadow, the console wearing
 * `NODE_BORDER_DESK` because it is the box every other box is arranged around —
 * **imported**, not retyped (P3). It answers *what shape is this show* in the
 * width of a sentence, in the application's own picture of itself, rather than
 * introducing a second visual language for data the canvas already draws.
 *
 * No animation: Overview is a working screen inside the event, and a tool that
 * animates while a technician is counting channels is in the way
 * (design/tokens.md §6). The dashboard's copy of this ribbon is where the
 * sanctioned pulse goes.
 */
export function RigRibbon({ label, nodes, trailing }: { label: string; nodes: RibbonNode[]; trailing?: ReactNode }) {
  const shown = nodes.filter((node) => node.count == null || node.count > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <MicroLabel className="w-[4.5rem] shrink-0">{label}</MicroLabel>
      {shown.map((node, index) => (
        <div key={node.label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
          {index > 0 && <span className="h-0.5 min-w-4 flex-1 rounded-sm bg-zinc-700" />}
          <div
            className={`shrink-0 rounded-[7px] border ${node.desk ? NODE_BORDER_DESK : NODE_BORDER} bg-zinc-850 px-2.5 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.4)]`}
          >
            <div className="font-mono text-xs tabular-nums leading-tight text-zinc-100">{node.value}</div>
            <MicroLabel className="block text-[9px]">{node.label}</MicroLabel>
          </div>
        </div>
      ))}
      {trailing && <div className="ml-3 flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  )
}

export interface RibbonNode {
  label: string
  value: string | number
  /** Omitted from the ribbon when zero — an empty box is not information. */
  count?: number
  desk?: boolean
}

/** The DMX occupancy that trails the lighting ribbon. */
export function DmxMeter({ used, capacity }: { used?: number; capacity?: number }) {
  if (!used || !capacity) return null
  return (
    <>
      <span className="w-28">
        <Meter used={used} capacity={capacity} />
      </span>
      <span className="font-mono text-[11px] tabular-nums text-zinc-400">
        {used} / {capacity} ch
      </span>
    </>
  )
}

/* ---------------------------------------------------------------- readiness */

const TONE = {
  ok: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  error: 'bg-red-500/15 text-red-300',
  neutral: 'bg-zinc-700 text-zinc-300',
} as const

/**
 * Every work panel's own verdict, collected onto the tab you land on.
 *
 * The words and the tint are the ones the owning strip uses, because they come
 * from the same derivation — so this is not a second opinion about the plan, it
 * is the same one, gathered.
 */
export function ReadinessRow({
  verdicts,
  onOpenTab,
}: {
  verdicts: ReadinessVerdict[]
  onOpenTab: (tab: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <MicroLabel className="w-[4.5rem] shrink-0">Ready?</MicroLabel>
      {verdicts.map((verdict) => (
        <button
          key={verdict.area}
          type="button"
          onClick={() => onOpenTab(verdict.tab)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{verdict.area}</span>
          <Pill className={TONE[verdict.tone]}>{verdict.label}</Pill>
        </button>
      ))}
    </div>
  )
}
