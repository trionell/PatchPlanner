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
 * **Persisted for a viewer too**, unlike `StagePlotTab`'s pan which is gated on role. That
 * gate exists because a stage plot's view goes to the server and belongs to everybody;
 * this one is in `localStorage` and belongs to the person holding the device. Withholding
 * it from a read-only role would take something away from them and give it to nobody.
 */
export function usePlaneView({ eventId, tab, wrapperRef, zoom, zoomProp, origin, content, ready, onZoom }: PlaneViewOptions): { onScroll: () => void } {
  const [stored, setStored] = useFlowView(eventId, tab)
  const restored = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** When the restore last wrote a scroll offset, so its own echo is not saved back. */
  const settled = useRef(0)
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
      Latch only if the write **took**. A scroll container silently clamps an offset
      beyond its range, so a plane that is still growing would swallow the restore and
      report success; the next measurement gets another attempt instead. Rounded because
      a fractional scale gives back a fractional offset.
    */
    if (Math.abs(el.scrollLeft - offset.x) > 1 || Math.abs(el.scrollTop - offset.y) > 1) return
    restored.current = true
    // The scroll events this restore just caused arrive after it. Recording them is
    // harmless when the offset is right and destructive when it is not, so drop them.
    settled.current = Date.now()
  }, [stored, zoomProp, content, zoom, origin, ready, onZoom, wrapperRef])

  // A pan writes on the frame it happens; without settling that is a write per frame.
  const onScroll = useCallback(() => {
    const el = wrapperRef.current
    if (!el || !restored.current) return
    if (Date.now() - settled.current < 250) return
    if (timer.current) clearTimeout(timer.current)
    const left = el.scrollLeft
    const top = el.scrollTop
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
