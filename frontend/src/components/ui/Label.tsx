import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The two label tiers, in one file so that picking the wrong one takes a
 * deliberate act rather than an absent-minded import (design/components.md §1).
 *
 * Which one applies is decided by the *surface*, never by the component: a
 * micro-label inside a dialog is as wrong as a 14px form label inside a drawer.
 */

/**
 * The work surface's one label: mono, tiny, wide-tracked, quiet.
 *
 * Lives here rather than in `graph/tokens.ts` because it is not a canvas value —
 * the sheet header, the drawer sections, the inspector fields and the canvas all
 * render it, which is four places across three layers. `graph/tokens.ts`
 * re-exports it so canvas code still has one import for canvas values.
 */
export const MICRO_LABEL = 'font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500'

export function MicroLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn(MICRO_LABEL, className)}>{children}</span>
}

/**
 * The navigation surface's form label: sans, sentence case, above its control.
 *
 * Not a `tier` prop on `FieldStack`: that component also owns column widths which
 * only make sense inside a drawer's wrapping form row, so a navigation-tier
 * `FieldStack` would carry an API it must never use (design/audit.md A11).
 */
export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-sm text-zinc-300', className)} {...props} />
}
