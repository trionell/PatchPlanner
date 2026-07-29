import { useState, type ReactNode } from 'react'
import { Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * An explanation you can put away.
 *
 * Some things have to be *said once* — what **Auto-assign** does differently from
 * **Optimise**, why a plot will not let you move a riser — and then never again to the
 * person who has read them. Standing prose costs its space on every visit, and the
 * drawers had grown a paragraph each at the foot: correct, unread after the first time,
 * and on a phone a fifth of the screen.
 *
 * So the sentence keeps its place and gains a lid. Closed it is one `i` target; open it
 * is the same words it always was. **It is not deleted and it is not a tooltip** — a
 * tooltip has no target on a touch screen, and `patterns.md` §7g requires the reason a
 * gesture is withheld to be *readable*, not hoverable.
 *
 * `id` makes the choice stick. Someone who closed it on Tuesday has still read it on
 * Wednesday, and a note that reopens every visit is a note that was never dismissible.
 */
export function InfoNote({
  children,
  id,
  defaultOpen = false,
  className,
}: {
  children: ReactNode
  /** Storage key for the dismissal. Omit to make the state last only as long as the mount. */
  id?: string
  /** True where the note answers a question the surface itself raises — see `StagePlotTab`. */
  defaultOpen?: boolean
  className?: string
}) {
  const key = id ? `pp-info:${id}` : undefined

  /*
    Lazy initial state, and the `window` guard is not optional: this project's tests
    render on the server with no `window`, so reaching for `localStorage` unguarded makes
    every component holding a note unrenderable — the same trap `useIsMobile` guards.
  */
  const [open, setOpen] = useState(() => {
    if (!key || typeof window === 'undefined') return defaultOpen
    const stored = window.localStorage.getItem(key)
    return stored == null ? defaultOpen : stored === 'open'
  })

  const set = (next: boolean) => {
    setOpen(next)
    if (key && typeof window !== 'undefined') window.localStorage.setItem(key, next ? 'open' : 'closed')
  }

  if (!open) {
    return (
      <button
        aria-label="What is this?"
        className={cn(
          'flex h-8 w-8 flex-none items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300',
          className,
        )}
        onClick={() => set(true)}
        type="button"
      >
        <Info className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className={cn('flex items-start gap-2 text-xs leading-relaxed text-zinc-400', className)}>
      <Info className="mt-0.5 h-4 w-4 flex-none text-zinc-500" />
      <div className="min-w-0 flex-1">{children}</div>
      {/* 44px on a phone, because it is the control that gets pressed once the sentence
          has been read; the icon inside it stays 14px (tokens.md §7, amendment 1). */}
      <button
        aria-label="Hide this"
        className="-my-2 -mr-1 flex h-11 w-11 flex-none items-center justify-center text-zinc-500 hover:text-zinc-300 md:-my-1 md:h-7 md:w-7"
        onClick={() => set(false)}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
