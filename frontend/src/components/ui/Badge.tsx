import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-zinc-700 text-zinc-100',
      mic: 'bg-sky-500/15 text-sky-300',
      line: 'bg-violet-500/15 text-violet-300',
      di: 'bg-emerald-500/15 text-emerald-300',
      return: 'bg-amber-500/15 text-amber-300',
      aux: 'bg-pink-500/15 text-pink-300',
      foh: 'bg-cyan-500/15 text-cyan-300',
      monitor: 'bg-emerald-500/15 text-emerald-300',
      sub: 'bg-red-500/15 text-red-300',
      matrix: 'bg-indigo-500/15 text-indigo-300',
      stereo: 'bg-purple-500/15 text-purple-300',
      iem: 'bg-orange-500/15 text-orange-300',
      success: 'bg-emerald-500/15 text-emerald-300',
      warning: 'bg-amber-500/15 text-amber-300',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
