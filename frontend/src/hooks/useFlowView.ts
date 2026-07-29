import { useCallback, useState } from 'react'
import type { PatchTab } from './usePatchView'

/** Where a flow canvas is looking: the scale, and the logical point at the viewport's top-left. */
export interface FlowView {
  zoom: number
  panX: number
  panY: number
}

const storageKey = (eventId: number, tab: PatchTab) => `patchplanner.flowView.${eventId}.${tab}`

/**
 * What a stored view has to satisfy before it is allowed near a transform.
 *
 * Exported and pure because it is the only part of this hook the test harness can
 * see — `renderToStaticMarkup` has no DOM and therefore no `localStorage` — and it is
 * also the only part that can fail. A `NaN` zoom is `scale(NaN)` and a canvas that
 * renders nothing at all, and this value comes from storage: hand-writable, and
 * outliving any version of this app that wrote something else there.
 */
export function parseFlowView(raw: string | null): FlowView | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { zoom, panX, panY } = parsed as Record<'zoom' | 'panX' | 'panY', unknown>
  if (typeof zoom !== 'number' || typeof panX !== 'number' || typeof panY !== 'number') return null
  if (!Number.isFinite(zoom) || !Number.isFinite(panX) || !Number.isFinite(panY)) return null
  // Zero and below are not "zoomed out", they are a content box of nothing and NaN
  // scroll offsets — the same floor `fitScale` keeps on the way out (Slice 36).
  if (zoom <= 0) return null
  return { zoom, panX, panY }
}

function read(eventId: number, tab: PatchTab): FlowView | null {
  try {
    return parseFlowView(window.localStorage.getItem(storageKey(eventId, tab)))
  } catch {
    // Private-mode Safari throws on access. Not worth a crash; the surface opens at fit.
    return null
  }
}

/**
 * Where a flow canvas was last left, remembered per event and per surface (Slice 37
 * FR-009). `null` means this device has never opened it, and the caller opens at *fit*.
 *
 * **Deliberately `localStorage`, and not a column on `events`.** Revision 1 of the
 * mockup proposed six columns; `usePatchView` had already answered the question in
 * writing for these same two tabs — *"one user's viewing preference with no meaning to
 * anyone else sharing the event"* — and zoom is more of one, not less: a scale that
 * suits a 27-inch monitor is wrong on a phone by construction. In the database it would
 * let a phone decide where a desk opens, for everyone with access to the event, and let
 * two of one person's own devices overwrite each other on a debounce.
 *
 * Pan is stored in **logical** coordinates rather than scroll pixels, so it survives a
 * zoom change, a resize, and the plane's origin moving under it (research.md R4).
 *
 * The caller debounces. A pan writes on every frame it is given the chance to.
 */
export function useFlowView(eventId: number, tab: PatchTab): [FlowView | null, (view: FlowView) => void] {
  const [view, setViewState] = useState<FlowView | null>(() => read(eventId, tab))

  const setView = useCallback(
    (next: FlowView) => {
      setViewState(next)
      try {
        window.localStorage.setItem(storageKey(eventId, tab), JSON.stringify(next))
      } catch {
        // The view simply doesn't persist; the session still works.
      }
    },
    [eventId, tab],
  )

  return [view, setView]
}
