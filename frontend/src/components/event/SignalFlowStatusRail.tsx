import { MicroLabel } from '../ui/Label'
import { Pill } from '../ui/SheetTable'
import { StatusStrip } from './StatusStrip'

/**
 * The strip that closes the Signal Flow panel (Slice 28 US3).
 *
 * It replaces a coloured sentence that floated above the first of two tables —
 * *"⚠ 2 channels have gaps"* — which said the right thing in the wrong place and
 * in the wrong tier. A status strip tints its ground *and* its rule, so the
 * verdict reads from the edge of vision, and it closes the panel from inside
 * rather than sitting on top of it.
 *
 * **It is the fifth status rail, and until Wave 6c it did not know that** (audit.md F1).
 * 6b converted four into the shared `StatusStrip` shell and wrote *four* into two design
 * documents; this one hand-built the same tinted `border-t` div, with its own copy of the
 * two-state tint and its own deliberately-below-`xs` filter button. It was missed for a
 * reason worth recording: it is the one rail whose surface was not among 6b's nine
 * lists, because Signal Flow's phone branch was still a stack of free-standing cards.
 *
 * What it gains by joining is the phone form the other four already had — on a phone the
 * strip *is* the filter control, full width at 44px, because the desktop's `h-6` button
 * is a 24px target in the hand (patterns.md §7b).
 */

export type SignalFlowFilter = 'gaps' | null

interface SignalFlowStatusRailProps {
  inputs: number
  outputs: number
  hops: number
  gaps: number
  /** The first gap, in words: `ch 9 Bass DI has no source`. */
  firstGap?: string
  filter: SignalFlowFilter
  onFilterChange: (filter: SignalFlowFilter) => void
}

export function SignalFlowStatusRail({
  inputs,
  outputs,
  hops,
  gaps,
  firstGap,
  filter,
  onFilterChange,
}: SignalFlowStatusRailProps) {
  return (
    <StatusStrip
      /*
        Everyone may read this tab, including a viewer, so the filter is not role-gated —
        it changes what you are looking at, not what you may do.

        It survives `gaps === 0` while the filter is *on*, which is the trap 6b found on
        the other four: a filter has to outlive the condition it filtered on, or fixing
        the last gap leaves the list filtered to nothing with the control gone.
      */
      filter={
        gaps > 0 || filter
          ? { label: filter ? 'Show all' : 'Show only gaps', onClick: () => onFilterChange(filter ? null : 'gaps') }
          : undefined
      }
      tint={gaps > 0 ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-zinc-800 bg-zinc-950/60'}
    >
      {gaps > 0 ? (
        <Pill className="bg-amber-500/15 text-amber-300">
          {gaps} {gaps === 1 ? 'gap' : 'gaps'}
        </Pill>
      ) : (
        <Pill className="bg-emerald-500/15 text-emerald-300">all routed</Pill>
      )}

      <span className="font-mono tabular-nums text-zinc-200">{inputs} inputs</span>
      <span className="font-mono tabular-nums text-zinc-200">{outputs} outputs</span>
      <span className="font-mono tabular-nums text-zinc-500">{hops} hops</span>

      {gaps > 0 && firstGap && (
        <>
          <span className="text-amber-300">{firstGap}</span>
          {gaps > 1 && <span className="text-zinc-500">+{gaps - 1} more</span>}
        </>
      )}
    </StatusStrip>
  )
}

/**
 * The rule dividing the panel into its two halves.
 *
 * The tab prints, and a view toggle would print whichever half was showing — a
 * load-in sheet that silently omits the output patch is worse than a long one. So
 * both stay on one scroll, and this is what tells them apart (research.md R9).
 */
export function FlowBand({ label, count, hint }: { label: string; count: number; hint?: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
      <MicroLabel>{label}</MicroLabel>
      <span className="font-mono text-[10px] tabular-nums text-zinc-600">{count}</span>
      {hint && <span className="ml-auto text-[11px] text-zinc-600 print:hidden">{hint}</span>}
    </div>
  )
}
