import * as React from 'react'
import { cn } from '../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-500 focus:border-amber-500',
        className,
      )}
      {...props}
    />
  ),
)

Input.displayName = 'Input'
