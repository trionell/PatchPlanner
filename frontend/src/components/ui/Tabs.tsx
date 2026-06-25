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

export function TabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('inline-flex gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-1', className)} {...props} />
}

export function Tab({ value, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useTabsContext()
  const active = context.value === value
  return (
    <button
      type="button"
      className={cn(
        'rounded-md px-4 py-2 text-sm transition-colors',
        active ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800',
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
