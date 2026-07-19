import type { StagePlotElement, StagePlotView, TrussSide } from '../types'

// Pure geometry for the stage plot editor. Everything works in
// centimetres; the canvas renders 1 SVG user unit = 1 cm, so these
// numbers are drawn without further scaling (research.md R1).
//
// Conventions:
// - (x_cm, y_cm) is the element's CENTER in the plan (top-down) plane:
//   x grows stage-left → stage-right, y grows upstage → downstage.
// - z_cm is the element's BOTTOM height above the floor (0 = standing
//   on the floor); height_cm is its vertical extent.
// - Projected coordinates are (u, v): u grows rightward, v grows UP in
//   front/side views and DOWNSTAGE in the top view. The renderer maps
//   v onto SVG's downward y axis per view.

/** Minimum element dimension — rejects degenerate sizes (spec edge case). */
export const MIN_DIMENSION_CM = 1

export interface ProjectedRect {
  /** Center of the element in the view plane, cm. */
  u: number
  v: number
  /** Extent along u/v, cm. */
  width: number
  height: number
  /** Rotation to draw with: plan rotation in the top view, tilt (rake)
   *  in the front view; the side view stays axis-aligned. */
  rotationDeg: number
}

interface Vec3 {
  x: number
  y: number
  z: number
}

interface PlaneVec {
  u: number
  v: number
}

/**
 * World directions of an element's local axes under its plan rotation
 * (yaw about the vertical) and tilt (rake about its own depth axis):
 * world = Rz(rotation) · Ry(tilt) · local. World frame: x stage-left →
 * stage-right, y upstage → downstage, z up.
 */
function localAxes(rotationDeg: number, tiltDeg: number): { ax: Vec3; ay: Vec3; az: Vec3 } {
  const yaw = (rotationDeg * Math.PI) / 180
  const tilt = (tiltDeg * Math.PI) / 180
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  return {
    ax: { x: cy * ct, y: sy * ct, z: -st },
    ay: { x: -sy, y: cy, z: 0 },
    az: { x: cy * st, y: sy * st, z: ct },
  }
}

/** A world direction on a view's screen plane (u right, v down — the
 *  SVG frame each view is drawn in). */
function screenDirection(a: Vec3, view: StagePlotView): PlaneVec {
  switch (view) {
    case 'top':
      return { u: a.x, v: a.y }
    case 'front':
      return { u: a.x, v: -a.z }
    case 'side':
      return { u: a.y, v: -a.z }
  }
}

function dot(a: PlaneVec, b: PlaneVec): number {
  return a.u * b.u + a.v * b.v
}

/** The rotation a view draws with: plan rotation in the top view, tilt
 *  in the front view; the side view stays axis-aligned. */
function drawnRotation(element: StagePlotElement, view: StagePlotView): number {
  return view === 'top' ? element.rotation_deg : view === 'front' ? element.tilt_deg : 0
}

/**
 * Orthographic projection of one element into a view (research.md R7).
 * The stored fields are a full 3D model — center (x, y, z + h/2), box
 * dimensions, plan rotation and tilt — and every view projects that
 * same oriented box, so the views can never disagree. The drawn rect's
 * extents are the box's true silhouette extents along and across the
 * view's drawn rotation: a truss yawed 90° in the plan shows only its
 * cross-section in the front view and its full length in the side view.
 */
export function projectElement(element: StagePlotElement, view: StagePlotView): ProjectedRect {
  const rotationDeg = drawnRotation(element, view)
  const axes = localAxes(element.rotation_deg, element.tilt_deg)
  const radians = (rotationDeg * Math.PI) / 180
  const along = { u: Math.cos(radians), v: Math.sin(radians) }
  const across = { u: -Math.sin(radians), v: Math.cos(radians) }
  const pX = screenDirection(axes.ax, view)
  const pY = screenDirection(axes.ay, view)
  const pZ = screenDirection(axes.az, view)
  // roundCm kills the cos²+sin² float noise so unrotated elements keep
  // their exact stored dimensions.
  const width = roundCm(element.width_cm * Math.abs(dot(pX, along)) + element.depth_cm * Math.abs(dot(pY, along)) + element.height_cm * Math.abs(dot(pZ, along)))
  const height = roundCm(element.width_cm * Math.abs(dot(pX, across)) + element.depth_cm * Math.abs(dot(pY, across)) + element.height_cm * Math.abs(dot(pZ, across)))
  switch (view) {
    case 'top':
      return { u: element.x_cm, v: element.y_cm, width, height, rotationDeg }
    case 'front':
      return { u: element.x_cm, v: element.z_cm + element.height_cm / 2, width, height, rotationDeg }
    case 'side':
      return { u: element.y_cm, v: element.z_cm + element.height_cm / 2, width, height, rotationDeg }
  }
}

