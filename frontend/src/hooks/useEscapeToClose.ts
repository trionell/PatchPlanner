import { useEffect, useState } from 'react'

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
 *
 * **Escape closes the topmost overlay, and only it.** Every open caller used to
 * listen on `window` independently, so one key closed all of them at once — which
 * costs nothing while overlays never nest and is wrong the moment one does. The
 * event's own `stopPropagation` cannot arbitrate this: both listeners are on the
 * same target, so neither is inside the other. A stack can, and the last entry is
 * by construction the overlay drawn on top (ROADMAP D4: the catalog browse is a
 * drawer whose phone form holds `MobilePicker`, which opens a sheet of its own).
 *
 * **Registering is its own effect, and that is the whole trick.** Every caller
 * passes an inline `onClose`, so a listener effect that depends on it re-runs on
 * every render of the caller — and a stack pushed there would move the *bottom*
 * overlay back to the top whenever anything above it re-rendered, which is a
 * background refetch on any surface holding two. So the stack is keyed to
 * *becoming open*, and the listener re-binds as often as it likes underneath it.
 */
const stack: symbol[] = []

export function useEscapeToClose(active: boolean, onClose: () => void): void {
  /*
    One identity per mounted overlay, stable across its renders. `useState` with an
    initialiser rather than `useRef`: a ref may not be read during render, and a
    `useMemo` is a cache React is allowed to drop — this identity is the thing the
    stack is keyed by, so it has to survive.
  */
  const [token] = useState(() => Symbol('overlay'))

  useEffect(() => {
    if (!active) return
    stack.push(token)
    return () => {
      // Guarded: `splice(-1, 1)` drops the *last* entry, which is the overlay on
      // top — a silent way to close the wrong one if a cleanup ever runs twice.
      const at = stack.indexOf(token)
      if (at !== -1) stack.splice(at, 1)
    }
  }, [active, token])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === token) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, onClose, token])
}
