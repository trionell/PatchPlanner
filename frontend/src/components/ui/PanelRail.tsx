import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * A filter column of a work panel (Slice 29 US1/US4).
 *
 * The third instance of the pattern `design/patterns.md` §4 names: the stage
 * plot's palette on a `border-r`, the inspector rail on a `border-l`, and this.
 * A column of the panel, bordered on the edge it shares with the content —
 * never a card beside it, and never a drawer.
 *
 * **A filter has to be entirely visible.** The inventory page's twelve
 * categories showed about four, because each tile carried a rename, a delete, a
 * picker-role select and a count stacked in its corner. A filter you have to
 * scroll to use is not doing its job, so everything that was not filtering moved
 * into a drawer and the rail was left doing one thing.
 *
 * That is why `PanelRailRow` takes no `children` and no action slot. Adding one
 * would re-create the tiles.
 */

export function PanelCols({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-stretch', className)}>{children}</div>
}

/**
 * **Give it no height of its own.** `PanelCols` stretches it to the panel, so
 * it is already as tall as the sheet beside it and only scrolls when its own
 * rows outrun that. The inventory rail carried a `max-h-[70vh]` and the result
 * was the failure this component exists to prevent: twenty-seven categories cut
 * off at the fold, in a private scrollbar, on a page with room to spare below.
 *
 * A cap is only ever right if the panel itself is pinned to the viewport, and
 * none of them are.
 */
export function PanelRail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex w-56 shrink-0 flex-col gap-px overflow-y-auto border-r border-zinc-800 p-1.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The content beside a rail. `min-w-0` so a wide sheet scrolls rather than pushing the rail. */
export function PanelMain({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-1 flex-col', className)}>{children}</div>
}

interface PanelRailRowProps {
  label: string
  /** A muted qualifier after the label — a category's type, and nothing longer. */
  qualifier?: string
  count?: number
  selected?: boolean
  onSelect: () => void
}

export function PanelRailRow({ label, qualifier, count, selected, onSelect }: PanelRailRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
        selected ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-300 hover:bg-zinc-800/40',
      )}
    >
      <span className="truncate">{label}</span>
      {qualifier && <span className="shrink-0 text-[11px] text-zinc-600">{qualifier}</span>}
      {count != null && (
        <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">{count}</span>
      )}
    </button>
  )
}
