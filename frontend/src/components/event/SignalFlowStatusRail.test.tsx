import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SignalFlowStatusRail } from './SignalFlowStatusRail'

/**
 * The fifth status rail (Wave 6c, audit.md F1).
 *
 * 6b converted four rails into the shared `StatusStrip` shell and wrote *four* into two
 * design documents. This one hand-built the same tinted `border-t` div — the same base
 * classes, the same two tints, its own copy of the deliberately-below-`xs` control — and
 * was missed because it is the one rail whose surface was not among 6b's nine lists.
 *
 * Joining the shell fixed a latent bug that was invisible until it bit: the hand-built
 * version hid its control the moment the last gap was fixed, so a user who had filtered
 * to the gaps and then fixed the last one was left looking at an empty list with no way
 * back. That is 6b's own rule — *a filter has to outlive the condition it filtered on* —
 * and it is the first thing pinned below.
 */

const setWidth = (mobile: boolean) => {
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

function render(gaps: number, filter: 'gaps' | null): string {
  return renderToStaticMarkup(
    <SignalFlowStatusRail
      filter={filter}
      firstGap={gaps > 0 ? 'ch 9 Bass DI has no source' : undefined}
      gaps={gaps}
      hops={42}
      inputs={16}
      onFilterChange={() => {}}
      outputs={8}
    />,
  )
}

describe('SignalFlowStatusRail', () => {
  it('a filter outlives the condition it filtered on', () => {
    setWidth(false)
    // The last gap has just been fixed while the filter is on. Without a way back the
    // list is filtered to nothing and the control is gone.
    expect(render(0, 'gaps')).toContain('Show all')
  })

  it('is a sentence, not a control, when there is nothing to filter to', () => {
    setWidth(false)
    const markup = render(0, null)
    expect(markup).toContain('all routed')
    expect(markup).not.toContain('Show')
  })

  it('on a phone the strip itself is the control', () => {
    setWidth(true)
    const markup = render(3, null)
    // The root is the button, full width at 44px — the desktop's `h-6` control is a
    // 24px target in the hand (patterns.md §7b).
    expect(markup.startsWith('<button')).toBe(true)
    expect(markup).toContain('min-h-[44px]')
    expect(markup).toContain('w-full')
  })

  it('and a phone strip with nothing to filter to is not a button', () => {
    setWidth(true)
    expect(render(0, null).startsWith('<button')).toBe(false)
  })

  it('says the same words at both widths — P9', () => {
    setWidth(false)
    const desk = render(3, null)
    setWidth(true)
    const hand = render(3, null)
    for (const said of ['3 gaps', '16 inputs', '8 outputs', '42 hops', 'ch 9 Bass DI has no source']) {
      expect(desk).toContain(said)
      expect(hand).toContain(said)
    }
  })

  it('never prints — a strip is chrome, and this one sits inside PrintSheet', () => {
    setWidth(false)
    expect(render(3, null)).toContain('print:hidden')
  })
})
