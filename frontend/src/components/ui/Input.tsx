import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * `sm` is the audio tabs' drawer and row-editor density (Slice 24): the approved
 * mockup's label-to-field proportions, at this app's 14px base rather than at the
 * mockup's own scaled-down 11px. It is opt-in rather than the new default,
 * because carrying that density to the rest of the application is a slice of its
 * own — every other tab keeps `md`, which is exactly what this component was
 * before.
 *
 * `size` shadows the native numeric attribute of the same name, which this app
 * has never used and which does nothing on a CSS-sized input.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
}

const sizeStyles = {
  sm: 'h-8 px-2 text-xs',
  md: 'h-10 px-3 text-sm',
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 outline-none ring-0 placeholder:text-zinc-500 focus:border-amber-500',
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  ),
)

Input.displayName = 'Input'
