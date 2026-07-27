import * as React from 'react'
import { cn } from '../../lib/utils'
import { buttonVariants, type ButtonVariantProps } from './buttonVariants'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
