import { useEffect, useRef } from 'react'

/**
 * Pinch-to-zoom a scrolling viewport, about the midpoint of the two contacts.
 *
 * One hook rather than a copy in each canvas, because the whole of it is focal-point
 * arithmetic and that is easy to get subtly wrong: the logical point under the midpoint
 * has to be the same before and after, which means adjusting the scroll offset in the
 * **same frame** as the scale. Two copies is two chances to be one frame late, and one
 * frame late reads as the graph sliding out from under the fingers (Slice 36 R12).
 *
 * The single-finger pan is deliberately *not* here: it is the platform's own scrolling,
 * which is available only because `patterns.md` §7g withholds the gestures that would
 * otherwise compete for the same finger. So the element keeps `touch-action: pan-x
 * pan-y`, and this hook claims two pointers and nothing else.
 */
export function usePinchZoom(
  ref: React.RefObject<HTMLElement | null>,
  {
    enabled,
    zoom,
    min,
    max,
    onZoom,
  }: {
    enabled: boolean
    /** The current scale, so a gesture starts from where the last one left off. */
    zoom: number
    min: number
    max: number
    /**
     * The new scale, plus the scroll offset that keeps the midpoint still. The caller
     * applies both — it owns the zoom, because the control for it lives in the bar.
     */
    onZoom: (next: number, anchor: { logicalX: number; logicalY: number; pointX: number; pointY: number }) => void
  },
) {
  // Everything the gesture needs is a ref: a pinch that re-rendered on every move would
  // re-run both canvases' cable-geometry effect dozens of times a second.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const origin = useRef<{ distance: number; zoom: number } | null>(null)
  const latest = useRef(zoom)
  // Mirrored in an effect, not during render: the gesture reads the live scale from a
  // listener, and a ref written during render is a ref written twice under StrictMode.
  useEffect(() => {
    latest.current = zoom
  }, [zoom])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const midpoint = () => {
      const [a, b] = [...pointers.current.values()]
      const rect = el.getBoundingClientRect()
      return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
    }
    const spread = () => {
      const [a, b] = [...pointers.current.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const down = (event: PointerEvent) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      origin.current = pointers.current.size === 2 ? { distance: spread(), zoom: latest.current } : null
    }

    const move = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.current.size !== 2 || !origin.current) return
      const distance = spread()
      if (!(distance > 0) || !(origin.current.distance > 0)) return
      // Claim the gesture: without this the browser's own page zoom takes the two
      // fingers and the panel leaves the screen with the canvas inside it.
      event.preventDefault()
      const point = midpoint()
      const next = Math.max(min, Math.min(max, origin.current.zoom * (distance / origin.current.distance)))
      onZoom(next, {
        // Where the midpoint is in the graph's own coordinates, at the scale it is being
        // read at now. Holding this still is the whole of the gesture.
        logicalX: (el.scrollLeft + point.x) / latest.current,
        logicalY: (el.scrollTop + point.y) / latest.current,
        pointX: point.x,
        pointY: point.y,
      })
    }

    const release = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId)
      if (pointers.current.size < 2) origin.current = null
    }

    // Captured for the cleanup: the maps are this hook's own, never a rendered node.
    const live = pointers
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move, { passive: false })
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('pointerleave', release)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', release)
      el.removeEventListener('pointercancel', release)
      el.removeEventListener('pointerleave', release)
      live.current.clear()
      origin.current = null
    }
  }, [ref, enabled, min, max, onZoom])
}
