import { describe, expect, it } from 'vitest'
import { DEFAULT_PLOT_VIEW, parsePlotView } from './usePlotView'

/**
 * Only the parse is testable here, for `useFlowView.test`'s reason: the harness renders
 * to static markup and has no DOM, so it has no `localStorage`. What that leaves is the
 * one part a hand-edited or outlived stored value can reach.
 */
describe('parsePlotView', () => {
  it('round-trips a view it wrote', () => {
    expect(parsePlotView(JSON.stringify({ zoom: 0.4, panX: -320.5, panY: 180 }))).toEqual({
      zoom: 0.4,
      panX: -320.5,
      panY: 180,
    })
  })

  it('treats a device that has never opened the plot as absent', () => {
    // Not an error and not a zero — the caller opens at the default, which is a view
    // and not a fallback.
    expect(parsePlotView(null)).toBeNull()
    expect(parsePlotView('{ not json')).toBeNull()
    expect(parsePlotView(JSON.stringify({ zoom: 1, panX: 0 }))).toBeNull()
    expect(parsePlotView(JSON.stringify({ zoom: 0, panX: 0, panY: 0 }))).toBeNull()
  })

  it('clamps a scale the canvas cannot draw instead of discarding the view', () => {
    // The plot canvas has a ceiling the flow canvases do not. A stored 400× is still a
    // recognisable place to be standing once you zoom out; a null is not.
    expect(parsePlotView(JSON.stringify({ zoom: 400, panX: 10, panY: 20 }))).toEqual({ zoom: 20, panX: 10, panY: 20 })
    expect(parsePlotView(JSON.stringify({ zoom: 0.001, panX: 10, panY: 20 }))).toEqual({ zoom: 0.05, panX: 10, panY: 20 })
  })

  it('keeps a negative pan, which is where the stage origin sits', () => {
    // The default itself is negative on both axes: 0,0 cm is inset from the corner.
    expect(parsePlotView(JSON.stringify(DEFAULT_PLOT_VIEW))).toEqual(DEFAULT_PLOT_VIEW)
  })
})
