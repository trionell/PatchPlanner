import { describe, expect, it } from 'vitest'
import type { StagePlotElement } from '../types'
import {
  clampDimension,
  MIN_DIMENSION_CM,
  projectedBounds,
  projectElement,
  pxPerCm,
  roundCm,
  snapPosition,
  viewAxisFields,
  type SnapSettings,
} from './stagePlot'

function element(overrides: Partial<StagePlotElement>): StagePlotElement {
  return {
    id: 1,
    plot_id: 1,
    layer_id: 1,
    kind: 'resource',
    icon: 'speaker',
    name: '',
    x_cm: 0,
    y_cm: 0,
    z_cm: 0,
    width_cm: 40,
    depth_cm: 30,
    height_cm: 60,
    rotation_deg: 0,
    links: [],
    ...overrides,
  }
}

describe('projectElement', () => {
  const el = element({ x_cm: 100, y_cm: 200, z_cm: 50, width_cm: 40, depth_cm: 30, height_cm: 60, rotation_deg: 15 })

  it('top view projects x/y and width/depth with rotation', () => {
    expect(projectElement(el, 'top')).toEqual({ u: 100, v: 200, width: 40, height: 30, rotationDeg: 15 })
  })

  it('front view projects x/z and width/height, axis-aligned', () => {
    // v is the vertical CENTER: bottom z=50 + height 60 / 2 = 80.
    expect(projectElement(el, 'front')).toEqual({ u: 100, v: 80, width: 40, height: 60, rotationDeg: 0 })
  })

  it('side view projects y/z and depth/height, axis-aligned', () => {
    expect(projectElement(el, 'side')).toEqual({ u: 200, v: 80, width: 30, height: 60, rotationDeg: 0 })
  })

  it('shares each stored dimension between the views that show it', () => {
    // Width agrees between top and front; depth between top and side;
    // height between front and side — FR-027's "dimensions shared
    // between two views always agree" is structural.
    const top = projectElement(el, 'top')
    const front = projectElement(el, 'front')
    const side = projectElement(el, 'side')
    expect(top.width).toBe(front.width)
    expect(top.height).toBe(side.width) // top's height is depth
    expect(front.height).toBe(side.height)
    expect(top.u).toBe(front.u) // x agrees
    expect(top.v).toBe(side.u) // y agrees
    expect(front.v).toBe(side.v) // z agrees
  })
})

describe('scale exactness (SC-002)', () => {
  it('a 200 cm element projects at exactly half a 400 cm element in every view', () => {
    const small = element({ width_cm: 200, depth_cm: 100, height_cm: 50 })
    const large = element({ width_cm: 400, depth_cm: 200, height_cm: 100 })
    for (const view of ['top', 'front', 'side'] as const) {
      const s = projectElement(small, view)
      const l = projectElement(large, view)
      expect(s.width / l.width).toBe(0.5)
      expect(s.height / l.height).toBe(0.5)
    }
  })

  it('zoom scales px linearly and never touches cm values', () => {
    expect(pxPerCm(1)).toBe(1)
    expect(pxPerCm(2.5)).toBe(2.5)
    const el = element({ width_cm: 46 })
    // Rendering at any zoom keeps the stored cm identical.
    expect(projectElement(el, 'top').width).toBe(46)
  })
})

describe('viewAxisFields', () => {
  it('maps drags to the correct stored fields per view', () => {
    expect(viewAxisFields('top')).toEqual({ u: 'x_cm', v: 'y_cm' })
    expect(viewAxisFields('front')).toEqual({ u: 'x_cm', v: 'z_cm' })
    expect(viewAxisFields('side')).toEqual({ u: 'y_cm', v: 'z_cm' })
  })
})

describe('projectedBounds', () => {
  it('is the plain rect at 0°', () => {
    const el = element({ x_cm: 100, y_cm: 50, width_cm: 40, depth_cm: 20 })
    expect(projectedBounds(el, 'top')).toEqual({ minU: 80, maxU: 120, minV: 40, maxV: 60 })
  })

  it('swaps extents at 90°', () => {
    const el = element({ x_cm: 0, y_cm: 0, width_cm: 40, depth_cm: 20, rotation_deg: 90 })
    const bounds = projectedBounds(el, 'top')
    expect(bounds.maxU).toBeCloseTo(10, 6)
    expect(bounds.maxV).toBeCloseTo(20, 6)
  })

  it('grows diagonally at 45°', () => {
    const el = element({ x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 100, rotation_deg: 45 })
    const bounds = projectedBounds(el, 'top')
    // A 100×100 square rotated 45° spans 100·√2.
    expect(bounds.maxU * 2).toBeCloseTo(100 * Math.SQRT2, 6)
  })

  it('ignores rotation in elevations', () => {
    const el = element({ x_cm: 0, z_cm: 0, width_cm: 40, height_cm: 60, rotation_deg: 45 })
    const bounds = projectedBounds(el, 'front')
    expect(bounds.maxU - bounds.minU).toBe(40)
    expect(bounds.maxV - bounds.minV).toBe(60)
  })
})

