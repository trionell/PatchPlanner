import { useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

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
}

/**
 * A right-anchored overlay panel — the audio tabs' Rig and Buses drawers
 * (Slice 23). Deliberately an overlay rather than a flex sibling: it opens
 * over the sheet the user is cross-referencing, so the sheet's layout never
 * shifts, and narrowing the window can't squeeze the table
 * (research.md R13). Same conventions as Dialog: backdrop click closes,
 * `cn` merges classes, nothing renders when closed.
 */
export function Drawer({ open, onClose, title, subtitle, width = 'wide', children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

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
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <button aria-label="Close" className="text-zinc-400 hover:text-zinc-100" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {/* No gap utility here: the sections re-parented into these drawers
            carry their own `mb-6`, and doubling it reads as a broken layout. */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-zinc-800 px-5 py-3 text-xs text-zinc-500">{footer}</div>}
      </div>
    </div>
  )
}
