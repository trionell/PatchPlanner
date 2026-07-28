import { Button } from '../ui/Button'
import { MicroLabel } from '../ui/Label'
import { Pill } from '../ui/SheetTable'

/**
 * The strip that closes the Signal Flow panel (Slice 28 US3).
 *
 * It replaces a coloured sentence that floated above the first of two tables —
 * *"⚠ 2 channels have gaps"* — which said the right thing in the wrong place and
 * in the wrong tier. A status strip tints its ground *and* its rule, so the
 * verdict reads from the edge of vision, and it closes the panel from inside
 * rather than sitting on top of it.
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
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2 text-[11px] text-zinc-400 print:hidden ${
        gaps > 0 ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-zinc-800 bg-zinc-950/60'
      }`}
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

      {/* Everyone may read this tab, including a viewer, so the filter is not
          role-gated — it changes what you are looking at, not what you may do. */}
      {gaps > 0 && (
        <Button
          size="xs"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() => onFilterChange(filter ? null : 'gaps')}
        >
          {filter ? 'Show all' : 'Show only gaps'}
        </Button>
      )}
    </div>
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
