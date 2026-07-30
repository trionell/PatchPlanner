import { describe, expect, it } from 'vitest'
import { fitScale } from './canvasFit'

/**
 * The four cases that are invisible in a render test, and one of them — the first
 * frame — is the one that would ship.
 */
describe('fitScale', () => {
  it('is the tighter of the two axes', () => {
    // 341 / 820 = 0.415…, 300 / 640 = 0.468… — width binds.
    expect(fitScale(341, 300, 820, 640)).toBe(0.41)
    // A tall, narrow window: height binds instead.
    expect(fitScale(600, 128, 820, 640)).toBe(0.2)
  })

  it('never magnifies', () => {
    // 100% is what the drawing was drawn at. The phone's range is fit → 1, not fit → fit.
    expect(fitScale(2000, 2000, 820, 640)).toBe(1)
    expect(fitScale(820, 640, 820, 640)).toBe(1)
  })

  it('survives the first frame, before anything has been laid out', () => {
    // A `ResizeObserver` reports 0 x 0 before layout. 0/820 would open the canvas at a
    // scale of nothing, and 820/0 is Infinity.
    expect(fitScale(0, 0, 820, 640)).toBe(1)
    expect(fitScale(341, 0, 820, 640)).toBe(1)
    expect(fitScale(341, 300, 0, 0)).toBe(1)
  })

  it('floors to two decimals, so the readout does not flicker', () => {
    // 0.4158… must not round *up* to 0.42 — the graph would be one pixel wider than the
    // window, which is exactly the state fit exists to avoid.
    expect(fitScale(341, 1000, 820, 640)).toBe(0.41)
    expect(fitScale(345, 1000, 820, 640)).toBe(0.42)
  })

  it('never returns zero, however small the window gets', () => {
    // 6/640 = 0.009…, which the two-decimal floor rounds to **0** — and a zoom of zero
    // is `scale(0)`, a content box of nothing, and NaN scroll offsets out of the pinch
    // handler. Keeping zero out of this value is the whole reason the *unmeasured* case
    // is `null` rather than `0`; rounding must not put it back.
    expect(fitScale(341, 6, 820, 640)).toBe(0.01)
    expect(fitScale(4, 300, 820, 640)).toBe(0.01)
    expect(fitScale(341, 6, 820, 640)).toBeGreaterThan(0)
  })

  it('rejects nonsense rather than propagating it', () => {
    expect(fitScale(-10, 300, 820, 640)).toBe(1)
    expect(fitScale(Number.NaN, 300, 820, 640)).toBe(1)
  })
})