describe('snapPosition (SC-003: exact, deterministic)', () => {
  const both: SnapSettings = { snapGrid: true, snapObjects: true, gridSizeCm: 25 }
  const gridOnly: SnapSettings = { snapGrid: true, snapObjects: false, gridSizeCm: 25 }
  const objectsOnly: SnapSettings = { snapGrid: false, snapObjects: true, gridSizeCm: 25 }
  const none: SnapSettings = { snapGrid: false, snapObjects: false, gridSizeCm: 25 }
  const half = { halfW: 20, halfH: 15 }

  it('grid snap lands an edge or centre on an exact multiple', () => {
    // Center at 103: center→100 is delta -3; edges 83/123 are 8/2 cm
    // from multiples 75|100/125. Best is maxU 123→125 (2cm)? center 103→100 is 3.
    // Actually: min edge 83→75 is 8; center 103→100 is 3; max edge 123→125 is 2.
    const snapped = snapPosition({ u: 103, v: 0 }, half, [], gridOnly, 1)
    expect(snapped.u).toBe(105) // max edge at exactly 125
    expect(snapped.u + half.halfW).toBe(125)
    expect(snapped.v).toBe(0)
  })

  it('grid snap is exact — no epsilon', () => {
    const snapped = snapPosition({ u: 37.499999, v: 62.500001 }, { halfW: 12.5, halfH: 12.5 }, [], gridOnly, 1)
    // Edges land exactly on 25/50 grid lines.
    expect((snapped.u - 12.5) % 25).toBe(0)
    expect((snapped.v - 12.5) % 25).toBe(0)
  })

  it('object alignment lands exactly on the neighbour coordinate', () => {
    const neighbor = { minU: 200, maxU: 240, minV: 0, maxV: 30 }
    // Dragged right edge at 195 (center 175, halfW 20) is 5 cm from the
    // neighbour's left edge at 200 — inside the 8 px @ zoom 1 threshold.
    const snapped = snapPosition({ u: 175, v: 100 }, half, [neighbor], objectsOnly, 1)
    expect(snapped.u + half.halfW).toBe(200)
    expect(snapped.guides).toContainEqual({ axis: 'u', position: 200, source: 'object' })
  })

  it('object alignment beats the grid within its threshold', () => {
    // Neighbour edge at 203 (not a grid multiple); dragged edge at 199.
    const neighbor = { minU: 203, maxU: 243, minV: 0, maxV: 30 }
    const snapped = snapPosition({ u: 179, v: 0 }, half, [neighbor], both, 1)
    expect(snapped.u + half.halfW).toBe(203)
    expect(snapped.guides[0]?.source).toBe('object')
  })

  it('falls back to grid outside the object threshold', () => {
    const neighbor = { minU: 300, maxU: 340, minV: 500, maxV: 530 } // far on both axes
    const snapped = snapPosition({ u: 103, v: 0 }, half, [neighbor], both, 1)
    expect(snapped.u).toBe(105)
    expect(snapped.guides).toHaveLength(0) // grid snaps draw no guide
  })

  it('threshold respects zoom (px → cm conversion)', () => {
    const neighbor = { minU: 206, maxU: 246, minV: 0, maxV: 30 }
    // Gap is 6 cm from dragged right edge 200 → 206.
    // Zoomed in (4 px/cm) the threshold is 2 cm → no object snap.
    const zoomedIn = snapPosition({ u: 180, v: 0 }, half, [neighbor], objectsOnly, 4)
    expect(zoomedIn.u).toBe(180)
    // Zoomed out (0.5 px/cm) the threshold is 16 cm → snaps.
    const zoomedOut = snapPosition({ u: 180, v: 0 }, half, [neighbor], objectsOnly, 0.5)
    expect(zoomedOut.u + half.halfW).toBe(206)
  })

  it('axes snap independently', () => {
    const neighbor = { minU: 200, maxU: 240, minV: 50, maxV: 80 }
    const snapped = snapPosition({ u: 175, v: 300 }, half, [neighbor], objectsOnly, 1)
    expect(snapped.u + half.halfW).toBe(200) // u snapped
    expect(snapped.v).toBe(300) // v untouched (250 cm away)
  })

  it('disabled toggles bypass snapping entirely', () => {
    const neighbor = { minU: 200, maxU: 240, minV: 0, maxV: 30 }
    const snapped = snapPosition({ u: 175.3, v: 101.7 }, half, [neighbor], none, 1)
    expect(snapped).toEqual({ u: 175.3, v: 101.7, guides: [] })
  })
})

describe('clamping and rounding', () => {
  it('clamps to the minimum dimension', () => {
    expect(clampDimension(0)).toBe(MIN_DIMENSION_CM)
    expect(clampDimension(-5)).toBe(MIN_DIMENSION_CM)
    expect(clampDimension(46)).toBe(46)
  })

  it('rounds to 0.1 mm without moving exact values', () => {
    expect(roundCm(25)).toBe(25)
    expect(roundCm(24.999999999)).toBe(25)
    expect(roundCm(33.333333)).toBe(33.33)
  })
})
