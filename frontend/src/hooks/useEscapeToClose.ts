import { useEffect } from 'react'

/**
 * Close an overlay on `Escape`.
 *
 * `Drawer` has had this effect inline since Slice 23; `Dialog` and `Sheet` both
 * want it now, which makes three callers. Principle V forbids abstracting ahead
 * of a second caller — it does not ask for a third copy.
 *
 * It owns the key and nothing else: not focus, not scroll locking, not the
 * backdrop, because only one of the three callers wants each of those the same
 * way (research.md R5). Call it *before* the caller's `if (!open) return null` —
 * a hook may not sit behind an early return.
 */
export function useEscapeToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, onClose])
}
