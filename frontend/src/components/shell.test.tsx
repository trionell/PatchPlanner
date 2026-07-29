import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { MobilePanel } from './ui/MobilePanel'
import { CondensedListRow } from './mobile/CondensedListRow'

/**
 * The phone shell is one fixed-height column (Wave 6c).
 *
 * Wave 6b built this and reverted it in the same slice, and the reason it survived a
 * whole slice is that **the defect is invisible until the content is tall**: three
 * surfaces were collapsing below their content and clipping with no scrollbar anywhere,
 * on a screen that looked fine with eight rows in it.
 *
 * So the assertion is on the *structure* rather than on a height this project's test
 * method cannot measure, and it has two halves, because the flex rule does:
 *
 * - a flex item whose own overflow is `visible` gets an automatic minimum size of its
 *   **content**, refuses to shrink, and pushes the column past the viewport;
 * - a flex item whose own overflow is not `visible` gets an automatic minimum size of
 *   **zero**, and may collapse — silently, when that overflow is `hidden`.
 *
 * 6b had the shrinking without the scrolling. Both are pinned below.
 */

const setWidth = (mobile: boolean) => {
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

/** A list far taller than any viewport — the condition that exposes the defect. */
const longList = (
  <MobilePanel strip={<div id="strip">3 gaps · 60 channels</div>} title="Audio Inputs">
    {Array.from({ length: 60 }, (_, index) => (
      <CondensedListRow key={index} subtitle="Beta 91A · SB1 in 1" title={`Channel ${index + 1}`} />
    ))}
  </MobilePanel>
)

function renderShell(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />} path="/">
            <Route element={longList} index />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the phone shell', () => {
  it('is a fixed-height column that does not itself scroll', () => {
    setWidth(true)
    const markup = renderShell()
    expect(markup).toContain('h-[100svh]')
    // `svh`, never `dvh`: `dvh` is live, so the column would resize under the thumb as
    // browser chrome collapses (tokens.md §7).
    expect(markup).not.toContain('dvh')
  })

  it('exactly one element scrolls, however tall the content is', () => {
    setWidth(true)
    const markup = renderShell()
    expect(markup.match(/overflow-y-auto|overflow-auto|overflow-y-scroll/g)).toHaveLength(1)
  })

  it('the thing that scrolls may also shrink — 6b had one without the other', () => {
    setWidth(true)
    expect(renderShell()).toContain('min-h-0 flex-1 overflow-y-auto')
  })

  it('the bar, the strip and the nav cannot absorb or yield space', () => {
    setWidth(true)
    const markup = renderShell()
    // header, panel bar and nav. The strip's own `flex-none` lives in `StatusStrip`'s
    // phone return and is asserted there — this shell renders a plain stand-in.
    expect(markup.match(/flex-none/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('the nav is a sibling in the column, so the body reserves nothing for it', () => {
    setWidth(true)
    const markup = renderShell()
    expect(markup).not.toContain('fixed inset-x-0 bottom-0')
    expect(markup).not.toContain('pb-[calc(3.5rem+env(safe-area-inset-bottom))]')
    // …and the inset is still added to the nav's own height, never absorbed (M10).
    expect(markup).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  it('leaves the desktop shell alone', () => {
    setWidth(false)
    const markup = renderShell()
    expect(markup).not.toContain('h-[100svh]')
    expect(markup).toContain('min-h-screen')
  })
})
