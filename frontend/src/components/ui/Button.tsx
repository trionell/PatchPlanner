import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-amber-500 bg-amber-500 text-zinc-950 hover:bg-amber-400',
        secondary: 'border-zinc-700 bg-zinc-700 text-zinc-100 hover:bg-zinc-600',
        ghost: 'border-transparent bg-transparent text-zinc-100 hover:bg-zinc-800',
        destructive: 'border-red-500 bg-red-500 text-white hover:bg-red-400',
        outline: 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
