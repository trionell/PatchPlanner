import { describe, expect, it } from 'vitest'
import { originShift, panToScroll, planeExtent, planeOrigin, PLANE_MARGIN, scrollToPan } from './canvasPlane'

describe('planeOrigin', () => {
  it('is 0,0 for a graph that lives entirely in positive space', () => {
    // The common case, and the one that would have broken every existing graph if the
    // origin simply tracked the content: these nodes must keep the empty space they
    // were arranged inside, not be cropped flush to the leftmost one.
    expect(planeOrigin([{ x: 300, y: 100 }, { x: 1400, y: 60 }])).toEqual({ x: 0, y: 0 })
  })

  it('is 0,0 for an empty graph', () => {
    // No nodes, no bounding box. There is nothing to be left of.
    expect(planeOrigin([])).toEqual({ x: 0, y: 0 })
  })

  it('extends by a margin past the outermost node, per axis', () => {
    // Only x is negative here — y must not be dragged negative with it, or a graph
    // nudged left would gain empty space above it for no reason.
    expect(planeOrigin([{ x: -100, y: 200 }])).toEqual({ x: -100 - PLANE_MARGIN, y: 0 })
    expect(planeOrigin([{ x: 200, y: -30 }])).toEqual({ x: 0, y: -30 - PLANE_MARGIN })
    expect(planeOrigin([{ x: -100, y: -30 }])).toEqual({ x: -124, y: -54 })
  })

  it('takes the least node on each axis, not the least node', () => {
    // The leftmost and the topmost may be different nodes; a single "min point" would
    // clip whichever one lost.
    expect(planeOrigin([{ x: -500, y: 400 }, { x: 900, y: -200 }], 0)).toEqual({ x: -500, y: -200 })
  })

  it('ignores a node whose position is not a number', () => {
    // One unplaceable node must not poison the origin for every other — which is
    // exactly what Math.min would do with NaN.
    expect(planeOrigin([{ x: Number.NaN, y: 10 }, { x: -60, y: 10 }], 0)).toEqual({ x: -60, y: 0 })
  })
})

describe('originShift', () => {
  it('scrolls right when the plane grows to the left', () => {
    // The origin moved 100 further left, so every node's DOM offset moved 100 right;
    // the viewport must follow or the graph lurches under the finger holding it.
    expect(originShift({ x: 0, y: 0 }, { x: -100, y: 0 }, 1)).toEqual({ x: 100, y: 0 })
  })

  it('is in screen pixels, so it scales with zoom', () => {
    // The delta is logical, the scroll offset is not. At 42% a 100-unit shift is 42px.
    expect(originShift({ x: 0, y: 0 }, { x: -100, y: -50 }, 0.42)).toEqual({ x: 42, y: 21 })
  })

  it('is zero when the origin has not moved', () => {
    // The effect runs on every render; an unchanged origin must not nudge the scroll.
    expect(originShift({ x: -24, y: -24 }, { x: -24, y: -24 }, 0.5)).toEqual({ x: 0, y: 0 })
  })

  it('reverses when the plane shrinks back', () => {
    // Deleting the leftmost node pulls the origin right, and the view must come back
    // with it rather than staying scrolled into space that no longer exists.
    expect(originShift({ x: -100, y: 0 }, { x: 0, y: 0 }, 1)).toEqual({ x: -100, y: 0 })
  })

  it('refuses to produce NaN from a zoom that has not been measured yet', () => {
    // fitScale keeps zero out of the zoom (Slice 36); this keeps the same promise on
    // the way in, because a NaN here is a NaN scrollLeft and a canvas that never scrolls.
    expect(originShift({ x: 0, y: 0 }, { x: -100, y: 0 }, 0)).toEqual({ x: 0, y: 0 })
    expect(originShift({ x: 0, y: 0 }, { x: -100, y: 0 }, Number.NaN)).toEqual({ x: 0, y: 0 })
  })
})

describe('panToScroll / scrollToPan', () => {
  it('round-trips a remembered view', () => {
    const origin = { x: -124, y: -24 }
    const pan = { x: 340, y: 90 }
    const scroll = panToScroll(pan, origin, 0.5)
    expect(scrollToPan(scroll, origin, 0.5)).toEqual(pan)
  })

  it('survives the origin moving between visits', () => {
    // The point of storing a logical pan rather than a scroll offset: somebody moves a
    // node further left, the origin changes, and the window still opens looking at the
    // same part of the *graph* rather than the same distance from a moved edge.
    const pan = { x: 500, y: 200 }
    const shifted = panToScroll(pan, { x: -300, y: 0 }, 1)
    expect(shifted).toEqual({ x: 800, y: 200 })
    expect(scrollToPan(shifted, { x: -300, y: 0 }, 1)).toEqual(pan)
  })

  it('survives being reopened at a different zoom', () => {
    const pan = { x: 400, y: 100 }
    expect(panToScroll(pan, { x: 0, y: 0 }, 1)).toEqual({ x: 400, y: 100 })
    expect(panToScroll(pan, { x: 0, y: 0 }, 0.25)).toEqual({ x: 100, y: 25 })
  })

  it('clamps to zero rather than handing a scroll container a negative', () => {
    // A pan left of the plane's own origin can only happen if the content shrank under a
    // stored view. The container would clamp anyway; agreeing with it means the value read
    // back is the value written.
    expect(panToScroll({ x: -900, y: -900 }, { x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 })
  })

  it('degrades to the origin rather than to NaN on an unmeasured zoom', () => {
    expect(panToScroll({ x: 400, y: 100 }, { x: -24, y: -24 }, 0)).toEqual({ x: 0, y: 0 })
    expect(scrollToPan({ x: 400, y: 100 }, { x: -24, y: -24 }, 0)).toEqual({ x: -24, y: -24 })
  })
})

describe('planeExtent', () => {
  it('adds the margin the origin puts on the other two sides', () => {
    expect(planeExtent({ width: 1500, height: 640 })).toEqual({ width: 1500 + PLANE_MARGIN, height: 640 + PLANE_MARGIN })
  })

  it('gives an empty graph somewhere to put its first node', () => {
    expect(planeExtent({ width: 0, height: 0 })).toEqual({ width: PLANE_MARGIN, height: PLANE_MARGIN })
  })
})
