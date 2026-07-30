/**
 * The flow canvas's coordinate plane (Slice 37).
 *
 * Until this slice both canvases sized their coordinate space from the browser window
 * — `canvasWidth = max(820, panelWidth) / zoom` — and pinned two rails to its edges.
 * A node's stored x therefore meant a different place on every screen, and the middle
 * lane, being whatever was left between the rails, came out **92 px wide on a phone**
 * for nodes that are 200 px wide. Everything in it was clamped onto one pixel.
 *
 * The plane replaces that with the stage plot's model: coordinates are absolute, and
 * the view moves over them. Nothing here knows the panel's width.
 *
 * ## Why an origin exists at all
 *
 * Panning is the platform's own scrolling (research.md R3) — momentum, both axes, and
 * no gesture handler competing with a node drag. But a scroll container has no
 * negative side, and this slice deliberately allows a node above or to the left of
 * everything else, because a floor at zero is an arbitrary limit.
 *
 * The two are reconciled by choosing where the plane *starts*: a node is drawn at
 * `x - origin.x`, and the origin is the least-placed node less a margin. Negative
 * logical coordinates become non-negative DOM offsets, and placing something further
 * left grows the plane instead of refusing.
 *
 * The price is `originShift`, and it is the whole reason this module is a pure
 * function rather than four lines inside a component: the origin is derived from the
 * content, so dragging one node past the left edge moves *every other node's* DOM
 * offset. See its own note.
 */

export interface PlanePoint {
  x: number
  y: number
}

/** The plane's top-left, in the same logical coordinates a node's position is stored in. */
export type PlaneOrigin = PlanePoint

/**
 * How much empty plane to keep beyond the outermost node, so that a node against the
 * edge is not against the edge of the scrollable area too.
 */
export const PLANE_MARGIN = 24

/**
 * The plane's top-left: the least x and the least y over every placed node, less a
 * margin — and never *greater* than `0`, so that a graph placed entirely in positive
 * space still starts at the origin rather than cropping to its own content.
 *
 * That last clause is what keeps the common case boring. Without it a graph whose
 * leftmost node sits at x = 300 would render with that node flush against the plane's
 * left edge, and the empty space every existing graph was arranged inside would
 * silently disappear the first time this shipped.
 *
 * An empty graph has no bounding box, so the origin is `0, 0`: there is nothing to be
 * left of.
 */
export function planeOrigin(points: PlanePoint[], margin: number = PLANE_MARGIN): PlaneOrigin {
  let minX = 0
  let minY = 0
  for (const point of points) {
    // A NaN position is data we cannot place; ignoring it beats poisoning the origin
    // for every other node, which is what `Math.min` with NaN would do.
    if (Number.isFinite(point.x) && point.x - margin < minX) minX = point.x - margin
    if (Number.isFinite(point.y) && point.y - margin < minY) minY = point.y - margin
  }
  return { x: minX, y: minY }
}

/**
 * How far a scroll offset must move to keep the content visually still when the origin
 * changes.
 *
 * When the origin moves left by `d`, every node's DOM offset moves right by `d`, so the
 * viewport must scroll right by `d × zoom` to look unchanged. Miss this and dragging a
 * node past the left edge makes the whole graph lurch under the finger holding it —
 * once per frame, for as long as the drag keeps extending the plane.
 *
 * Returned as a delta rather than an absolute offset on purpose: the caller adds it to
 * whatever `scrollLeft` happens to be at that instant, which is the only value that is
 * correct in the presence of momentum still running from the last flick.
 */
export function originShift(before: PlaneOrigin, after: PlaneOrigin, zoom: number): PlanePoint {
  if (!Number.isFinite(zoom) || zoom <= 0) return { x: 0, y: 0 }
  return {
    x: (before.x - after.x) * zoom,
    y: (before.y - after.y) * zoom,
  }
}

/**
 * The scroll offset that puts `pan` at the window's top-left.
 *
 * A remembered view is stored as the **logical** point the window was looking at, not as
 * a scroll offset (FR-010). A scroll offset means nothing on its own: it is relative to an
 * origin that moves with the content and scaled by a zoom that the next visit may not
 * open at. The logical point is the only part of "where I was" that is still true
 * tomorrow, on a rotated phone, after somebody else moved a node.
 *
 * Clamped at zero because that is what a scroll container would do anyway — better to
 * agree with it than to hand it a negative and read a different number back.
 */
export function panToScroll(pan: PlanePoint, origin: PlaneOrigin, zoom: number): PlanePoint {
  if (!Number.isFinite(zoom) || zoom <= 0) return { x: 0, y: 0 }
  return {
    x: Math.max(0, (pan.x - origin.x) * zoom),
    y: Math.max(0, (pan.y - origin.y) * zoom),
  }
}

/** The inverse: which logical point the window is looking at, to be stored. */
export function scrollToPan(scroll: PlanePoint, origin: PlaneOrigin, zoom: number): PlanePoint {
  if (!Number.isFinite(zoom) || zoom <= 0) return { ...origin }
  return {
    x: scroll.x / zoom + origin.x,
    y: scroll.y / zoom + origin.y,
  }
}

/**
 * The plane's extent: the content it holds, plus the same margin `planeOrigin` puts on the
 * other two sides (FR-006).
 *
 * Here rather than inline in each canvas so that the four sides of one margin are defined
 * in one file. Without the right and bottom, a node against the edge of the content is
 * against the edge of the scrollable area too, with nowhere to drop the one beside it.
 */
export function planeExtent(content: { width: number; height: number }, margin: number = PLANE_MARGIN): { width: number; height: number } {
  return { width: content.width + margin, height: content.height + margin }
}
