import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4" onClick={onClose}>
      <div
        className={cn('w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl', className)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
          <button className="text-zinc-400 hover:text-zinc-100" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
