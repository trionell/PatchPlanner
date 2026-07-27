import { patchStatusState, type PatchStatus } from '../../lib/patchCapacity'
import { Button } from '../ui/Button'
import { Pill } from '../ui/SheetTable'

interface PatchStatusRailProps {
  status: PatchStatus
  /** "channel" / "output" — the noun the rail counts. */
  noun: string
  /** Filters the sheet to the rows that are missing a link. */
  onShowGaps?: () => void
  gapsOnly?: boolean
  /** Opens the Rig drawer, where an over-capacity patch is actually fixed. */
  onOpenRig?: () => void
}

/**
 * How the strip closes the panel, given what it is saying (Slice 25 FR-018): the
 * ground *and* the top border take the tint, so a patch with gaps is visible from
 * the edge of vision rather than only on reading.
 */
const STRIP_TINT = {
  complete: 'border-zinc-800 bg-zinc-950/60',
  gaps: 'border-amber-500/40 bg-amber-500/[0.05]',
  over: 'border-red-400/40 bg-red-500/[0.05]',
} as const

/**
 * The strip that closes the patch panel, stating whether the plan holds (Slice 23
 * FR-015). Three states, in order of how much they need attention: over capacity,
 * gaps, complete. The over-capacity state only becomes reachable once an event
 * declares a console — until then the tool has never been told how big the desk is,
 * and inventing a capacity would be worse than saying nothing.
 *
 * It is no longer a card of its own (Slice 25): it closes the panel from inside it,
 * with only a top border, so the alert reads from the edge of the frame rather than
 * from a badge floating in a second box below it. The mockup shows the strip in the
 * Sheet view only, which is why it belongs to the sheet and not to the panel.
 */
export function PatchStatusRail({ status, noun, onShowGaps, gapsOnly, onOpenRig }: PatchStatusRailProps) {
  const state = patchStatusState(status)

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2 text-[11px] text-zinc-400 ${STRIP_TINT[state]}`}>
      {state === 'complete' && <Pill className="bg-emerald-500/15 text-emerald-300">complete</Pill>}
      {state === 'gaps' && (
        <Pill className="bg-amber-500/15 text-amber-300">
          {status.gaps.length} {status.gaps.length === 1 ? 'gap' : 'gaps'}
        </Pill>
      )}
      {state === 'over' && <Pill className="bg-red-500/15 text-red-300">over capacity</Pill>}

      <span className="font-mono tabular-nums text-zinc-200">
        {status.rowCount} {status.rowCount === 1 ? noun : `${noun}s`}
      </span>

      {status.consoleLabels.length > 0 && <span className="font-mono tabular-nums text-zinc-400">{status.consoleLabels.join(' · ')}</span>}

      {status.boxes.length > 0 && (
        <span className="font-mono tabular-nums text-zinc-500">
          {status.boxes.map((box) => `${box.name} ${box.used}/${box.declared}`).join(' · ')}
        </span>
      )}

      <span className="font-mono tabular-nums text-zinc-500">{status.cablesPicked} cables picked</span>

      {state === 'over' && <span className="text-red-300">{status.overCapacity[0]}</span>}

      {/*
        The strip's two controls are a size below `xs`, and deliberately not a
        fifth `Button` size: a control that sits *inside* a strip has to match the
        strip's own `text-[11px]` and must not set the height of the bar it closes
        the panel with. Two co-located overrides in one component are not the
        scattered-copies problem `xs` was added to end (design/audit.md A2).
      */}
      {state === 'gaps' && (
        <>
          <span className="text-amber-300">{status.gaps[0]}</span>
          {status.gaps.length > 1 && <span className="text-zinc-500">+{status.gaps.length - 1} more</span>}
          {onShowGaps && (
            <Button size="xs" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onShowGaps}>
              {gapsOnly ? 'Show all' : 'Show only gaps'}
            </Button>
          )}
        </>
      )}

      {state === 'over' && onOpenRig && (
        <Button size="xs" variant="outline" className="h-6 px-2 text-[11px]" onClick={onOpenRig}>
          Open Rig
        </Button>
      )}
    </div>
  )
}
