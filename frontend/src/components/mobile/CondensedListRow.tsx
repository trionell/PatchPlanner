import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * One row in a `ui/MobilePanel` (patterns.md §7c).
 *
 * It used to be a card — its own `rounded-md border border-zinc-800 bg-zinc-900`, at
 * `px-2.5 py-1.5` with a 13px title over an 11px subtitle, separated from the next one
 * by a gap. That is what made a phone list read as a column of controls rather than as a
 * list, and none of those three values is in either density tier (audit.md M1, M2).
 * Inside a frame it needs none of them: the panel's ground is behind it and a hairline
 * separates it from the next.
 *
 * **The stated value is the height, not the padding.** `min-h-[44px]` with
 * `leading-tight` on both lines; `py-1.5` is what falls out of it. tokens.md §7 used to
 * state `px-3 py-2.5` *and* "44 px tall" in the same table row, and at the framework's
 * default line boxes that padding makes a 56px row — a quarter taller than this one, and
 * two rows of data off a 667px handset. A padding is an input; a row height is the thing
 * anyone actually cares about, and stating both is what let them disagree for five waves
 * (audit.md M2, F3).
 *
 * The type goes *up* a step in the same change — 13/11 becomes the navigation tier's
 * 14/12 — and the pitch still falls from 48px to 45.5px, because the card's own border
 * and the gap to the next one are what paid for it.
 */
export function CondensedListRow({
  title,
  subtitle,
  trailing,
  accentColor,
  onClick,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** One state or one affordance, never both. Not its own tap target — the row is. */
  trailing?: ReactNode
  /** The entity's derived colour: a 3px leading edge and a `1a` tint, as on the sheet. */
  accentColor?: string
  onClick?: () => void
  className?: string
}) {
  const Comp = onClick ? 'button' : 'div'
  const tint = accentColor ? { backgroundColor: `${accentColor}1a` } : undefined
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex min-h-[44px] w-full items-stretch border-b border-zinc-800/60 text-left', className)}
    >
      {/* The tape bar is its own element rather than a border on the row, so the tint can
          belong to the content beside it — the sheet's 3px bar, in the geometry a phone
          row has (tokens.md §7). */}
      {accentColor && <span aria-hidden className="w-[3px] shrink-0" style={{ backgroundColor: accentColor }} />}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-1.5" style={tint}>
        {/* Both lines truncate. A row that grows to fit its content breaks the pitch the
            list is read at, which is the one thing a 44px row is for. */}
        <div className="truncate text-sm font-medium leading-tight text-zinc-100">{title}</div>
        {subtitle && <div className="truncate text-xs leading-tight text-zinc-400">{subtitle}</div>}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-1.5 pr-3" style={tint}>
          {trailing}
        </div>
      )}
    </Comp>
  )
}
