import type { ReactNode } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { cn } from '../../lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
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
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
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
          <button className="text-zinc-400 hover:text-zinc-100" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
