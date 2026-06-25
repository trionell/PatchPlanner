import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: Array<{ label: string; value: string | number }>
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, options, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-amber-500',
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
