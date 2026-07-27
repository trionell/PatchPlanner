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

interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selects this tab within an enclosing `Tabs`. */
  value?: string
  /**
   * Drives the tab directly, for a selector that means the same thing but keeps
   * its choice somewhere else — Stage Plots picks between sibling plots, which is
   * "what you are looking at" exactly as these are, but that choice also clears
   * the canvas selection and so cannot live in this context.
   */
  active?: boolean
}

export function Tab({ value, active, className, children, onClick, ...props }: TabProps) {
  const context = useContext(TabsContext)
  const isActive = active ?? (context != null && value != null && context.value === value)
  return (
    <button
      type="button"
      className={cn(
        'rounded-md px-3 py-1 text-sm transition-colors',
        isActive ? 'bg-amber-500 font-semibold text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        if (context != null && value != null) context.setValue(value)
      }}
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
