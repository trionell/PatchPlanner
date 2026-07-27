import { createContext, useContext, useMemo, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

export function Tabs({ defaultValue, children, className }: { defaultValue: string; children: ReactNode; className?: string }) {
  const [value, setValue] = useState(defaultValue)
  const contextValue = useMemo(() => ({ value, setValue }), [value])
  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn('space-y-4', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

/**
 * No trough, deliberately (design/patterns.md §6).
 *
 * These tabs select *what you are looking at*. A trough — a bordered, filled
 * container holding the choices — belongs to an in-panel toggle selecting *how
 * you are looking at one thing*, e.g. Sheet versus Flow inside the audio panel's
 * bar. The two used to be drawn identically, so two controls that mean different
 * things looked the same.
 */
export function TabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('inline-flex flex-wrap gap-1', className)} {...props} />
}

export function Tab({ value, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useTabsContext()
  const active = context.value === value
  return (
    <button
      type="button"
      className={cn(
        'rounded-md px-3 py-1 text-sm transition-colors',
        active ? 'bg-amber-500 font-semibold text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        className,
      )}
      onClick={() => context.setValue(value)}
      {...props}
    >
      {children}
    </button>
  )
}

export function TabPanel({ value, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useTabsContext()
  if (context.value !== value) return null
  return <div className={cn(className)} {...props}>{children}</div>
}

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) throw new Error('Tabs components must be used inside Tabs')
  return context
}
