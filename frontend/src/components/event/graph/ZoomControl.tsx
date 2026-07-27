import { Minus, Plus } from 'lucide-react'
import { Button } from '../../ui/Button'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.5
export const ZOOM_STEP = 0.1

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
 */
export function ZoomControl({ zoom, onZoomChange, onZoomIn, onZoomOut, onReset }: ZoomControlProps) {
  const step = (delta: number) => onZoomChange?.(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + delta) * 100) / 100)))
  const zoomOut = onZoomOut ?? (() => step(-ZOOM_STEP))
  const zoomIn = onZoomIn ?? (() => step(ZOOM_STEP))
  const reset = onReset ?? (() => onZoomChange?.(1))
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
