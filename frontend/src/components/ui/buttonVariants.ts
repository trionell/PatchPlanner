import { cva, type VariantProps } from 'class-variance-authority'

/**
 * The button's class map, in its own module (Slice 29 FR-049).
 *
 * It lives here rather than beside the component because a *link* needs it:
 * Login's sign-in control is an `<a>` — it navigates to an OAuth URL — and it
 * carried the primary button's classes **retyped**. That is P3's failure mode
 * exactly, and how the micro-label ended up with four definitions at two sizes.
 *
 * Not an `as` prop on `Button`: polymorphic typing is a large change to a
 * component seven surfaces render, for one caller.
 */
export const buttonVariants = cva(
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
        /** The work-surface size: panel bars, drawer sections, inspectors. */
        xs: 'h-7 px-2.5 text-xs',
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

export type ButtonVariantProps = VariantProps<typeof buttonVariants>

/** The same classes, for something that cannot be a `<button>`. */
export function buttonClasses(options: ButtonVariantProps = {}): string {
  return buttonVariants(options)
}
