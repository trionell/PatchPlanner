import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import { vocabularyTint } from '../../lib/vocabularyTint'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Accepts any vocabulary value; values without a dedicated style (e.g.
   * user-added signal or output types) fall back to the neutral look.
   */
  variant?: string
}

/**
 * The navigation surface's chip. `Pill` in `ui/SheetTable` is the work-surface
 * size of the same thing; both read their tint from `vocabularyTint`, so the two
 * cannot disagree about what colour a value is.
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        vocabularyTint(variant),
        className,
      )}
      {...props}
    />
  )
}
