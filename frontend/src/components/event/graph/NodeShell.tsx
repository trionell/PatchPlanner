import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import {
  NODE_BADGE,
  NODE_BODY,
  NODE_BORDER,
  NODE_BORDER_DESK,
  NODE_BORDER_SELECTED,
  NODE_CHROME,
  NODE_FOOTER,
  NODE_HEADER,
  PORT_ROW,
} from './tokens'

/**
 * A box on either graph (Slice 25 FR-027).
 *
 * Both canvases used to hold their own copy of this, along with their own `PortDot`
 * and `PortRow` — which is exactly why they drifted apart, and why the reporter
 * could tell the two graphs' boxes apart. Sharing them makes "the two graphs look
 * the same" true by construction rather than by care.
 *
 * The `desk` variant wears an amber border: it is the box every other box on the
 * canvas is arranged around, and a badge alone did not distinguish it (FR-031).
 */
export function NodeShell({
  x,
  y,
  width,
  title,
  badge,
  footer,
  footerAlarm,
  dimmed,
  selected,
  desk,
  onDragStart,
  onDelete,
  onSelect,
  children,
}: {
  x: number
  y: number
  width: number
  title: string
  badge?: string
  footer?: ReactNode
  /** The footer states a capacity the patch has outgrown. */
  footerAlarm?: boolean
  /** Search is active and this box doesn't match — still drawn, just quiet. */
  dimmed?: boolean
  selected?: boolean
  desk?: boolean
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  onSelect?: () => void
  children: ReactNode
}) {
  const border = selected ? NODE_BORDER_SELECTED : desk ? NODE_BORDER_DESK : NODE_BORDER
  return (
    <div
      className={`absolute ${NODE_CHROME} ${border} transition-opacity ${dimmed ? 'opacity-30' : ''}`}
      style={{ left: x, top: y, width }}
    >
      <div
        className={`${NODE_HEADER} rounded-t-[7px] ${onDragStart ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
        onPointerDown={onDragStart}
        onClick={onSelect}
      >
        <span className="truncate">{title}</span>
        {badge && <span className={NODE_BADGE}>{badge}</span>}
        {onDelete && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className={`${badge ? '' : 'ml-auto'} shrink-0 text-zinc-500 hover:text-red-400`}
            aria-label={`Delete ${title}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className={NODE_BODY}>{children}</div>
      {footer && <div className={`${NODE_FOOTER} ${footerAlarm ? 'text-red-400' : ''}`}>{footer}</div>}
    </div>
  )
}

/**
 * What a box says instead of drawing thirty-two rows (Slice 25 FR-029). A 32-jack
 * stagebox is ordinary, and eight rows plus a count is legible where a wall of
 * thirty-two is not — so this is a readability device, not an apology.
 */
export function MoreRow({ hidden }: { hidden: number }) {
  return <div className={`${PORT_ROW} text-zinc-600`}>⋯ {hidden} more</div>
}
