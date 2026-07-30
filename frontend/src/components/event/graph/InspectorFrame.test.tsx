import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InspectorFrame } from './InspectorFrame'

/**
 * The frame's two returns (Slice 36 R7).
 *
 * The desktop half is guaranteed *by construction* — it renders `InspectorRail` and
 * `InspectorHeader` rather than reimplementing them — and asserted against a capture
 * taken before the change (quickstart.md). What is worth a standing test is the phone
 * half, where three things are load-bearing and all three are invisible in a screenshot:
 * there is **no backdrop element**, there is **no footer**, and the header carries what
 * the rail's header carried.
 */

function asPhone(matches: boolean) {
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const body = <p id="body">the rail&rsquo;s own fields</p>
const noop = () => {}

describe('InspectorFrame', () => {
  it('is the rail on a desk', () => {
    const markup = renderToStaticMarkup(<InspectorFrame heading="Source" onClose={noop}>{body}</InspectorFrame>)
    expect(markup).toContain('w-60 shrink-0 flex-col gap-2.5 border-l')
    expect(markup).toContain('aria-label="Close inspector"')
    expect(markup).toContain('the rail')
  })

  it('is a bottom sheet in a hand, and gives up the column', () => {
    asPhone(true)
    const markup = renderToStaticMarkup(<InspectorFrame heading="Source" onClose={noop}>{body}</InspectorFrame>)
    expect(markup).not.toContain('w-60')
    expect(markup).toContain('max-h-[85svh]')
    expect(markup).toContain('the rail')
  })

  it('renders no backdrop at all, so the canvas behind stays live', () => {
    // The point of `scrim={false}`, and the reason it is structural rather than
    // chromatic: a *transparent* full-screen layer would satisfy the sentence in
    // patterns.md §7f and lose its point, because it still swallows every touch and the
    // canvas the inspector is read against would be frozen.
    asPhone(true)
    const markup = renderToStaticMarkup(<InspectorFrame heading="Source" onClose={noop}>{body}</InspectorFrame>)
    expect(markup).not.toContain('bg-zinc-950/80')
    expect(markup).toContain('pointer-events-none')
    expect(markup).toContain('aria-modal="false"')
  })

  it('has no footer and no confirm, because the rail holds no draft', () => {
    // components.md §3: the rail commits per field at every width. A Save would imply a
    // draft that does not exist, which is the one thing a container must not invent.
    asPhone(true)
    const markup = renderToStaticMarkup(<InspectorFrame heading="Source" onClose={noop}>{body}</InspectorFrame>)
    expect(markup).not.toContain('border-t border-zinc-800 px-4 py-3')
    expect(markup).not.toContain('Save')
  })

  it('carries the heading and the pill into the sheet header at both widths', () => {
    const pill = <span id="pill">mic</span>
    for (const phone of [false, true]) {
      if (phone) asPhone(true)
      else delete (globalThis as { window?: unknown }).window
      const markup = renderToStaticMarkup(<InspectorFrame heading="Stagebox" onClose={noop} pill={pill}>{body}</InspectorFrame>)
      expect(markup).toContain('Stagebox')
      expect(markup).toContain('id="pill"')
      // The one label voice, at both widths (P3, tokens.md §7 amendment 2).
      expect(markup).toContain('tracking-[0.14em]')
    }
  })
})
