import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ZoomControl } from './ZoomControl'

/**
 * One control, two reaches (Slice 36 R8).
 *
 * The desktop half of this is asserted by diffing the rendered markup against a capture
 * taken before the change (quickstart.md, *three byte-identical checks*). What is worth
 * a standing test is the pair of invariants a later edit could break without noticing:
 * the phone's targets are 44 px, and `resetLabel` never leaks onto a desk.
 */

/**
 * `useIsMobile` reads `window.matchMedia` in its state initialiser and nothing else on
 * first render, so a two-line stub is the whole of what a phone render needs. Tests run
 * without a DOM (constitution), which is why this is a stub rather than a viewport.
 */
function asPhone(matches: boolean) {
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const noop = () => {}

describe('ZoomControl', () => {
  it('is 28 px on a desk, where a cursor aims', () => {
    const markup = renderToStaticMarkup(<ZoomControl zoom={1} onZoomChange={noop} />)
    expect(markup).toContain('w-7')
    expect(markup).not.toContain('h-11')
  })

  it('is 44 px in a hand, on all three targets', () => {
    asPhone(true)
    const markup = renderToStaticMarkup(<ZoomControl zoom={0.42} onZoomIn={noop} onZoomOut={noop} onReset={noop} />)
    // Two steppers at h-11 w-11, and the readout at h-11 — a control below 44 px is a
    // suggestion (tokens.md §7, amendment 1).
    expect(markup.match(/h-11 w-11/g)).toHaveLength(2)
    expect(markup.match(/h-11/g)).toHaveLength(3)
    expect(markup).not.toContain('w-7')
  })

  it('names its reset target in a hand, and never on a desk', () => {
    asPhone(true)
    expect(renderToStaticMarkup(<ZoomControl zoom={0.42} onReset={noop} resetLabel="fit" />)).toContain('fit')

    // The same prop on a desk: a percentage that resets to 100 % needs no caption, and a
    // caption there would be a second vocabulary for the same control.
    delete (globalThis as { window?: unknown }).window
    expect(renderToStaticMarkup(<ZoomControl zoom={1} onReset={noop} resetLabel="fit" />)).not.toContain('fit')
  })

  it('rounds the readout the same way at both reaches', () => {
    expect(renderToStaticMarkup(<ZoomControl zoom={0.415} onZoomChange={noop} />)).toContain('42%')
    asPhone(true)
    expect(renderToStaticMarkup(<ZoomControl zoom={0.415} onZoomChange={noop} />)).toContain('42%')
  })

  it('keeps the reset target reachable when the caller owns the stepping', () => {
    // The stage plot and the flow canvases step differently and both must still reset —
    // the split `Legend` already uses: the component owns the look, the caller the steps.
    asPhone(true)
    const markup = renderToStaticMarkup(<ZoomControl zoom={1} onZoomIn={noop} onZoomOut={noop} onReset={noop} />)
    expect(markup).toContain('aria-label="Reset zoom"')
    expect(markup).toContain('aria-label="Zoom in"')
    expect(markup).toContain('aria-label="Zoom out"')
  })
})