export interface ProjectedAxes {
  /** Drawn-frame travel of 1 cm along the element's width/length axis. */
  ax: PlaneVec
  /** … across its depth axis (a truss lane offset). */
  ay: PlaneVec
  /** … up its height axis. */
  az: PlaneVec
}

/**
 * Where the element's own axes point inside its drawn frame — the
 * rotated group the canvas renders the element in (u along the drawn
 * width, v along the drawn height, SVG-down). A point at (a, b, c) cm
 * in the element's local frame draws at a·ax + b·ay + c·az from its
 * centre, so truss fixtures project exactly like the bar itself. A
 * near-zero vector is an axis pointing into the screen.
 */
export function projectedAxes(element: StagePlotElement, view: StagePlotView): ProjectedAxes {
  const axes = localAxes(element.rotation_deg, element.tilt_deg)
  const radians = (drawnRotation(element, view) * Math.PI) / 180
  const along = { u: Math.cos(radians), v: Math.sin(radians) }
  const across = { u: -Math.sin(radians), v: Math.cos(radians) }
  const toDrawn = (a: Vec3): PlaneVec => {
    const p = screenDirection(a, view)
    return { u: dot(p, along), v: dot(p, across) }
  }
  return { ax: toDrawn(axes.ax), ay: toDrawn(axes.ay), az: toDrawn(axes.az) }
}

/** Convex hull (monotone chain); input is a handful of box corners. */
function convexHull(points: PlaneVec[]): PlaneVec[] {
  const pts = [...points].sort((a, b) => a.u - b.u || a.v - b.v)
  const cross = (o: PlaneVec, a: PlaneVec, b: PlaneVec) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u)
  const build = (list: PlaneVec[]) => {
    const hull: PlaneVec[] = []
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop()
      hull.push(p)
    }
    return hull
  }
  const lower = build(pts)
  const upper = build([...pts].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * The true silhouette of the element's oriented box in a view: the
 * convex hull of its eight projected corners, in the drawn rect's
 * frame. A plain rectangle when at most one rotation shows; up to a
 * hexagon when yaw and tilt combine — the shape a rotated rectangle
 * cannot represent.
 */
export function projectedOutline(element: StagePlotElement, view: StagePlotView): PlaneVec[] {
  const { ax, ay, az } = projectedAxes(element, view)
  const hw = element.width_cm / 2
  const hd = element.depth_cm / 2
  const hh = element.height_cm / 2
  const corners: PlaneVec[] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push({
          u: roundCm(sx * hw * ax.u + sy * hd * ay.u + sz * hh * az.u),
          v: roundCm(sx * hw * ax.v + sy * hd * ay.v + sz * hh * az.v),
        })
      }
    }
  }
  return convexHull(corners)
}

/**
 * Which stored fields a drag in this view writes: moving along u/v
 * changes exactly these element properties (vertical drags in the
 * elevations move the element's bottom, i.e. z_cm).
 */
export function viewAxisFields(view: StagePlotView): { u: 'x_cm' | 'y_cm'; v: 'y_cm' | 'z_cm' } {
  switch (view) {
    case 'top':
      return { u: 'x_cm', v: 'y_cm' }
    case 'front':
      return { u: 'x_cm', v: 'z_cm' }
    case 'side':
      return { u: 'y_cm', v: 'z_cm' }
  }
}

/** Pixels per centimetre at a zoom level (zoom 1 ⇒ 1 px per cm). */
export function pxPerCm(zoom: number): number {
  return zoom
}

/**
 * Axis-aligned bounding box (in the view plane, centered coordinates)
 * of an element's projected rectangle under its rotation (plan rotation
 * in the top view, tilt in the front view; the side view is unrotated).
 */
