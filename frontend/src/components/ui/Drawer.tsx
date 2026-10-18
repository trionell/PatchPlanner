import { useEffect, useRef, type ReactNode } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useIsMobile } from '../../hooks/useIsMobile'
import { cn } from '../../lib/utils'
import { useInfoNote } from '../../hooks/useInfoNote'
import { InfoPanel, InfoToggle } from './InfoNote'
import { Sheet } from './Sheet'

interface DrawerBaseProps {
  open: boolean
  onClose: () => void
  title: string
  /** One line under the title, e.g. what the drawer's contents are shared by. */
  subtitle?: string
  /** wide = the Rig drawer (four kinds of equipment); narrow = Buses. */
  width?: 'wide' | 'narrow'
  /**
   * The body gives up its padding and the gap between its sections, at both
   * widths — for contents that are a construction of the panel's own rather than
   * a stack of `DrawerSection`s: a `PanelCols` whose rail is bordered on the edge
   * it shares with the sheet, and on a phone a run of full-bleed rows separated
   * by a hairline ([patterns.md](../../../design/patterns.md) §4, §7c). Both are
   * wrong inset by 20 px, and both are wrong with 20 px between them.
   *
   * The same prop `ui/Sheet` already has, forwarded — unlike `width`, which is
   * deliberately not, because a phone has one width and a sheet that accepted it
   * would carry an API it must never use.
   */
  flush?: boolean
  children: ReactNode
  footer?: ReactNode
}

/**
 * `info` — what the drawer's own actions do, said once and then put away
 * (`ui/InfoNote`) — and `noteId`, the name under which that choice is
 * remembered. They arrive together or not at all: a note the user can put away
 * is a note something has to remember, and this union is what stops a drawer
 * from having the one without the other.
 *
 * `info` used to be `footer` prose — a paragraph at the foot of Universes and the
 * old Buses drawer, correct and unread after the first time, and on a phone a
 * fifth of the screen. It sits beside the title now, closed, behind one `i`.
 *
 * **`noteId` is the note's identity, and `title` is not** (ROADMAP D5). The
 * title was the identity until this was written, which was safe only while every
 * title was a constant word. It is not: two drawers are called *Pricing* — what
 * a hire costs, and what a supplier charges — and shared one remembered choice,
 * so opening the `i` on one volunteered the other's sentence; and a title that
 * is a record's name (a catalog's) gave every catalog a private copy of one
 * shared explanation, orphaned on rename. A title is a label. It repeats, it is
 * chosen for the header, and it is sometimes data — none of which an identity
 * may be. So the call site names its note, in kebab-case, after what the drawer
 * *is*: `event-pricing`, `catalog-pricing`.
 */
type DrawerNoteProps = { info: ReactNode; noteId: string } | { info?: undefined; noteId?: undefined }

type DrawerProps = DrawerBaseProps & DrawerNoteProps

/**
 * A right-anchored overlay panel — the audio tabs' Rig drawer, Universes
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
export function Drawer({ open, onClose, title, subtitle, width = 'wide', flush = false, children, footer, info, noteId }: DrawerProps) {
  useEscapeToClose(open, onClose)
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  /*
    The same focus contract `ui/Sheet` has had since Wave 6a, which this had not
    — so on a phone a drawer returned focus to whatever opened it and on a desk
    it did not, one component behaving two ways.

    It is not a nicety. A drawer opened from inside a row editor leaves focus on
    `<body>` when it closes, and the editor binds `Escape` as a React
    `onKeyDown` on its own subtree — so the *second* Escape, the one meant to
    cancel the row, reaches nothing at all. Returning focus to the control that
    opened the drawer is what makes Escape-twice work.

    The mobile branch renders a `Sheet`, which does this itself; running both
    would fight over the same target, hence the desk-only guard.
  */
  useEffect(() => {
    if (!open || isMobile) return
    returnFocusTo.current = document.activeElement
    panelRef.current?.focus()
    return () => {
      const target = returnFocusTo.current
      // Best-effort: the invoking control may have unmounted with the row it
      // belonged to, in which case focus stays where the browser put it.
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [open, isMobile])
  // The `i` rides in the title's row, so a closed note costs the drawer no space.
  // Keyed by `noteId`, never by the title — see `DrawerNoteProps` for what that cost.
  // The `drawer:` prefix keeps these one namespace, apart from the panel notes
  // that name themselves (`flow-desk-job`, `plot-desk-job`).
  const note = useInfoNote({ id: noteId ? `drawer:${noteId}` : undefined })

  if (!open) return null

  // `width` is deliberately not forwarded: a phone has one width, so a sheet
  // that accepted it would carry an API it must never use (audit.md A11's
  // reasoning, applied to an anchor rather than to a tier).
  if (isMobile) {
    return (
      <Sheet
        open
        flush={flush}
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
          'flex h-full w-full flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none',
          width === 'wide' ? 'max-w-3xl' : 'max-w-md',
        )}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        tabIndex={-1}
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
            each carrying its own margin (Slice 24 FR-018) — unless the contents
            are one construction rather than a stack, which is what `flush` says. */}
        <div className={cn('flex-1 overflow-y-auto', !flush && 'px-5 py-4')}>
          {flush ? children : <div className="flex flex-col gap-5">{children}</div>}
        </div>
        {footer && <div className="border-t border-zinc-800 px-5 py-3 text-xs text-zinc-500">{footer}</div>}
      </div>
    </div>
  )
}
