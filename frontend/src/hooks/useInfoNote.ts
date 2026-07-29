import { useState } from 'react'

/**
 * The open/closed state of an explanation you can put away — see `ui/InfoNote`.
 *
 * In its own file because Fast Refresh only works when a module exports components and
 * nothing else, and a module that half-refreshes is how a browser ends up running a
 * version of a component that never existed on disk. Slice 35 lost an afternoon to
 * exactly that.
 */
export interface InfoNoteState {
  open: boolean
  toggle: () => void
}

export function useInfoNote({ id, defaultOpen = false }: { id?: string; defaultOpen?: boolean } = {}): InfoNoteState {
  const key = id ? `pp-info:${id}` : undefined

  /*
    Lazy initial state, and the `window` guard is not optional: this project's tests
    render on the server with no `window`, so reaching for `localStorage` unguarded makes
    every component holding a note unrenderable — the same trap `useIsMobile` guards.
  */
  const [open, setOpen] = useState(() => {
    if (!key || typeof window === 'undefined') return defaultOpen
    const stored = window.localStorage.getItem(key)
    return stored == null ? defaultOpen : stored === 'open'
  })

  return {
    open,
    toggle: () => {
      const next = !open
      setOpen(next)
      if (key && typeof window !== 'undefined') window.localStorage.setItem(key, next ? 'open' : 'closed')
    },
  }
}