export function projectedBounds(element: StagePlotElement, view: StagePlotView): { minU: number; maxU: number; minV: number; maxV: number } {
  const rect = projectElement(element, view)
  const radians = (rect.rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const halfW = (rect.width * cos + rect.height * sin) / 2
  const halfH = (rect.width * sin + rect.height * cos) / 2
  return { minU: rect.u - halfW, maxU: rect.u + halfW, minV: rect.v - halfH, maxV: rect.v + halfH }
}

/** Clamp a dimension edit to the minimum sane size. */
export function clampDimension(valueCm: number): number {
  return Math.max(MIN_DIMENSION_CM, valueCm)
}

/** Round a cm value for display/storage after drag math (0.1 mm grain
 *  kills float noise without ever visibly moving anything). */
export function roundCm(valueCm: number): number {
  return Math.round(valueCm * 100) / 100
}

// ---- Trusses & fixture labels (US5) ----

/**
 * Suggest a piece length in cm from a catalog item name (research.md
 * R3): the LL.xlsx catalog encodes dimensions in names ("Tross F34 2m",
 * "0,5m"), the same convention cables use. Returns null when no length
 * is recognizable — the user then types it manually.
 */
export function parseLengthFromName(name: string): number | null {
  // Last "number + m/cm" token wins ("F34 … 2m" → the 2m, not the 34).
  const matches = [...name.matchAll(/(\d+(?:[.,]\d+)?)\s*(cm|m)\b/gi)]
  const last = matches[matches.length - 1]
  if (!last) return null
  const value = Number(last[1].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  return last[2].toLowerCase() === 'm' ? value * 100 : value
}

/** A truss's drawn length is exactly the sum of its pieces (FR-023). */
export function trussLength(pieces: Array<{ length_cm: number }>): number {
  return pieces.reduce((sum, piece) => sum + piece.length_cm, 0)
}

export interface FixtureLabelSettings {
  show_fixture_name: boolean
  show_fixture_fid: boolean
  show_fixture_dmx: boolean
}

export interface FixtureLabelSource {
  fixture_name?: string
  fixture_number?: number
  dmx_universe?: number
  dmx_start_address?: number
}

/**
 * Compose the label drawn beside a fixture (FR-029): any combination of
 * name, FID, and DMX universe.address — parts whose value is missing
 * are simply omitted. "Spot 1 · FID 11 · 1.001".
 */
export function fixtureLabel(fixture: FixtureLabelSource, settings: FixtureLabelSettings): string {
  const parts: string[] = []
  if (settings.show_fixture_name && fixture.fixture_name) parts.push(fixture.fixture_name)
  if (settings.show_fixture_fid && fixture.fixture_number != null) parts.push(`FID ${fixture.fixture_number}`)
  if (settings.show_fixture_dmx && fixture.dmx_universe != null && fixture.dmx_start_address != null) {
    parts.push(`${fixture.dmx_universe}.${String(fixture.dmx_start_address).padStart(3, '0')}`)
  }
  return parts.join(' · ')
}

/**
 * Clamp a fixture's offset to the truss's current extent (edge case: a
 * removed piece shortened the truss). Returns the drawn offset and
 * whether it had to be clamped (rendered flagged).
 */
export function clampFixtureOffset(offsetCm: number, trussLengthCm: number): { offset: number; clamped: boolean } {
  if (offsetCm <= trussLengthCm) return { offset: offsetCm, clamped: false }
  return { offset: trussLengthCm, clamped: true }
}

// ---- Truss drag-and-drop (fixtures hang on a lane of the bar) ----

/** How far (cm) outside the drawn bar a dropped fixture still attaches. */
export const TRUSS_DROP_MARGIN_CM = 25

/**
 * A view-plane point (SVG coordinates, v down) expressed in a projected
 * rect's local frame: origin at the rect centre, u along its width.
 * The rect's rotation (plan rotation in the top view, tilt in the
 * front view) is inverted — exactly the transform the canvas renders
 * elements with.
 */
export function rectLocalPoint(
  point: { u: number; v: number },
  rect: ProjectedRect,
  view: StagePlotView,
): { u: number; v: number } {
  const centerV = view === 'top' ? rect.v : -rect.v
  const du = point.u - rect.u
  const dv = point.v - centerV
  if (rect.rotationDeg === 0) return { u: du, v: dv }
  const radians = (-rect.rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { u: du * cos - dv * sin, v: du * sin + dv * cos }
}

/** Which lane a local v (SVG down = downstage in the top view) lands
 *  on: the bar's depth is split into three equal bands. */
export function trussSideForLocalV(localV: number, barHalfDepth: number): TrussSide {
  if (localV < -barHalfDepth / 3) return 'top'
  if (localV > barHalfDepth / 3) return 'bottom'
  return 'middle'
}

/** The local v a lane is drawn at: the upstage chord, the centre line,
 *  or the downstage chord of the bar. */
export function trussLaneLocalV(side: TrussSide, barHalfDepth: number): number {
  return side === 'top' ? -barHalfDepth : side === 'bottom' ? barHalfDepth : 0
}

/**
 * Where a fixture dropped at a local point lands on the truss: offset
 * along the bar (clamped to its length) and the lane under the drop.
 * Null when the point is outside the bar plus the drop margin — the
 * drop is not an attach.
 */
export function fixtureDropOnTruss(
  local: { u: number; v: number },
  lengthCm: number,
  barHalfDepth: number,
  marginCm: number = TRUSS_DROP_MARGIN_CM,
): { offset: number; side: TrussSide } | null {
  const halfLength = lengthCm / 2
  if (Math.abs(local.u) > halfLength + marginCm || Math.abs(local.v) > barHalfDepth + marginCm) return null
  return {
    offset: roundCm(Math.min(lengthCm, Math.max(0, local.u + halfLength))),
    side: trussSideForLocalV(local.v, barHalfDepth),
  }
}

// ---- Snapping (research.md R8) ----

/** Snap threshold in screen pixels, converted to cm via the current zoom. */
export const SNAP_THRESHOLD_PX = 8

export interface SnapBounds {
  minU: number
  maxU: number
  minV: number
  maxV: number
}

export interface SnapSettings {
  snapGrid: boolean
  snapObjects: boolean
  gridSizeCm: number
}

export interface SnapGuide {
  axis: 'u' | 'v'
  /** The aligned coordinate in cm (a neighbour's edge/centre or a grid line). */
  position: number
  source: 'object' | 'grid'
}

export interface SnapResult {
  u: number
  v: number
  guides: SnapGuide[]
}

interface AxisCandidate {
  /** Corrected center coordinate on this axis. */
  center: number
  distance: number
  guide: SnapGuide
}

function axisReferencePoints(center: number, halfExtent: number): number[] {
  // Center first: on a distance tie the centre alignment wins, keeping
  // the choice deterministic (spec edge case).
  return [center, center - halfExtent, center + halfExtent]
}

function bestObjectCandidate(
  axis: 'u' | 'v',
  center: number,
  halfExtent: number,
  neighborPoints: number[],
  thresholdCm: number,
): AxisCandidate | null {
  let best: AxisCandidate | null = null
  for (const own of axisReferencePoints(center, halfExtent)) {
    for (const target of neighborPoints) {
      const delta = target - own
      const distance = Math.abs(delta)
      if (distance > thresholdCm) continue
      if (!best || distance < best.distance) {
        best = { center: center + delta, distance, guide: { axis, position: target, source: 'object' } }
      }
    }
  }
  return best
}

function bestGridCandidate(axis: 'u' | 'v', center: number, halfExtent: number, gridSizeCm: number): AxisCandidate {
  let best: AxisCandidate | null = null
  for (const own of axisReferencePoints(center, halfExtent)) {
    const target = Math.round(own / gridSizeCm) * gridSizeCm
    const delta = target - own
    const distance = Math.abs(delta)
    if (!best || distance < best.distance) {
      best = { center: center + delta, distance, guide: { axis, position: target, source: 'grid' } }
    }
  }
  return best as AxisCandidate
}

/**
 * Snap a dragged element's proposed centre. Per axis independently:
 * object edge/centre alignment against neighbours wins within the
 * screen-px threshold; otherwise the nearest grid multiple of any of
 * the element's edges/centre (grid snapping is not threshold-gated —
 * the nearest line always wins). Results are exact target coordinates,
 * never near-misses (SC-003): the correction is computed as an exact
 * delta to the target, so the aligned edge/centre lands on it exactly.
 */
export function snapPosition(
  proposed: { u: number; v: number },
  halfExtents: { halfW: number; halfH: number },
  neighbors: SnapBounds[],
  settings: SnapSettings,
  pxPerCmValue: number,
): SnapResult {
  const thresholdCm = SNAP_THRESHOLD_PX / pxPerCmValue
  const result: SnapResult = { u: proposed.u, v: proposed.v, guides: [] }

  const neighborU: number[] = []
  const neighborV: number[] = []
  if (settings.snapObjects) {
    for (const bounds of neighbors) {
      neighborU.push(bounds.minU, (bounds.minU + bounds.maxU) / 2, bounds.maxU)
      neighborV.push(bounds.minV, (bounds.minV + bounds.maxV) / 2, bounds.maxV)
    }
  }

  const axes: Array<{ axis: 'u' | 'v'; center: number; halfExtent: number; neighborPoints: number[] }> = [
    { axis: 'u', center: proposed.u, halfExtent: halfExtents.halfW, neighborPoints: neighborU },
    { axis: 'v', center: proposed.v, halfExtent: halfExtents.halfH, neighborPoints: neighborV },
  ]

  for (const { axis, center, halfExtent, neighborPoints } of axes) {
    let candidate: AxisCandidate | null = null
    if (settings.snapObjects) {
      candidate = bestObjectCandidate(axis, center, halfExtent, neighborPoints, thresholdCm)
    }
    if (!candidate && settings.snapGrid && settings.gridSizeCm > 0) {
      candidate = bestGridCandidate(axis, center, halfExtent, settings.gridSizeCm)
    }
    if (candidate) {
      if (axis === 'u') result.u = candidate.center
      else result.v = candidate.center
      if (candidate.guide.source === 'object') result.guides.push(candidate.guide)
    }
  }
  return result
}
