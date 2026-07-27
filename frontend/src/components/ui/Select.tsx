import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options?: Array<{ label: string; value: string | number }>
  /** See Input: `sm` is the audio tabs' drawer and row-editor density (Slice 24). */
  size?: 'sm' | 'md'
}

const sizeStyles = {
  sm: 'h-8 px-2 text-xs',
  md: 'h-10 px-3 text-sm',
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, options, size = 'md', ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 outline-none focus:border-amber-500',
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {options
        ? options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        : children}
    </select>
  ),
)

Select.displayName = 'Select'
