/**
 * The scale at which a whole graph fits its window.
 *
 * A phone's Flow canvas is a **viewport** (design/patterns.md §7f): the graph's logical
 * space is fixed, and zoom moves the window onto it rather than moving anything within
 * it. So there is one scale at which the picture is complete, and it is the scale the
 * canvas opens at and the one its zoom readout resets to.
 *
 * It is measured rather than assumed, because the canvas region's height is whatever is
 * left after a bar that is one row in Sheet and two in Flow, a strip some surfaces have,
 * and a withheld-gesture note that may be open or closed. A constant would be wrong on
 * the first surface that differs, and silently (research.md R2).
 */

/**
 * The largest scale at which `graphW × graphH` fits inside `viewportW × viewportH`.
 *
 * - Never above `1`. A window larger than the graph does not magnify it: 100 % is what
 *   the drawing was drawn at, and the phone's range is *fit to 1*, not *fit to fit*.
 * - Floored to two decimals, so the readout says a stable `42%` rather than flickering
 *   between 41 and 42 as a scrollbar appears — but **never below `0.01`**, because that
 *   floor would otherwise return `0` for a viewport under ~8 px tall, and a zoom of zero
 *   is `scale(0)`, a content box of nothing, and `NaN` scroll offsets out of the pinch
 *   handler. The whole reason the *unmeasured* case is `null` rather than `0` (R3) is to
 *   keep zero out of this value; letting rounding put it back would be the same bug by
 *   the other door.
 * - Returns `1` for a viewport that has not been laid out yet — the first frame measures
 *   `0 × 0`, and `0/820` would open the canvas at a scale of nothing.
 */
export function fitScale(viewportW: number, viewportH: number, graphW: number, graphH: number): number {
  if (!(viewportW > 0) || !(viewportH > 0) || !(graphW > 0) || !(graphH > 0)) return 1
  const raw = Math.min(viewportW / graphW, viewportH / graphH)
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return Math.min(1, Math.max(0.01, Math.floor(raw * 100) / 100))
}
