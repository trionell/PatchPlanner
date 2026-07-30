import { Minus, Plus } from 'lucide-react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Button } from '../../ui/Button'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.5
export const ZOOM_STEP = 0.1

/** A 44 px stepper. `tokens.md` §7's panel-bar control, which is what the phone form is. */
const MOBILE_STEP = 'flex h-11 w-11 flex-none items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400'

interface ZoomControlProps {
  zoom: number
  /**
   * Additive stepping between `ZOOM_MIN` and `ZOOM_MAX` — the audio canvases,
   * whose zoom is a presentation nicety over a laid-out graph.
   */
  onZoomChange?: (zoom: number) => void
  /**
   * Explicit handlers, for a canvas that steps differently. Stage plots zoom
   * multiplicatively (×1.25) over 0.05–20 and re-centre the viewport as they go,
   * because that canvas is a scale drawing rather than a diagram: a plotter needs
   * to get from a whole stage down to one truss clamp.
   */
  onZoomIn?: () => void
  onZoomOut?: () => void
  onReset?: () => void
  /**
   * One word under the percentage, naming what tapping it does. **Phone only** — a desk
   * shows a percentage that resets to 100 %, which needs no caption.
   *
   * The flow canvases reset to *fit*, which is the first reset target in the application
   * that is not obvious, and a control whose reset target is not obvious has to say what
   * it is (design/patterns.md §7f; Slice 36 research R8).
   */
  resetLabel?: string
}

/**
 * The canvas zoom, drawn in the panel's toolbar (Slice 25 FR-020).
 *
 * The zoom level is the tab's state rather than the canvas's, for the same reason
 * the selection is: this control lives in the bar, and the bar belongs to the shell.
 * The canvas reads the value for its geometry and never sets it.
 *
 * Clicking the percentage resets to 100%, which is the one thing a zoom control
 * always needs and a pair of steppers cannot do.
 *
 * The component owns the **look**, the caller may own the **stepping** — the same
 * split as `Legend`, where the component owns the strokes and the caller owns the
 * wording. Three canvases now draw this control; only two of them agree on what a
 * step is.
 *
 * **And it has a phone form, inside itself** (Slice 36). `tokens.md` §7 amendment 1 puts
 * a 28 px target below the line where a control stops being a control, so Wave 6c
 * hand-built a second cluster inside `StagePlotTab` — correct with one phone canvas, and
 * the `NodeShell` mistake with three. The branch is here now and that copy is gone: the
 * fifth time in this wave that a branch inside a shared component gave several surfaces a
 * phone form at once, after `ui/Drawer` (6a), `StatusStrip` (6b) and `VocabularyPanel`
 * with the drawers (6c).
 */
export function ZoomControl({ zoom, onZoomChange, onZoomIn, onZoomOut, onReset, resetLabel }: ZoomControlProps) {
  const isMobile = useIsMobile()
  const step = (delta: number) => onZoomChange?.(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + delta) * 100) / 100)))
  const zoomOut = onZoomOut ?? (() => step(-ZOOM_STEP))
  const zoomIn = onZoomIn ?? (() => step(ZOOM_STEP))
  const reset = onReset ?? (() => onZoomChange?.(1))

  if (isMobile) {
    // The same three parts in the same order, at the geometry a finger has to hit
    // (tokens.md §7, amendment 2 — type is read, geometry is touched). The readout is
    // the middle target rather than a label between two: resetting is the one thing a
    // pair of steppers cannot do, and on a phone it is the way back to the whole graph.
    return (
      <span className="flex flex-none items-center gap-0.5">
        <button aria-label="Zoom out" className={MOBILE_STEP} onClick={zoomOut} type="button">
          <Minus className="h-4 w-4" />
        </button>
        <button
          aria-label="Reset zoom"
          className="flex h-11 w-14 flex-none flex-col items-center justify-center font-mono text-xs leading-tight tabular-nums text-zinc-300"
          onClick={reset}
          type="button"
        >
          <span>{Math.round(zoom * 100)}%</span>
          {resetLabel && <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{resetLabel}</span>}
        </button>
        <button aria-label="Zoom in" className={MOBILE_STEP} onClick={zoomIn} type="button">
          <Plus className="h-4 w-4" />
        </button>
      </span>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button size="xs" variant="ghost" className="w-7 p-0" onClick={zoomOut} title="Zoom out">
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <button
        type="button"
        onClick={reset}
        className="w-10 text-center font-mono text-[11px] tabular-nums text-zinc-400 hover:text-zinc-200"
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button size="xs" variant="ghost" className="w-7 p-0" onClick={zoomIn} title="Zoom in">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
