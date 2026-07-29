import type { ReactNode } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useIsMobile } from '../../hooks/useIsMobile'
import { cn } from '../../lib/utils'
import { useInfoNote } from '../../hooks/useInfoNote'
import { InfoPanel, InfoToggle } from './InfoNote'
import { Sheet } from './Sheet'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  /** One line under the title, e.g. what the drawer's contents are shared by. */
  subtitle?: string
  /** wide = the Rig drawer (four kinds of equipment); narrow = Buses. */
  width?: 'wide' | 'narrow'
  children: ReactNode
  footer?: ReactNode
  /**
   * What the drawer's own actions do, said once and then put away (`ui/InfoNote`).
   *
   * These used to be `footer` prose — a paragraph at the foot of Universes, Buses and
   * Groups & DCAs, correct and unread after the first time, and on a phone a fifth of the
   * screen. It sits beside the title now, closed, behind one `i`.
   */
  info?: ReactNode
}

/**
 * A right-anchored overlay panel — the audio tabs' Rig and Buses drawers
 * (Slice 23). Deliberately an overlay rather than a flex sibling: it opens
 * over the sheet the user is cross-referencing, so the sheet's layout never
 * shifts, and narrowing the window can't squeeze the table
 * (research.md R13). Same conventions as Dialog: backdrop click closes,
 * `cn` merges classes, nothing renders when closed.
 *
 * **On a phone it is a `Sheet`** (patterns.md §7d). A column is the one thing a
 * 375px screen does not have, so the drawer gives up the edge it is anchored to
 * and keeps everything else — its contents are the work surface's tier at both
 * widths, and only the geometry a finger presses changes (tokens.md §7,
 * amendment 2). The branch lives here rather than at the call sites so that all
 * six drawers acquire a phone form at once; six call sites each answering the
 * same question is how `NodeShell` ended up with two copies.
 */
export function Drawer({ open, onClose, title, subtitle, width = 'wide', children, footer, info }: DrawerProps) {
  useEscapeToClose(open, onClose)
  const isMobile = useIsMobile()
  // The `i` rides in the title's row, so a closed note costs the drawer no space.
  const note = useInfoNote({ id: `drawer:${title}` })

  if (!open) return null

  // `width` is deliberately not forwarded: a phone has one width, so a sheet
  // that accepted it would carry an API it must never use (audit.md A11's
  // reasoning, applied to an anchor rather than to a tier).
  if (isMobile) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={
          <>
            {title}
            {info && <InfoToggle note={note} />}
          </>
        }
        subtitle={subtitle}
        footer={footer}
      >
        {info && <InfoPanel note={note}>{info}</InfoPanel>}
        {children}
      </Sheet>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/70" onClick={onClose}>
      <div
        className={cn(
          'flex h-full w-full flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl',
          width === 'wide' ? 'max-w-3xl' : 'max-w-md',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
              {info && <InfoToggle note={note} />}
            </div>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
            {info && <InfoPanel className="mt-2" note={note}>{info}</InfoPanel>}
          </div>
          <button aria-label="Close" className="ml-3 flex-none text-zinc-400 hover:text-zinc-100" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {/* Sections are stacked full width with one gap owned here, rather than
            each carrying its own margin (Slice 24 FR-018). */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">{children}</div>
        </div>
        {footer && <div className="border-t border-zinc-800 px-5 py-3 text-xs text-zinc-500">{footer}</div>}
      </div>
    </div>
  )
}
