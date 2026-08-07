import { describe, expect, it } from 'vitest'
import type { StagePlotElement, StagePlotMeasurement } from '../types'
import {
  allowsPlaneAnchor,
  anchorPoint,
  faceLine,
  formatAnchorFeature,
  measurementAnchorElementIds,
  measurementDrawing,
  measurementSpan,
  measurementsAnchoredTo,
  offeredAnchors,
  parseAnchorFeature,
  clampDimension,
  clampFixtureOffset,
  fixtureDropOnTruss,
  fixtureLabel,
  MIN_DIMENSION_CM,
  parseLengthFromName,
  projectedAxes,
  projectedBounds,
  projectedOutline,
  projectElement,
  pxPerCm,
  lengthWithoutPiece,
  rectLocalPoint,
  roundCm,
  snapPosition,
  trussLaneLocalV,
  trussLength,
  trussSideForLocalV,
  trussSubtitle,
  viewAxisFields,
  type AnchorFeature,
  type MeasurementEnd,
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
    tilt_deg: 0,
    links: [],
    ...overrides,
  }
}

describe('projectElement', () => {
  const el = element({ x_cm: 100, y_cm: 200, z_cm: 50, width_cm: 40, depth_cm: 30, height_cm: 60 })
  const rotated = { ...el, rotation_deg: 15 }

  it('top view projects x/y and width/depth with rotation', () => {
    expect(projectElement(rotated, 'top')).toEqual({ u: 100, v: 200, width: 40, height: 30, rotationDeg: 15 })
  })

  it('front view projects x/z and width/height with the tilt as its rotation', () => {
    // v is the vertical CENTER: bottom z=50 + height 60 / 2 = 80.
    expect(projectElement(el, 'front')).toEqual({ u: 100, v: 80, width: 40, height: 60, rotationDeg: 0 })
    expect(projectElement({ ...el, tilt_deg: 20 }, 'front').rotationDeg).toBe(20)
  })

  it('side view projects y/z and depth/height, always axis-aligned', () => {
    expect(projectElement(el, 'side')).toEqual({ u: 200, v: 80, width: 30, height: 60, rotationDeg: 0 })
  })

  it('shares each stored dimension between the views that show it (unrotated)', () => {
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

describe('3D projection under rotation and tilt', () => {
  const bar = element({ x_cm: 0, y_cm: 0, z_cm: 300, width_cm: 600, depth_cm: 30, height_cm: 30 })

  it('a truss yawed 90° shows its cross-section in front and full length in side', () => {
    const yawed = { ...bar, rotation_deg: 90 }
    expect(projectElement(yawed, 'front')).toMatchObject({ width: 30, height: 30 })
    expect(projectElement(yawed, 'side')).toMatchObject({ width: 600, height: 30 })
  })

  it('a partial yaw foreshortens the front view continuously', () => {
    const yawed = { ...bar, rotation_deg: 60 }
    // 600·cos60 + 30·sin60
    expect(projectElement(yawed, 'front').width).toBeCloseTo(325.98, 1)
  })

  it('a truss tilted 90° stands vertical: full length upward in both elevations', () => {
    const tilted = { ...bar, tilt_deg: 90 }
    // Front view draws the full bar rotated to vertical…
    expect(projectElement(tilted, 'front')).toMatchObject({ width: 600, height: 30, rotationDeg: 90 })
    // …the side view sees the same vertical bar axis-aligned…
    expect(projectElement(tilted, 'side')).toMatchObject({ width: 30, height: 600 })
    // …and the plan view shows just the cross-section it stands on.
    expect(projectElement(tilted, 'top')).toMatchObject({ width: 30, height: 30 })
  })

  it('projectedAxes collapse and spread fixture markers with the view', () => {
    // Unrotated bar seen from the side: no length axis on screen,
    // lanes spread across the bar's depth.
    const straight = projectedAxes(bar, 'side')
    expect(straight.ax.u).toBeCloseTo(0)
    expect(straight.ax.v).toBeCloseTo(0)
    expect(straight.ay.u).toBeCloseTo(1)
    expect(straight.ay.v).toBeCloseTo(0)
    // Yawed 90° the side view shows the full length and the lanes
    // collapse; the front view is the mirror case.
    const yawed = { ...bar, rotation_deg: 90 }
    expect(projectedAxes(yawed, 'side').ax.u).toBeCloseTo(1)
    expect(projectedAxes(yawed, 'side').ay.u).toBeCloseTo(0)
    expect(projectedAxes(yawed, 'front').ax.u).toBeCloseTo(0)
    expect(Math.abs(projectedAxes(yawed, 'front').ay.u)).toBeCloseTo(1)
  })

  it('a raked bar climbs in the side view: fixture height follows the offset', () => {
    // Tilt 45°: 1 cm along the bar rises/falls sin 45° on the side
    // view's vertical — the marker at the high end draws high.
    const raked = { ...bar, tilt_deg: 45 }
    expect(projectedAxes(raked, 'side').ax.v).toBeCloseTo(Math.SQRT1_2)
    // The horizontal spread of the lanes is unaffected.
    expect(projectedAxes(raked, 'side').ay.u).toBeCloseTo(1)
  })

  it('projectedOutline is the true silhouette: a rectangle flat, a hexagon under combined rotations', () => {
    // Straight bar in the top view: the plain 600×30 rectangle.
    expect(projectedOutline(bar, 'top')).toEqual([
      { u: -300, v: -15 },
      { u: 300, v: -15 },
      { u: 300, v: 15 },
      { u: -300, v: 15 },
    ])
    // Yaw and tilt combined: the box's silhouette needs six corners.
    const skewed = { ...bar, rotation_deg: 45, tilt_deg: 45 }
    expect(projectedOutline(skewed, 'front')).toHaveLength(6)
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

describe('cross-view consistency (SC-006)', () => {
  it('an edit made through one view is immediately visible in the others', () => {
    const el = element({ x_cm: 100, y_cm: 200, z_cm: 0, height_cm: 60 })
    // Raise the element by 120 cm via the front view's vertical axis.
    const axes = viewAxisFields('front')
    const raised = { ...el, [axes.v]: 120 } as typeof el
    // The side view reflects the same height without any sync step…
    expect(projectElement(raised, 'side').v).toBe(120 + 60 / 2)
    // …and the top view is unaffected (z is not one of its axes).
    expect(projectElement(raised, 'top')).toEqual(projectElement(el, 'top'))

    // Move across the stage via the top view; the front view follows.
    const movedAxes = viewAxisFields('top')
    const moved = { ...el, [movedAxes.u]: 350 } as typeof el
    expect(projectElement(moved, 'front').u).toBe(350)
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

  it('carries plan rotation into the elevations as foreshortening', () => {
    const el = element({ x_cm: 0, z_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 60, rotation_deg: 45 })
    const bounds = projectedBounds(el, 'front')
    // Yawed 45°: the front silhouette mixes width and depth…
    expect(bounds.maxU - bounds.minU).toBeCloseTo((40 + 30) * Math.SQRT1_2, 1)
    // …while the height is untouched.
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

describe('parseLengthFromName (catalog convention, research.md R3)', () => {
  it('parses whole metres', () => {
    expect(parseLengthFromName('Tross F34 2m')).toBe(200)
    expect(parseLengthFromName('Tross F34 3 m')).toBe(300)
  })
  it('parses Swedish decimal comma', () => {
    expect(parseLengthFromName('Tross F34 0,5m')).toBe(50)
    expect(parseLengthFromName('Tross 1.5m')).toBe(150)
  })
  it('parses centimetres', () => {
    expect(parseLengthFromName('Trossbit 50cm')).toBe(50)
  })
  it('takes the last length token, not a model number', () => {
    expect(parseLengthFromName('F34 truss 2m')).toBe(200)
  })
  it('returns null when nothing matches', () => {
    expect(parseLengthFromName('Tross hörn 90°')).toBeNull()
    expect(parseLengthFromName('')).toBeNull()
  })
})

describe('trussLength', () => {
  it('is the exact sum of piece lengths (FR-023)', () => {
    expect(trussLength([{ length_cm: 200 }, { length_cm: 200 }, { length_cm: 200 }])).toBe(600)
    expect(trussLength([])).toBe(0)
    expect(trussLength([{ length_cm: 250 }, { length_cm: 50 }])).toBe(300)
  })
})

describe('lengthWithoutPiece (Slice 39 FR-018)', () => {
  const pieces = [
    { id: 1, length_cm: 300 },
    { id: 2, length_cm: 300 },
    { id: 3, length_cm: 200 },
  ]

  it('is what the truss will measure once the piece is gone', () => {
    expect(lengthWithoutPiece(pieces, 3)).toBe(600)
    expect(lengthWithoutPiece(pieces, 1)).toBe(500)
  })

  it('leaves the length alone for a piece that is not in the truss', () => {
    expect(lengthWithoutPiece(pieces, 99)).toBe(800)
  })

  it('is 0 for the last piece, and for a truss with none', () => {
    expect(lengthWithoutPiece([{ id: 1, length_cm: 200 }], 1)).toBe(0)
    expect(lengthWithoutPiece([], 1)).toBe(0)
  })
})

describe('trussSubtitle (Slice 39 FR-005)', () => {
  it('counts, and reads as a sentence at one and at none', () => {
    expect(trussSubtitle(3)).toBe('3 trusses, shared by every plot in this event')
    expect(trussSubtitle(1)).toBe('1 truss, shared by every plot in this event')
    expect(trussSubtitle(0)).toBe('Trusses are shared by every plot in this event')
  })
})

describe('fixtureLabel (FR-029)', () => {
  const fixture = { fixture_name: 'Spot 1', fixture_number: 11, dmx_universe: 1, dmx_start_address: 1 }
  it('composes all three parts', () => {
    expect(fixtureLabel(fixture, { show_fixture_name: true, show_fixture_fid: true, show_fixture_dmx: true })).toBe('Spot 1 · FID 11 · 1.001')
  })
  it('respects each toggle', () => {
    expect(fixtureLabel(fixture, { show_fixture_name: true, show_fixture_fid: false, show_fixture_dmx: false })).toBe('Spot 1')
    expect(fixtureLabel(fixture, { show_fixture_name: false, show_fixture_fid: true, show_fixture_dmx: true })).toBe('FID 11 · 1.001')
    expect(fixtureLabel(fixture, { show_fixture_name: false, show_fixture_fid: false, show_fixture_dmx: false })).toBe('')
  })
  it('omits parts with missing values', () => {
    expect(
      fixtureLabel({ fixture_name: 'Spot 2', dmx_universe: 1 }, { show_fixture_name: true, show_fixture_fid: true, show_fixture_dmx: true }),
    ).toBe('Spot 2') // no FID, no DMX address yet
  })
  it('zero-pads the DMX address', () => {
    expect(fixtureLabel({ ...fixture, dmx_start_address: 79 }, { show_fixture_name: false, show_fixture_fid: false, show_fixture_dmx: true })).toBe('1.079')
  })
})

describe('clampFixtureOffset', () => {
  it('passes in-range offsets through', () => {
    expect(clampFixtureOffset(100, 600)).toEqual({ offset: 100, clamped: false })
  })
  it('clamps and flags out-of-range offsets (shortened truss edge case)', () => {
    expect(clampFixtureOffset(700, 600)).toEqual({ offset: 600, clamped: true })
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

describe('rectLocalPoint (truss-frame coordinates)', () => {
  const rect = { u: 100, v: 200, width: 600, height: 30, rotationDeg: 0 }
  it('translates into the unrotated frame', () => {
    expect(rectLocalPoint({ u: 130, v: 190 }, rect, 'top')).toEqual({ u: 30, v: -10 })
  })
  it('inverts the rotation in the top view', () => {
    const rotated = { ...rect, rotationDeg: 90 }
    // A point directly downstage (+v) of the centre lies along +u of a
    // bar rotated 90°.
    const local = rectLocalPoint({ u: 100, v: 250 }, rotated, 'top')
    expect(local.u).toBeCloseTo(50)
    expect(local.v).toBeCloseTo(0)
  })
  it('flips v in the elevations (v up-positive, SVG y down)', () => {
    // Element centre at v=200 renders at SVG y=-200; a pointer 10 below
    // that is local v=+10.
    expect(rectLocalPoint({ u: 100, v: -190 }, rect, 'front')).toEqual({ u: 0, v: 10 })
  })
  it('inverts the tilt in the front view', () => {
    const tilted = { ...rect, rotationDeg: 90 }
    // A raked bar rotated 90°: a pointer below the centre (SVG +y)
    // lies along +u of the bar.
    const local = rectLocalPoint({ u: 100, v: -150 }, tilted, 'front')
    expect(local.u).toBeCloseTo(50)
    expect(local.v).toBeCloseTo(0)
  })
})

describe('truss lanes (top/middle/bottom)', () => {
  it('splits the bar depth into three bands', () => {
    expect(trussSideForLocalV(-10, 15)).toBe('top')
    expect(trussSideForLocalV(0, 15)).toBe('middle')
    expect(trussSideForLocalV(4, 15)).toBe('middle')
    expect(trussSideForLocalV(10, 15)).toBe('bottom')
  })
  it('draws lanes on the chords and centre line', () => {
    expect(trussLaneLocalV('top', 15)).toBe(-15)
    expect(trussLaneLocalV('middle', 15)).toBe(0)
    expect(trussLaneLocalV('bottom', 15)).toBe(15)
  })
})

describe('fixtureDropOnTruss', () => {
  it('attaches inside the bar with the offset from the left end', () => {
    expect(fixtureDropOnTruss({ u: -200, v: -12 }, 600, 15)).toEqual({ offset: 100, side: 'top' })
    expect(fixtureDropOnTruss({ u: 0, v: 0 }, 600, 15)).toEqual({ offset: 300, side: 'middle' })
  })
  it('still attaches within the drop margin, clamped to the truss extent', () => {
    expect(fixtureDropOnTruss({ u: 310, v: 20 }, 600, 15)).toEqual({ offset: 600, side: 'bottom' })
  })
  it('rejects drops beyond the margin', () => {
    expect(fixtureDropOnTruss({ u: 340, v: 0 }, 600, 15)).toBeNull()
    expect(fixtureDropOnTruss({ u: 0, v: 45 }, 600, 15)).toBeNull()
  })
})

// ---- Measurements (Slice 42) ----
//
// These cases are the shared contract with the Go port in
// backend/internal/service/stage_plot_geometry.go: the same inputs and the
// same expected numbers are asserted there, so the canvas and the document
// cannot state different distances.

describe('anchor features', () => {
  it('round-trips through its text encoding', () => {
    const cases: AnchorFeature[] = [
      { kind: 'centre' },
      { kind: 'corner', signs: [1, -1, 1] },
      { kind: 'corner', signs: [-1, -1, -1] },
      { kind: 'face', axis: 0, sign: 1 },
      { kind: 'face', axis: 2, sign: -1 },
    ]
    for (const feature of cases) {
      expect(parseAnchorFeature(formatAnchorFeature(feature))).toEqual(feature)
    }
    expect(formatAnchorFeature({ kind: 'corner', signs: [1, -1, 1] })).toBe('corner:+-+')
    expect(formatAnchorFeature({ kind: 'face', axis: 0, sign: 1 })).toBe('face:+x')
  })

  it('rejects anything it did not write', () => {
    expect(parseAnchorFeature('corner:++')).toBeNull()
    expect(parseAnchorFeature('face:+w')).toBeNull()
    expect(parseAnchorFeature('')).toBeNull()
  })
})

describe('anchorPoint', () => {
  const el = element({ x_cm: 100, y_cm: 200, z_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 60 })

  it('resolves the centre to the element centre', () => {
    expect(anchorPoint(el, 'top', { kind: 'centre' })).toEqual({ u: 100, v: 200 })
  })

  it('resolves a corner in the top view', () => {
    // +x is stage-right, +y is downstage: the corner at (+w/2, +d/2).
    expect(anchorPoint(el, 'top', { kind: 'corner', signs: [1, 1, 1] })).toEqual({ u: 120, v: 215 })
    expect(anchorPoint(el, 'top', { kind: 'corner', signs: [-1, -1, -1] })).toEqual({ u: 80, v: 185 })
  })

  it('resolves a face to the midpoint of that side', () => {
    expect(anchorPoint(el, 'top', { kind: 'face', axis: 0, sign: 1 })).toEqual({ u: 120, v: 200 })
    expect(anchorPoint(el, 'top', { kind: 'face', axis: 1, sign: -1 })).toEqual({ u: 100, v: 185 })
  })

  it('resolves a corner in an elevation, where v grows upward', () => {
    // Front view: centre v is z + height/2 = 30; the top face is at 60.
    expect(anchorPoint(el, 'front', { kind: 'face', axis: 2, sign: 1 })).toEqual({ u: 100, v: 60 })
    expect(anchorPoint(el, 'front', { kind: 'face', axis: 2, sign: -1 })).toEqual({ u: 100, v: 0 })
  })

  it('follows a rotation', () => {
    const turned = { ...el, rotation_deg: 90 }
    // Yawed 90°, the +x face points downstage.
    expect(anchorPoint(turned, 'top', { kind: 'face', axis: 0, sign: 1 })).toEqual({ u: 100, v: 220 })
  })
})

describe('faceLine', () => {
  const el = element({ x_cm: 0, y_cm: 0, z_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 60 })

  it('declines a face seen flat', () => {
    // In the top view the top and bottom faces project onto the whole
    // silhouette; they are not sides and are not offered.
    expect(faceLine(el, 'top', { kind: 'face', axis: 2, sign: 1 })).toBeNull()
    expect(faceLine(el, 'top', { kind: 'face', axis: 2, sign: -1 })).toBeNull()
  })

  it('gives an edge-on face its line and its drawn extent', () => {
    const line = faceLine(el, 'top', { kind: 'face', axis: 0, sign: 1 })
    expect(line).not.toBeNull()
    expect(line!.point).toEqual({ u: 20, v: 0 })
    expect(line!.normal).toEqual({ u: 1, v: 0 })
    // The side runs along the depth axis, 30 cm of it.
    expect(Math.abs(line!.dir.u)).toBeCloseTo(0, 6)
    expect(Math.abs(line!.dir.v)).toBeCloseTo(1, 6)
    const [p, q] = line!.segment
    expect(Math.hypot(q.u - p.u, q.v - p.v)).toBeCloseTo(30, 6)
  })

  it('turns with the element', () => {
    const turned = { ...el, rotation_deg: 90 }
    const line = faceLine(turned, 'top', { kind: 'face', axis: 0, sign: 1 })
    expect(line!.normal.u).toBeCloseTo(0, 6)
    expect(line!.normal.v).toBeCloseTo(1, 6)
  })
})

describe('offeredAnchors', () => {
  it('offers a plain rectangle four corners and four sides', () => {
    const el = element({ shape_kind: 'rect', kind: 'shape', width_cm: 40, depth_cm: 30, height_cm: 20 })
    const offered = offeredAnchors(el, 'top')
    expect(offered.filter((o) => o.feature.kind === 'centre')).toHaveLength(1)
    // Eight box corners project onto four drawn corners; the duplicates are
    // one corner, not two.
    expect(offered.filter((o) => o.feature.kind === 'corner')).toHaveLength(4)
    expect(offered.filter((o) => o.feature.kind === 'face')).toHaveLength(4)
  })

  it('offers a raked element the corners its silhouette actually has', () => {
    // Yaw and tilt together make the silhouette a hexagon — the shape a
    // rotated rectangle cannot represent. It is the ELEVATIONS that show it:
    // in the top view the length and height axes both project onto the yaw
    // direction, so a plan silhouette is always a parallelogram however the
    // element is raked.
    const raked = element({ shape_kind: 'rect', kind: 'shape', width_cm: 200, depth_cm: 40, height_cm: 30, rotation_deg: 30, tilt_deg: 25 })
    expect(projectedOutline(raked, 'top')).toHaveLength(4)
    expect(offeredAnchors(raked, 'top').filter((o) => o.feature.kind === 'corner')).toHaveLength(4)

    expect(projectedOutline(raked, 'front')).toHaveLength(6)
    expect(offeredAnchors(raked, 'front').filter((o) => o.feature.kind === 'corner')).toHaveLength(6)
  })

  it('offers an ellipse its quadrant points but no plane', () => {
    const el = element({ kind: 'shape', shape_kind: 'ellipse', width_cm: 40, depth_cm: 30, height_cm: 20 })
    const faces = offeredAnchors(el, 'top').filter((o) => o.feature.kind === 'face')
    expect(faces).toHaveLength(4)
    expect(faces.every((f) => f.allowSlide)).toBe(false)
    expect(allowsPlaneAnchor(el)).toBe(false)
  })

  it('lets every other shape slide along a face', () => {
    const el = element({ kind: 'shape', shape_kind: 'rect', width_cm: 40, depth_cm: 30, height_cm: 20 })
    expect(offeredAnchors(el, 'top').filter((o) => o.feature.kind === 'face').every((f) => f.allowSlide)).toBe(true)
  })
})

describe('measurementSpan', () => {
  const at = (u: number, v: number): MeasurementEnd => ({ kind: 'point', point: { u, v } })

  it('states the true distance when aligned', () => {
    const span = measurementSpan(at(0, 0), at(300, 400), 'aligned')
    expect(span!.value).toBe(500)
  })

  it('states one axis alone when locked', () => {
    expect(measurementSpan(at(0, 0), at(300, 400), 'horizontal')!.value).toBe(300)
    expect(measurementSpan(at(0, 0), at(300, 400), 'vertical')!.value).toBe(400)
  })

  it('has no distance between two coincident points', () => {
    expect(measurementSpan(at(50, 50), at(50, 50), 'aligned')).toBeNull()
  })

  it('measures perpendicular to a face', () => {
    const el = element({ x_cm: 0, y_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 20 })
    const line = faceLine(el, 'top', { kind: 'face', axis: 0, sign: 1 })!
    // The face's line is u = 20; a point 100 to its right is 80 away.
    const span = measurementSpan(at(100, 250), { kind: 'line', line }, 'aligned')
    expect(span!.value).toBe(80)
    // The foot lands where the perpendicular falls, well outside the drawn
    // side — which is what the run-out exists to reach.
    expect(span!.b).toEqual({ u: 20, v: 250 })
  })

  it('measures an axis distance to a face when locked', () => {
    const el = element({ x_cm: 0, y_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 20, rotation_deg: 30 })
    const line = faceLine(el, 'top', { kind: 'face', axis: 0, sign: 1 })!
    const horizontal = measurementSpan(at(200, 0), { kind: 'line', line }, 'horizontal')
    // The foot is where the horizontal ray meets the slanted line, not where
    // the perpendicular would fall.
    expect(horizontal!.b.v).toBe(0)
    expect(horizontal!.value).toBeCloseTo(200 - horizontal!.b.u, 6)
  })

  it('measures between two parallel faces', () => {
    const left = element({ x_cm: 0, y_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 20 })
    const right = element({ id: 2, x_cm: 500, y_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 20 })
    const a = faceLine(left, 'top', { kind: 'face', axis: 0, sign: 1 })!
    const b = faceLine(right, 'top', { kind: 'face', axis: 0, sign: -1 })!
    // Inner faces at u = 20 and u = 480.
    expect(measurementSpan({ kind: 'line', line: a }, { kind: 'line', line: b }, 'aligned')!.value).toBe(460)
  })

  it('declines two faces that are not parallel', () => {
    const el = element({ x_cm: 0, y_cm: 0, width_cm: 40, depth_cm: 30, height_cm: 20 })
    const a = faceLine(el, 'top', { kind: 'face', axis: 0, sign: 1 })!
    const b = faceLine(el, 'top', { kind: 'face', axis: 1, sign: 1 })!
    expect(measurementSpan({ kind: 'line', line: a }, { kind: 'line', line: b }, 'aligned')).toBeNull()
  })
})

describe('measurementDrawing', () => {
  const span = measurementSpan({ kind: 'point', point: { u: 0, v: 0 } }, { kind: 'point', point: { u: 400, v: 0 } }, 'aligned')!

  it('runs between the ends at no offset', () => {
    const drawn = measurementDrawing(span, 0)
    expect(drawn.lineA).toEqual({ u: 0, v: 0 })
    expect(drawn.lineB).toEqual({ u: 400, v: 0 })
  })

  it('holds the line clear without changing the value', () => {
    const drawn = measurementDrawing(span, 120)
    expect(drawn.lineA).toEqual({ u: 0, v: 120 })
    expect(drawn.lineB).toEqual({ u: 400, v: 120 })
    expect(drawn.value).toBe(400)
  })

  it('flips to the other side', () => {
    expect(measurementDrawing(span, -120).lineA).toEqual({ u: 0, v: -120 })
    expect(measurementDrawing(span, -120).value).toBe(400)
  })

  it('puts a locked line on the end picked second and grows the first', () => {
    const stepped = measurementSpan({ kind: 'point', point: { u: 0, v: 0 } }, { kind: 'point', point: { u: 400, v: 90 } }, 'horizontal')!
    const drawn = measurementDrawing(stepped, 0)
    expect(drawn.value).toBe(400)
    // Both ends of the dimension line sit at the second end's v; the first
    // end's extension line is what covers the 90 cm difference.
    expect(drawn.lineA).toEqual({ u: 0, v: 90 })
    expect(drawn.lineB).toEqual({ u: 400, v: 90 })
  })
})

describe('measurementsAnchoredTo', () => {
  const measurement = (id: number, from: object, to: object) =>
    ({ id, plot_id: 1, layer_id: 1, view: 'top', type: 'aligned', from, to, offset_cm: 0, sort_order: 0 }) as StagePlotMeasurement

  const measurements = [
    measurement(1, { element_id: 7, feature: 'centre' }, { element_id: 8, feature: 'centre' }),
    measurement(2, { u_cm: 0, v_cm: 0 }, { element_id: 7, feature: 'face:+x' }),
    measurement(3, { element_id: 7, feature: 'face:+x' }, { element_id: 7, feature: 'face:-x' }),
    measurement(4, { u_cm: 0, v_cm: 0 }, { u_cm: 100, v_cm: 100 }),
  ]

  it('counts a measurement anchored at both ends once', () => {
    // Three measurements touch element 7, and the one touching it twice is
    // still one measurement.
    expect(measurementsAnchoredTo(measurements, 7)).toBe(3)
  })

  it('counts only what the element carries', () => {
    expect(measurementsAnchoredTo(measurements, 8)).toBe(1)
    expect(measurementsAnchoredTo(measurements, 99)).toBe(0)
  })

  it('lists each anchored element once', () => {
    expect(measurementAnchorElementIds(measurements[0])).toEqual([7, 8])
    expect(measurementAnchorElementIds(measurements[2])).toEqual([7])
    expect(measurementAnchorElementIds(measurements[3])).toEqual([])
  })
})
