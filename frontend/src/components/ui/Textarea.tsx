import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * `Input`'s multi-line sibling, with the same two sizes for the same reason.
 *
 * It exists because `OverviewTab` had already hand-copied the input's class string
 * onto a bare `<textarea>`, which is the point at which a "one-off" becomes a
 * second definition of the field style (design/audit.md A3).
 *
 * `min-h` rather than `h`: a note field is resized by the person writing the note.
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: 'sm' | 'md'
}

const sizeStyles = {
  sm: 'min-h-20 px-2 py-1.5 text-xs',
  md: 'min-h-32 px-3 py-2 text-sm',
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 outline-none ring-0 placeholder:text-zinc-500 focus:border-amber-500 disabled:opacity-60',
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  ),
)

Textarea.displayName = 'Textarea'
