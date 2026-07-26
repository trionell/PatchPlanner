import { patchStatusState, type PatchStatus } from '../../lib/patchCapacity'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

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
 * One line under the sheet stating whether the plan holds (Slice 23 FR-015).
 * Three states, in order of how much they need attention: over capacity, gaps,
 * complete. The over-capacity state only becomes reachable once an event
 * declares a console — until then the tool has never been told how big the
 * desk is, and inventing a capacity would be worse than saying nothing.
 */
export function PatchStatusRail({ status, noun, onShowGaps, gapsOnly, onOpenRig }: PatchStatusRailProps) {
  const state = patchStatusState(status)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
      {state === 'complete' && <Badge variant="success">complete</Badge>}
      {state === 'gaps' && (
        <Badge variant="warning">
          {status.gaps.length} {status.gaps.length === 1 ? 'gap' : 'gaps'}
        </Badge>
      )}
      {state === 'over' && <Badge variant="danger">over capacity</Badge>}

      <span className="font-mono text-zinc-300">
        {status.rowCount} {status.rowCount === 1 ? noun : `${noun}s`}
      </span>

      {status.consoleLabels.length > 0 && (
        <span className="font-mono text-zinc-400">{status.consoleLabels.join(' · ')}</span>
      )}

      {status.boxes.length > 0 && (
        <span className="font-mono text-zinc-500">
          {status.boxes.map((box) => `${box.name} ${box.used}/${box.declared}`).join(' · ')}
        </span>
      )}

      <span className="font-mono text-zinc-500">{status.cablesPicked} cables picked</span>

      {state === 'over' && <span className="text-red-300">{status.overCapacity[0]}</span>}

      {state === 'gaps' && (
        <>
          <span className="text-amber-300">{status.gaps[0]}</span>
          {status.gaps.length > 1 && <span className="text-zinc-500">+{status.gaps.length - 1} more</span>}
          {onShowGaps && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onShowGaps}>
              {gapsOnly ? 'Show all' : 'Show only gaps'}
            </Button>
          )}
        </>
      )}

      {state === 'over' && onOpenRig && (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onOpenRig}>
          Open Rig
        </Button>
      )}
    </div>
  )
}
