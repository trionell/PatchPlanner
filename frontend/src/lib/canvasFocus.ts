/**
 * Moving the window over a graph.
 *
 * Two callers, and the second is why this is a function rather than a call:
 *
 * - **search** brings the first match into view, at every width (Slice 36 FR-030) —
 *   which is what turns a dim-the-rest highlight into a direction, on a 341 px window
 *   over an 820 px graph;
 * - **selection on a phone** puts the tapped box in the part of the window the inspector
 *   sheet does not cover, which is `clearBottom`.
 *
 * It is arithmetic rather than `element.scrollIntoView({ block: 'nearest' })` for two
 * reasons. The canvas already knows every node's position — it computes `layout` to draw
 * them — so a DOM query would be a second source for something already derived. And
 * `nearest` cannot express *clear of the bottom 45 %*, which is the whole of the second
 * caller (research.md R6).
 */

/** A placed node, in the graph's own logical coordinates. Both canvases' `layout` fits. */
export interface FocusNode {
  x: number
  y: number
}

/**
 * The first node a predicate accepts, **in layout order**.
 *
 * Layout order and not data order: what someone means by "the first match" is the one
 * nearest the top-left of the drawing, and `layout` is already sorted by where things
 * are rather than by when they were created.
 *
 * The predicate must be the same one the dimming uses. Deriving the focused node from a
 * second predicate is how the dimmed set and the window's target come to disagree.
 */
export function firstMatch<T extends FocusNode>(layout: readonly T[], matches: (node: T) => boolean): T | undefined {
  return [...layout].sort((a, b) => a.x - b.x || a.y - b.y).find(matches)
}

export interface FocusView {
  /** The current scale. Logical coordinates are multiplied by it to reach rendered px. */
  zoom: number
  viewportW: number
  viewportH: number
  /** Where the window is now, so an already-visible node can be left alone. */
  scrollLeft: number
  scrollTop: number
  /** The node's drawn size, in logical px. Height may be omitted where it is unknown. */
  nodeW: number
  nodeH?: number
  /** Rendered px along the bottom that something covers — the inspector sheet. */
  clearBottom?: number
  /** The scrollable content's rendered size, so the result cannot overshoot it. */
  contentW?: number
  contentH?: number
  /** How much clear space a node needs around it to count as "already visible". */
  margin?: number
}

/**
 * Where the window should be so `node` is comfortably inside it.
 *
 * **A node that is already comfortably inside does not move the window.** That is not an
 * optimisation: typing a second character of a search term that still matches the same
 * box must not jump the view, and neither must re-tapping a box you are already looking
 * at.
 */
export function focusOffset(node: FocusNode, view: FocusView): { left: number; top: number } {
  const { zoom, viewportW, viewportH, scrollLeft, scrollTop, nodeW } = view
  const nodeH = view.nodeH ?? 0
  const margin = view.margin ?? 16
  const usableH = Math.max(0, viewportH - (view.clearBottom ?? 0))

  const left0 = node.x * zoom
  const top0 = node.y * zoom
  const w = nodeW * zoom
  const h = nodeH * zoom

  const insideX = left0 >= scrollLeft + margin && left0 + w <= scrollLeft + viewportW - margin
  const insideY = top0 >= scrollTop + margin && top0 + h <= scrollTop + usableH - margin
  if (insideX && insideY) return { left: scrollLeft, top: scrollTop }

  const clamp = (value: number, extent: number | undefined, window: number) =>
    Math.max(0, extent === undefined ? value : Math.min(value, Math.max(0, extent - window)))

  return {
    left: clamp(left0 - (viewportW - w) / 2, view.contentW, viewportW),
    top: clamp(top0 - (usableH - h) / 2, view.contentH, viewportH),
  }
}
