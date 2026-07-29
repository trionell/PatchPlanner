import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import type { InfoNoteState } from '../../hooks/useInfoNote'
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
 * So the sentence keeps its place and gains a lid. **It is not deleted and it is not a
 * tooltip** — a tooltip has no target on a touch screen, and `patterns.md` §7g requires
 * the reason a gesture is withheld to be *readable*, not hoverable.
 *
 * **The toggle and the text are separate**, and that is the point of the split: the `i`
 * rides in a row that already exists — beside a title — so a closed note costs **no
 * space at all**, while the text opens where the text belongs, full width, further down.
 * One component doing both would have to own a row to put the `i` in.
 *
 * ```tsx
 * const note = useInfoNote({ id: 'plot-desk-job', defaultOpen: true })
 * <MobilePanel title="Stage Plots" titleAdornment={<InfoToggle note={note} />}>
 *   <InfoPanel note={note}>Placing elements is a desk job — …</InfoPanel>
 * ```
 *
 * The state lives in `hooks/useInfoNote`, which is also where `id` — the thing that
 * makes a dismissal stick — is documented.
 */

/**
 * The `i`, for a row that already exists.
 *
 * Sized to sit *inside* a line of text rather than to stand on its own: negative margin
 * against its own padding, so it reaches a 44 px target while occupying a 16 px icon and
 * costs the title's row no height at all (tokens.md §7, amendment 1).
 */
export function InfoToggle({ note, className }: { note: InfoNoteState; className?: string }) {
  return (
    <button
      aria-expanded={note.open}
      aria-label={note.open ? 'Hide the explanation' : 'What is this?'}
      className={cn(
        '-m-2.5 inline-flex flex-none items-center justify-center p-2.5 transition-colors',
        note.open ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300',
        className,
      )}
      onClick={note.toggle}
      type="button"
    >
      <Info className="h-4 w-4" />
    </button>
  )
}

/** The sentence, where the sentence belongs. Renders nothing when the note is closed. */
export function InfoPanel({
  note,
  children,
  className,
}: {
  note: InfoNoteState
  children: ReactNode
  className?: string
}) {
  if (!note.open) return null
  return <div className={cn('text-xs leading-relaxed text-zinc-400', className)}>{children}</div>
}
