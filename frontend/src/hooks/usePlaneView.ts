import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { panToScroll, scrollToPan, type PlaneOrigin } from '../lib/canvasPlane'
import { useFlowView } from './useFlowView'
import type { PatchTab } from './usePatchView'

/** How long a pan settles before it is written down. `StagePlotTab`'s figure. */
const SETTLE_MS = 800

export interface PlaneViewOptions {
  eventId: number
  tab: PatchTab
  /** The scrolling element — the window onto the plane. */
  wrapperRef: RefObject<HTMLDivElement | null>
  /** The scale in force. */
  zoom: number
  /**
   * Whether a scale has been *chosen* yet. `null` means the surface is still showing
   * *fit*, so a remembered zoom has not been applied and the scroll must not be restored
   * against the wrong scale.
   */
  zoomProp: number | null
  origin: PlaneOrigin
  /** The plane's measured extent. Zero means it has not been laid out yet. */
  content: { width: number; height: number }
  /**
   * Whether the graph's own data has arrived.
   *
   * **Not the same as the plane having a size**, which is the trap this exists for.
   * Neither tab gates its canvas on the query — they render with `?? []` — and a user with
   * a remembered view is exactly the user whose canvas mounts in Flow on a cold load. With
   * no data the layout still contains the constant pseudo-nodes (the Sources rail, and the
   * orphan node that exists because `consoles.length === 0`), so the plane measures a real
   * but tiny box, the restore is clamped into it, and the debounced save then writes that
   * clamped offset back over the remembered one. Every cold load would decay the view
   * toward the top-left.
   */
  ready: boolean
  /** Asks the owner of the zoom to adopt the remembered scale. */
  onZoom?: (zoom: number) => void
}

/**
 * Opening a flow canvas where it was last left, and remembering where that is
 * (Slice 37 FR-009).
 *
 * Lives in one hook rather than in each canvas because the ordering is the whole
 * difficulty and the two canvases are a near-mirror pair that has drifted before
 * (research.md R10): the scale is owned by the tab, the scroll offset is owned by the DOM,
 * and the plane's extent is not known until it has been laid out — so restoring takes
 * three renders and each one has to check that the previous has happened.
 *
 * **Persisted for a viewer too.** This is in `localStorage` and belongs to the person
 * holding the device; withholding it from a read-only role would take something away from
 * them and give it to nobody. `StagePlotTab`'s pan was gated on role because it went to
 * the server and belonged to everybody — `usePlotView` ended that (ROADMAP D3), and the
 * gate went with it.
 */
export function usePlaneView({ eventId, tab, wrapperRef, zoom, zoomProp, origin, content, ready, onZoom }: PlaneViewOptions): { onScroll: () => void } {
  const [stored, setStored] = useFlowView(eventId, tab)
  const restored = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The offset the restore actually left behind — read back, so it is the *clamped* value
   * the container settled on rather than the one that was asked for.
   *
   * The restore's own write raises scroll events after it. Recording them would write the
   * restored position straight back, which is harmless when it is right and destructive
   * when it is not, so they are skipped. Compared by value rather than timed: a window of
   * milliseconds can both swallow a real pan that happens inside it and miss a late echo
   * outside it, and this can do neither.
   */
  const echo = useRef<{ x: number; y: number } | null>(null)
  // Read inside the debounced write rather than captured, so a save that fires after a
  // zoom or a node move records what is true then, not what was true 800 ms ago.
  const latest = useRef({ zoom, origin })
  useEffect(() => {
    latest.current = { zoom, origin }
  }, [zoom, origin])

  useLayoutEffect(() => {
    if (restored.current) return
    // Nothing remembered on this device: the surface stays at fit, and that is the answer
    // rather than a missing one (FR-012).
    if (!stored) {
      restored.current = true
      return
    }
    // Step zero: the graph's own data. See the note on `ready`.
    if (!ready) return
    // Step one: ask for the scale. Until the tab adopts it, the plane is laid out at fit
    // and any offset computed here would be against the wrong zoom.
    if (zoomProp == null) {
      onZoom?.(stored.zoom)
      return
    }
    // Step two: wait for the plane to have a size. Scrolling a container whose content is
    // still 0 × 0 is silently clamped to zero — the bug this ordering exists to avoid.
    if (!content.width || !content.height) return
    const el = wrapperRef.current
    if (!el) return
    const offset = panToScroll({ x: stored.panX, y: stored.panY }, origin, zoom)
    el.scrollLeft = offset.x
    el.scrollTop = offset.y
    /*
      Latched even if the browser clamped the offset, and that is deliberate.

      A clamp used to mean *the plane is not built yet*, which is the bug `ready` now
      prevents — the data has arrived, the layout is final, and `content` was measured from
      it. What a clamp can still mean is that the graph genuinely shrank since the last
      visit, and then clamping is the right answer rather than a failed attempt.

      Retrying instead would be worse than doing nothing: this effect only re-runs when one
      of its dependencies changes, so a restore that can never succeed would never latch,
      and `onScroll` would then refuse to save anything for the life of the mount. A view
      that silently stops being remembered is harder to notice than one that opens clamped.
    */
    restored.current = true
    echo.current = { x: el.scrollLeft, y: el.scrollTop }
  }, [stored, zoomProp, content, zoom, origin, ready, onZoom, wrapperRef])

  // A pan writes on the frame it happens; without settling that is a write per frame.
  const onScroll = useCallback(() => {
    const el = wrapperRef.current
    if (!el || !restored.current) return
    const left = el.scrollLeft
    const top = el.scrollTop
    // The restore's own echo, and only that: the first offset that differs is a real pan,
    // and from then on nothing is skipped.
    if (echo.current && echo.current.x === left && echo.current.y === top) return
    echo.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const { zoom: z, origin: o } = latest.current
      const pan = scrollToPan({ x: left, y: top }, o, z)
      setStored({ zoom: z, panX: pan.x, panY: pan.y })
    }, SETTLE_MS)
  }, [setStored, wrapperRef])

  // A zoom change is a view change even with no scroll event behind it — the bar's `+`,
  // a pinch, a tap on *fit*. Recorded once the scale settles, so stepping through three
  // levels writes once.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !restored.current || zoomProp == null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // `latest.current`, for the reason the pan path gives: a node dragged left inside
      // the settling window moves the origin, and a captured one would be off by the delta.
      const { zoom: z, origin: o } = latest.current
      const pan = scrollToPan({ x: el.scrollLeft, y: el.scrollTop }, o, z)
      setStored({ zoom: z, panX: pan.x, panY: pan.y })
    }, SETTLE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomProp])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return { onScroll }
}
