import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

interface StatusStripProps {
  /** The state's tint — border colour and ground, applied to both widths. */
  tint: string
  /**
   * The filter this strip offers, if it has anything to filter to. Absent for a
   * read-only role and for a state with nothing to report, and in both cases the strip
   * is a sentence rather than a control at either width.
   */
  filter?: { label: string; onClick: () => void }
  /**
   * Desktop-only controls that do not travel — today, `Open Rig`.
   *
   * The reason changed in Wave 6c and the prop did not. It used to be *"whose drawer is
   * not mounted on a phone (M5)"*, which was a deferral; the drawer is mounted now, and
   * Open Rig still does not come here, because **on a phone this strip is already the
   * filter control** and cannot hold a second target. It lives in the panel's overflow
   * instead (contracts/phone-surfaces.md §1).
   */
  desktopExtras?: ReactNode
  children: ReactNode
}

/**
 * The shell the four status rails share (Wave 6b), and the one place the phone's form
 * of a strip is decided.
 *
 * On a desktop this is what the rails already were: a `div` with a top border, the
 * ground *and* the rule tinted, and a control a size below `xs` — deliberately, because
 * a control inside a strip must not set the height of the bar closing the panel
 * (design/components.md §4).
 *
 * **On a phone the strip is the control.** That same `h-6 px-2` button is a 24px target
 * in the hand, and giving it 44px would double the height of the one element on the one
 * surface where height is rows. So the strip's root becomes the button: 44px minimum,
 * the full width of the panel, at the bottom edge where the thumb already is — and the
 * sentence and the control become the same object. The strip says *3 gaps*; tapping it
 * shows those three (patterns.md §7b).
 *
 * A strip with nothing to filter to — *complete*, *addressed*, *all covered* — draws no
 * chevron and is not a control. So does a strip whose caller passed no handler, which is
 * how a read-only role already sees every one of these (P7).
 *
 * What it says, how it derives it and which states tint are **not** here and do not
 * change with width (P9). This owns the shell, and nothing else.
 */
export function StatusStrip({ tint, filter, desktopExtras, children }: StatusStripProps) {
  const isMobile = useIsMobile()
  /*
    `print:hidden` is in the base as of Wave 6c, and it belongs there: a strip is chrome,
    and chrome does not print (§8).

    Four of the five rails never needed to say so, because their surfaces are inside a
    `print:hidden` wrapper already — so this is a no-op for them, and the only visible
    consequence is that the fifth stops carrying its own copy. `SignalFlowStatusRail` is
    the exception because Signal Flow's whole panel is *inside* `PrintSheet`, so its
    strip really was on the printed page until it said otherwise.
  */
  const base = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2 print:hidden'

  if (isMobile) {
    const content = (
      <>
        {children}
        {filter && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium">
            {filter.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </>
    )
    // `text-xs` rather than the desktop's `text-[11px]`: the phone takes the navigation
    // column, and 11px is a spec line, not a sentence (design/tokens.md §7).
    const phone = cn(base, 'min-h-[44px] text-left text-xs text-zinc-400', tint)
    if (!filter) return <div className={phone}>{content}</div>
    return (
      <button className={cn(phone, 'w-full')} onClick={filter.onClick} type="button">
        {content}
      </button>
    )
  }

  return (
    <div className={cn(base, 'text-[11px] text-zinc-400', tint)}>
      {children}
      {filter && (
        <Button size="xs" variant="ghost" className="h-6 px-2 text-[11px]" onClick={filter.onClick}>
          {filter.label}
        </Button>
      )}
      {desktopExtras}
    </div>
  )
}
