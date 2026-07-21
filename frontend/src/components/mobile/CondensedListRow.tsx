import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The tight row layout used by every mobile list (channels, fixtures,
 * equipment, rentals, events) — denser than desktop's table rows so more
 * fits on screen without scrolling (research.md R6). `accentColor` draws
 * a left-edge stripe + faint tint (the console channel-color treatment);
 * omit it for lists with no per-row color concept.
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
  trailing?: ReactNode
  accentColor?: string
  onClick?: () => void
  className?: string
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-left',
        accentColor && 'border-l-[3px]',
        className,
      )}
      style={
        accentColor
          ? { borderLeftColor: accentColor, backgroundColor: `${accentColor}1a` }
          : undefined
      }
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-tight text-zinc-100">{title}</div>
        {subtitle && <div className="truncate text-[11px] leading-tight text-zinc-400">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
    </Comp>
  )
}
