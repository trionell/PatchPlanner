import { Minus, Plus } from 'lucide-react'
import { Button } from '../../ui/Button'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.5
export const ZOOM_STEP = 0.1

/**
 * The canvas zoom, drawn in the panel's toolbar (Slice 25 FR-020).
 *
 * The zoom level is the tab's state rather than the canvas's, for the same reason
 * the selection is: this control lives in the bar, and the bar belongs to the shell.
 * The canvas reads the value for its geometry and never sets it.
 *
 * Clicking the percentage resets to 100%, which is the one thing a zoom control
 * always needs and a pair of steppers cannot do.
 */
export function ZoomControl({ zoom, onZoomChange }: { zoom: number; onZoomChange: (zoom: number) => void }) {
  const step = (delta: number) => onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + delta) * 100) / 100)))
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button size="xs" variant="ghost" className="w-7 p-0" onClick={() => step(-ZOOM_STEP)} title="Zoom out">
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <button
        type="button"
        onClick={() => onZoomChange(1)}
        className="w-10 text-center font-mono text-[11px] tabular-nums text-zinc-400 hover:text-zinc-200"
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button size="xs" variant="ghost" className="w-7 p-0" onClick={() => step(ZOOM_STEP)} title="Zoom in">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
