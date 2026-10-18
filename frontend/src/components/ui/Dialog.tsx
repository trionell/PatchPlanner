import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { cn } from '../../lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /**
   * Pinned below the body that scrolls (design/components.md §ui/Dialog, A1), so
   * the action stays on screen however long the body is. Callers without one are
   * unchanged: their buttons are the body's last child.
   */
  footer?: ReactNode
  className?: string
}

/**
 * A centred overlay, for short confirmations and pickers.
 *
 * **It stays centred at every width.** The rule, so it stops being decided per
 * call site: *an overlay with fields is a `Sheet`; an overlay that is a
 * sentence and two buttons is a `Dialog`.* audit.md M8 was never
 * "`Dialog` is the wrong shape" — it was "`Dialog` is being used as the phone's
 * edit form", which Slice 33 fixed at the call sites.
 *
 * What it gained there is the two things `Drawer` already had: `Escape`, and an
 * internal scroll at the sheet's own `85svh`, so a tall overlay behaves the same
 * way whichever anchor it has. A dialog taller than the viewport used to
 * overflow off both ends with no way to reach either.
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  useEscapeToClose(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4" onClick={onClose}>
      <div
        className={cn(
          'flex max-h-[85svh] w-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
          {/* 44 px on a phone, as the Sheet's close is (A2): it is the control pressed to back out. */}
          <button
            aria-label="Close"
            className="-mr-3 flex h-11 w-11 flex-none items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-100 md:-mr-2 md:h-8 md:w-8"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
