import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clampPlotZoom, roundCm } from '../lib/stagePlot'
import { parseFlowView } from './useFlowView'

/**
 * Where a plot's canvas is looking: the scale in px per cm, and the cm point at the
 * viewport's top-left. `StagePlotCanvas` re-exports this as its prop type — it is the
 * canvas's viewport, but it is this hook that owns and outlives it.
 */
export interface PlotViewState {
  zoom: number
  panX: number
  panY: number
}

/** How long a pan or a zoom settles before it is written down. This tab's own figure,
 *  which `usePlaneView` then took. */
const SETTLE_MS = 800

const storageKey = (plotId: number) => `patchplanner.plotView.${plotId}`

/** Where a plot opens on a device that has never held it: the origin corner, a little
 *  outside it so the stage's 0,0 is not against the edge, at 1 cm to the pixel.
 *  Frozen because it is handed out as the live view and only ever read or spread. */
export const DEFAULT_PLOT_VIEW: PlotViewState = Object.freeze({ zoom: 1, panX: -50, panY: -50 })

/**
 * What a stored plot view has to satisfy before it reaches a transform.
 *
 * The shape is `useFlowView`'s exactly — a scale and a logical top-left — so the parse
 * is too, and only the ceiling is new: the flow canvases have no maximum scale, and this
 * one does. A remembered zoom outside `[MIN_PLOT_ZOOM, MAX_PLOT_ZOOM]` is clamped rather
 * than rejected, because a plot opened at 400× is a view someone can still recognise once
 * they zoom out, and one thrown away is not.
 */
export function parsePlotView(raw: string | null): PlotViewState | null {
  const view = parseFlowView(raw)
  return view && { ...view, zoom: clampPlotZoom(view.zoom) }
}

function read(plotId: number): PlotViewState | null {
  try {
    return parsePlotView(window.localStorage.getItem(storageKey(plotId)))
  } catch {
    // Private-mode Safari throws on access. The plot opens at the default instead.
    return null
  }
}

/**
 * Where a stage plot's canvas was last left, remembered per plot **on this device**
 * (ROADMAP D3).
 *
 * The three values used to be columns on `stage_plots`, written on a debounce by anyone
 * with more than read access. That made one person's view everybody's: a collaborator
 * panning a phone decided where your desk opened next, and two of your own devices
 * overwrote each other. It is the same argument `useFlowView` makes for the flow
 * canvases and `usePatchView` makes for the tab — a view is one person's view of one
 * screen, and a scale that suits a 27-inch monitor is wrong in a hand by construction.
 *
 * **The columns are still there and still returned**; nothing reads them. Dropping them
 * is a migration whose `down` cannot restore what it deleted, and the reward for running
 * it is three unread floats.
 *
 * Unlike the old server write, this is **not gated on role**. A viewer's pan is theirs,
 * lives on their device, and withholding it would take something from them and give it
 * to nobody.
 *
 * `active_view` (Top / Front / Side) deliberately stays on the plot: that one is a shared
 * setting, which is why the phone's own view choice is separate local state in the tab.
 */
export function usePlotView(plotId: number | null): [PlotViewState, (next: PlotViewState) => void, (plotId: number) => void] {
  // The session's views, per plot. Storage is the slower half of the same memory: it is
  // read once per plot, and written 800 ms after the hand stops.
  const [views, setViews] = useState<Record<number, PlotViewState>>({})
  const stored = useMemo(() => (plotId == null ? null : read(plotId)), [plotId])
  const view = (plotId != null ? views[plotId] : undefined) ?? stored ?? DEFAULT_PLOT_VIEW

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ plotId: number; view: PlotViewState } | null>(null)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const write = pending.current
    pending.current = null
    if (!write) return
    try {
      // Rounded on the way out, as the server write was: the grain is 0.1 mm, and it
      // keeps a pan from accumulating twelve decimals of float noise in storage.
      const { zoom, panX, panY } = write.view
      window.localStorage.setItem(storageKey(write.plotId), JSON.stringify({ zoom, panX: roundCm(panX), panY: roundCm(panY) }))
    } catch {
      // The view simply doesn't persist; the session still works.
    }
  }, [])

  const setView = useCallback(
    (next: PlotViewState) => {
      if (plotId == null) return
      setViews((prev) => ({ ...prev, [plotId]: next }))
      // One timer serves every plot, so the first frame of a pan on the plot just switched
      // to would otherwise cancel the settling write of the one left behind. Sent now
      // instead of never.
      if (pending.current && pending.current.plotId !== plotId) flush()
      pending.current = { plotId, view: next }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SETTLE_MS)
    },
    [plotId, flush],
  )

  /** A plot that no longer exists: drop its key, and the write still settling for it. */
  const forget = useCallback((gone: number) => {
    if (pending.current?.plotId === gone) {
      pending.current = null
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    setViews((prev) => {
      if (!(gone in prev)) return prev
      const next = { ...prev }
      delete next[gone]
      return next
    })
    try {
      window.localStorage.removeItem(storageKey(gone))
    } catch {
      // Nothing to recover from: the key outlives the plot and is never read again.
    }
  }, [])

  // Leaving the tab inside the settling window is a pan that happened; `flush` is stable,
  // so this is an unmount handler and not a write per render. `pagehide` is the other way
  // out — a reload or a closed tab unmounts nothing — and it is the event that fires on
  // iOS, where `beforeunload` does not.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return [view, setView, forget]
}
