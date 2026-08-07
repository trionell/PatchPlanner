import type { MeasurementType, StagePlotElement, StagePlotView, TrussSide } from '../types'

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

export interface PlaneVec {
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

/** The scale a plot canvas may be held at, in px per cm: an 800 px viewport
 *  spans 160 m at the floor and 40 cm at the ceiling. */
export const MIN_PLOT_ZOOM = 0.05
export const MAX_PLOT_ZOOM = 20

/** Hold a scale inside the range the canvas can draw and the buttons can walk
 *  back from. The wheel, the toolbar and the remembered view all pass through
 *  it, so a stored value can never open a plot somewhere the UI cannot leave. */
export function clampPlotZoom(zoom: number): number {
  return Math.min(MAX_PLOT_ZOOM, Math.max(MIN_PLOT_ZOOM, zoom))
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

/**
 * What the truss will measure once `pieceId` is gone (Slice 39 FR-018).
 *
 * The confirm asks about the piece, but the consequence is the *truss* — the bar
 * gets shorter on every plot that shows it, and the user is looking at a list of
 * near-identical rows while it happens. So the sentence states the new length,
 * which means the length has to be derivable without a render.
 *
 * A piece id that is not in the truss returns the length unchanged: the row is
 * gone already, and a confirm is not the place to discover it.
 */
export function lengthWithoutPiece(pieces: Array<{ id: number; length_cm: number }>, pieceId: number): number {
  return trussLength(pieces.filter((piece) => piece.id !== pieceId))
}

/**
 * The drawer's subtitle — what its contents are shared by, which is the one
 * thing about a truss that is not visible on the plot it is drawn on.
 */
export function trussSubtitle(count: number): string {
  if (count === 0) return 'Trusses are shared by every plot in this event'
  return `${count} ${count === 1 ? 'truss' : 'trusses'}, shared by every plot in this event`
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

// ---- Measurements (Slice 42) ----
//
// A measurement states a distance between two anchors. Its value is always
// derived from those anchors and never stored, so it stays true when what it
// measures is moved, resized, rotated or raked.
//
// Everything below works in the PROJECTED plane — the (u, v) frame
// `projectElement` returns a centre in, where v grows downstage in the top
// view and UP in the elevations. That is the frame both renderers already take
// as input: the canvas places a group at `svgY = view === 'top' ? rect.v : -rect.v`,
// and the document's mapper flips the same way. An element's own drawn frame
// has v pointing DOWN in every view, so converting out of it negates v in the
// elevations — `viewFlip` below is that one negation, in one place.

/** A sign on one of the element's local axes. */
export type AnchorSign = -1 | 1

/**
 * A feature of an element's own box — NOT a vertex of its drawn silhouette.
 * The silhouette's vertex count changes with rotation (four for a plain rect,
 * up to six when yaw and tilt combine), so an index into it would come to mean
 * a different corner after a rake. A box feature is stable under every edit.
 */
export type AnchorFeature =
  | { kind: 'centre' }
  | { kind: 'corner'; signs: [AnchorSign, AnchorSign, AnchorSign] }
  | { kind: 'face'; axis: 0 | 1 | 2; sign: AnchorSign }

const AXIS_LETTERS = ['x', 'y', 'z'] as const

/** Below this, a face's projected normal is pointing into the screen: the face
 *  is seen face-on and has no straight side to measure to. */
export const FACE_EDGE_ON_MIN = 0.05

export function formatAnchorFeature(feature: AnchorFeature): string {
  if (feature.kind === 'centre') return 'centre'
  if (feature.kind === 'corner') return `corner:${feature.signs.map((s) => (s > 0 ? '+' : '-')).join('')}`
  return `face:${feature.sign > 0 ? '+' : '-'}${AXIS_LETTERS[feature.axis]}`
}

export function parseAnchorFeature(value: string): AnchorFeature | null {
  if (value === 'centre') return { kind: 'centre' }
  const asSign = (s: string): AnchorSign => (s === '+' ? 1 : -1)
  const corner = /^corner:([+-])([+-])([+-])$/.exec(value)
  if (corner) return { kind: 'corner', signs: [asSign(corner[1]), asSign(corner[2]), asSign(corner[3])] }
  const face = /^face:([+-])([xyz])$/.exec(value)
  if (face) return { kind: 'face', axis: AXIS_LETTERS.indexOf(face[2] as 'x' | 'y' | 'z') as 0 | 1 | 2, sign: asSign(face[1]) }
  return null
}

/** The elevations draw v upward while an element's drawn frame points it down. */
function viewFlip(view: StagePlotView): number {
  return view === 'top' ? 1 : -1
}

function halfExtents(element: StagePlotElement): [number, number, number] {
  return [element.width_cm / 2, element.depth_cm / 2, element.height_cm / 2]
}

function axisList(element: StagePlotElement, view: StagePlotView): [PlaneVec, PlaneVec, PlaneVec] {
  const { ax, ay, az } = projectedAxes(element, view)
  return [ax, ay, az]
}

/** A displacement in the element's drawn frame, turned into the projected
 *  plane: rotate by the drawn rotation, then undo the elevations' v flip. */
function drawnToProjected(offset: PlaneVec, rect: ProjectedRect, view: StagePlotView): PlaneVec {
  const radians = (rect.rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const u = offset.u * cos - offset.v * sin
  const v = offset.u * sin + offset.v * cos
  return { u: roundCm(u), v: roundCm(v * viewFlip(view)) }
}

function featureDrawnOffset(element: StagePlotElement, view: StagePlotView, feature: AnchorFeature): PlaneVec {
  if (feature.kind === 'centre') return { u: 0, v: 0 }
  const axes = axisList(element, view)
  const half = halfExtents(element)
  if (feature.kind === 'corner') {
    let u = 0
    let v = 0
    for (let i = 0; i < 3; i++) {
      u += feature.signs[i] * half[i] * axes[i].u
      v += feature.signs[i] * half[i] * axes[i].v
    }
    return { u, v }
  }
  const i = feature.axis
  return { u: feature.sign * half[i] * axes[i].u, v: feature.sign * half[i] * axes[i].v }
}

/**
 * Where an anchor feature falls in the projected plane. A face resolves to its
 * projected CENTRE, which is the midpoint of that straight side in any view
 * that shows the face edge-on — the "middle of each straight side" the feature
 * exists to give.
 */
export function anchorPoint(element: StagePlotElement, view: StagePlotView, feature: AnchorFeature): PlaneVec {
  const rect = projectElement(element, view)
  const offset = drawnToProjected(featureDrawnOffset(element, view, feature), rect, view)
  return { u: roundCm(rect.u + offset.u), v: roundCm(rect.v + offset.v) }
}

/** A face seen edge-on: the infinite line it projects to, and the extent it
 *  actually draws over. */
export interface FaceLine {
  /** A point on the line — the face's projected centre. */
  point: PlaneVec
  /** Unit direction along the line. */
  dir: PlaneVec
  /** Unit normal, pointing out of the face. */
  normal: PlaneVec
  /** The drawn extent of the side, for deciding when a foot needs a run-out. */
  segment: [PlaneVec, PlaneVec]
}

function length(v: PlaneVec): number {
  return Math.hypot(v.u, v.v)
}

function normalize(v: PlaneVec): PlaneVec {
  const l = length(v)
  return l === 0 ? { u: 0, v: 0 } : { u: v.u / l, v: v.v / l }
}

/**
 * The line a face projects to, or null where the face is not edge-on. A face's
 * projected normal has length ~1 when the normal lies in the view plane (the
 * face is seen as a side) and ~0 when it points into the screen (the face is
 * seen flat). That single test also declines the top and bottom faces in a top
 * view, which is correct and needs no special case.
 */
export function faceLine(element: StagePlotElement, view: StagePlotView, feature: AnchorFeature): FaceLine | null {
  if (feature.kind !== 'face') return null
  const rect = projectElement(element, view)
  const axes = axisList(element, view)
  const half = halfExtents(element)
  const raw = drawnToProjected({ u: feature.sign * axes[feature.axis].u, v: feature.sign * axes[feature.axis].v }, rect, view)
  if (length(raw) < FACE_EDGE_ON_MIN) return null
  const normal = normalize(raw)
  const dir = { u: -normal.v, v: normal.u }
  const point = anchorPoint(element, view, feature)
  // The face's four corners, projected: edge-on they collapse onto the line,
  // and their spread along it is the side's drawn extent.
  const others = [0, 1, 2].filter((i) => i !== feature.axis)
  let min = Infinity
  let max = -Infinity
  for (const sj of [-1, 1]) {
    for (const sk of [-1, 1]) {
      const offset = { u: 0, v: 0 }
      offset.u = feature.sign * half[feature.axis] * axes[feature.axis].u + sj * half[others[0]] * axes[others[0]].u + sk * half[others[1]] * axes[others[1]].u
      offset.v = feature.sign * half[feature.axis] * axes[feature.axis].v + sj * half[others[0]] * axes[others[0]].v + sk * half[others[1]] * axes[others[1]].v
      const p = drawnToProjected(offset, rect, view)
      const t = p.u * dir.u + p.v * dir.v
      if (t < min) min = t
      if (t > max) max = t
    }
  }
  const base = point.u * dir.u + point.v * dir.v
  const segment: [PlaneVec, PlaneVec] = [
    { u: roundCm(point.u + (min - base) * dir.u), v: roundCm(point.v + (min - base) * dir.v) },
    { u: roundCm(point.u + (max - base) * dir.u), v: roundCm(point.v + (max - base) * dir.v) },
  ]
  return { point, dir, normal, segment }
}

/** An ellipse has no straight side, so "anywhere along it" cannot be kept: a
 *  perpendicular to a curve is different at every point. Its four quadrant
 *  points are still offered — they are its edge-on face centres. */
export function allowsPlaneAnchor(element: StagePlotElement): boolean {
  return element.shape_kind !== 'ellipse'
}

export interface OfferedAnchor {
  feature: AnchorFeature
  point: PlaneVec
  /** Faces only: whether this feature can also be taken as a sliding plane. */
  allowSlide: boolean
}

/**
 * The anchor features an element offers in a view: its centre, the corners
 * that are vertices of its drawn silhouette, and the midpoints of the sides it
 * actually shows. Corners projecting into the interior of the silhouette are
 * not corners of the drawn shape and are not offered.
 */
export function offeredAnchors(element: StagePlotElement, view: StagePlotView): OfferedAnchor[] {
  const rect = projectElement(element, view)
  const offered: OfferedAnchor[] = [{ feature: { kind: 'centre' }, point: { u: rect.u, v: rect.v }, allowSlide: false }]
  const hull = projectedOutline(element, view).map((p) => drawnToProjected(p, rect, view))
  // The hull's points were rounded to the 0.1 mm grain before this rounds them
  // again, so the comparison has to clear two roundings, not one.
  const onHull = (p: PlaneVec) => hull.some((h) => Math.abs(h.u - p.u) < 0.05 && Math.abs(h.v - p.v) < 0.05)
  const seen = new Set<string>()
  const key = (p: PlaneVec) => `${Math.round(p.u * 100)}:${Math.round(p.v * 100)}`
  for (const sx of [1, -1] as AnchorSign[]) {
    for (const sy of [1, -1] as AnchorSign[]) {
      for (const sz of [1, -1] as AnchorSign[]) {
        const feature: AnchorFeature = { kind: 'corner', signs: [sx, sy, sz] }
        const offset = drawnToProjected(featureDrawnOffset(element, view, feature), rect, view)
        if (!onHull(offset)) continue
        const point = { u: roundCm(rect.u + offset.u), v: roundCm(rect.v + offset.v) }
        // Corners that coincide in this projection are one drawn corner; the
        // first in this fixed order wins, so the choice is deterministic.
        if (seen.has(key(point))) continue
        seen.add(key(point))
        offered.push({ feature, point, allowSlide: false })
      }
    }
  }
  const slide = allowsPlaneAnchor(element)
  for (const axis of [0, 1, 2] as const) {
    for (const sign of [1, -1] as AnchorSign[]) {
      const feature: AnchorFeature = { kind: 'face', axis, sign }
      if (!faceLine(element, view, feature)) continue
      offered.push({ feature, point: anchorPoint(element, view, feature), allowSlide: slide })
    }
  }
  return offered
}

/** One end of a measurement, already resolved against the plot's geometry. */
export type MeasurementEnd = { kind: 'point'; point: PlaneVec } | { kind: 'line'; line: FaceLine }

export interface MeasurementSpan {
  /** The point the measurement runs from, after any foot has been found. */
  a: PlaneVec
  b: PlaneVec
  /** Unit direction the value is measured along. */
  dir: PlaneVec
  value: number
}

/** Where a ray from `origin` along `dir` crosses a line, or null if parallel. */
function rayMeetsLine(origin: PlaneVec, dir: PlaneVec, line: FaceLine): PlaneVec | null {
  const denominator = dir.u * line.normal.u + dir.v * line.normal.v
  if (Math.abs(denominator) < 1e-9) return null
  const toLine = { u: line.point.u - origin.u, v: line.point.v - origin.v }
  const t = (toLine.u * line.normal.u + toLine.v * line.normal.v) / denominator
  return { u: roundCm(origin.u + t * dir.u), v: roundCm(origin.v + t * dir.v) }
}

/**
 * What a measurement actually measures. The three types differ only in the
 * direction the value is read along: aligned reads along the line between the
 * ends (or along a face's normal, which is what makes it perpendicular),
 * horizontal and vertical read along one of the view's axes alone.
 *
 * Returns null where the ends state no distance: two coincident points, or a
 * locked type whose axis runs parallel to the face it measures to.
 */
export function measurementSpan(from: MeasurementEnd, to: MeasurementEnd, type: MeasurementType): MeasurementSpan | null {
  const axisDir = type === 'horizontal' ? { u: 1, v: 0 } : type === 'vertical' ? { u: 0, v: 1 } : null

  if (from.kind === 'point' && to.kind === 'point') {
    const delta = { u: to.point.u - from.point.u, v: to.point.v - from.point.v }
    const dir = axisDir ?? normalize(delta)
    if (length(dir) === 0) return null
    return { a: from.point, b: to.point, dir, value: roundCm(Math.abs(delta.u * dir.u + delta.v * dir.v)) }
  }

  if (from.kind === 'line' && to.kind === 'line') {
    // Only parallel faces have a single distance between them.
    if (Math.abs(from.line.normal.u * to.line.normal.v - from.line.normal.v * to.line.normal.u) > 1e-6) return null
    const dir = axisDir ?? from.line.normal
    const a = from.line.point
    const b = rayMeetsLine(a, dir, to.line)
    if (!b) return null
    return { a, b, dir, value: roundCm(Math.abs((b.u - a.u) * dir.u + (b.v - a.v) * dir.v)) }
  }

  const line = from.kind === 'line' ? from.line : (to as { kind: 'line'; line: FaceLine }).line
  const point = from.kind === 'point' ? from.point : (to as { kind: 'point'; point: PlaneVec }).point
  const dir = axisDir ?? line.normal
  const foot = rayMeetsLine(point, dir, line)
  if (!foot) return null
  const a = from.kind === 'point' ? point : foot
  const b = from.kind === 'point' ? foot : point
  return { a, b, dir, value: roundCm(Math.abs((b.u - a.u) * dir.u + (b.v - a.v) * dir.v)) }
}

export interface MeasurementDrawing extends MeasurementSpan {
  /** Unit normal to `dir`: the direction the offset moves the line along. */
  normal: PlaneVec
  /** The dimension line, held clear of the geometry by the offset. */
  lineA: PlaneVec
  lineB: PlaneVec
}

/**
 * The drawn dimension line for a span. At zero offset a locked measurement
 * sits on the end picked SECOND, and the first grows the extension line; an
 * aligned one runs straight between its ends, because both share the same
 * perpendicular coordinate. The offset never changes the value.
 */
export function measurementDrawing(span: MeasurementSpan, offsetCm: number): MeasurementDrawing {
  const normal = { u: -span.dir.v, v: span.dir.u }
  const at = (p: PlaneVec) => p.u * normal.u + p.v * normal.v
  const target = at(span.b) + offsetCm
  const shift = (p: PlaneVec): PlaneVec => {
    const delta = target - at(p)
    return { u: roundCm(p.u + delta * normal.u), v: roundCm(p.v + delta * normal.v) }
  }
  return { ...span, normal, lineA: shift(span.a), lineB: shift(span.b) }
}
