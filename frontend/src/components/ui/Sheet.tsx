import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { cn } from '../../lib/utils'

interface SheetProps {
  open: boolean
  onClose: () => void
  /** A string, or the rail's `MicroLabel` + `Pill` when the inspector uses it. */
  title: ReactNode
  /** One line under the title, e.g. what the sheet's contents are shared by. */
  subtitle?: string
  children: ReactNode
  /** The confirm row, or the drawer's statement line. The inspector passes none. */
  footer?: ReactNode
  /**
   * Off for the canvas inspector, and only it: that is the one sheet read
   * *against* what is behind it (patterns.md §7f). Withholding it renders no
   * backdrop element at all, so the canvas stays live and the sheet is
   * genuinely not modal — see research.md R2.
   */
  scrim?: boolean
  /** Contents that are a run of full-bleed rows own their own padding. */
  flush?: boolean
}

/**
 * The bottom sheet — the phone's sibling of `ui/Drawer`.
 *
 * It does three jobs (patterns.md §7d) — the row editor of §2, the drawer of
 * §3, the canvas inspector of §4 — and **decides nothing about any of them**.
 * That refusal is the reason it is worth a component rather than a `className`
 * on `Dialog`: a sheet holds another pattern's contents at that pattern's own
 * tier, so what goes in keeps its type and gives up only the geometry a finger
 * has to hit (tokens.md §7, amendment 2).
 *
 * Hence six props and no `variant`, no `size`, no `onSave` and no field layout.
 * What it does own is the shell: the anchor, the radius, the scrim and its one
 * exception, the internal scroll, `Escape`, and the safe-area inset under
 * whatever the last row is.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scrim = true,
  flush = false,
}: SheetProps) {
  useEscapeToClose(open, onClose)

  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusTo.current = document.activeElement
    panelRef.current?.focus()
    return () => {
      const target = returnFocusTo.current
      // Best-effort: the invoking control may have unmounted with the row it
      // belonged to, in which case focus stays where the browser put it.
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end',
        // `touch-none` on the scrim stops the page behind being scrolled
        // *through* it; `overscroll-contain` on the body stops a flick at the
        // body's end chaining out to the page. Two different leaks.
        scrim ? 'bg-zinc-950/80 touch-none' : 'pointer-events-none',
      )}
      onClick={scrim ? onClose : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal={scrim}
        aria-labelledby={titleId}
        className={cn(
          // `svh`, not `dvh` and not `vh`: `vh` is the largest viewport, so with
          // the address bar showing the sheet can start below the fold; `dvh` is
          // live, so the sheet would resize under the thumb as chrome collapses
          // while a long form is being read. `svh` is the smallest viewport and
          // can do neither (research.md R3).
          'flex max-h-[85svh] w-full flex-col rounded-t-xl border-t border-zinc-700 bg-zinc-900 shadow-2xl',
          'focus:outline-none',
          !scrim && 'pointer-events-auto',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-none items-center gap-2 border-b border-zinc-800 px-4 py-3.5">
          <div className="min-w-0">
            <div id={titleId} className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
              {title}
            </div>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {/* A 44px target, not a 14px glyph: below that a control is a
              suggestion (tokens.md §7, amendment 1). */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 ml-auto flex h-11 w-11 flex-none items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={cn(
            'flex flex-1 flex-col overflow-y-auto overscroll-contain',
            flush ? '' : 'gap-3.5 px-4 py-4',
          )}
        >
          {children}
        </div>

        {footer && (
          // The inset is *added to* the padding rather than absorbed by it: a
          // control the home indicator sits on is a control that misses.
          <div className="flex flex-none items-center gap-2 border-t border-zinc-800 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
