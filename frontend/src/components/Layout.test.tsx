import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'

/**
 * Which event am I holding? (Wave 6c.)
 *
 * The phone's header is the one thing on screen in all nine sections that never
 * scrolls, so it carries the event's name. Two things about that are worth pinning and
 * neither is visible in a screenshot of a loaded page:
 *
 * - **The fallback.** A pending or failed event must show the page title, not an empty
 *   header and not a flash of `Event Detail` followed by a name.
 * - **The desktop is not a caller.** The same `title` feeds the desktop header, which
 *   already sits above an `h2` carrying the name. Putting it in both would be this
 *   slice changing a desktop composition, which it may not do.
 */

const setWidth = (mobile: boolean) => {
  // No DOM in this project's tests, so `useIsMobile`'s query is answered directly.
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

function render(path: string, seed?: { id: number; name: string }): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seed) client.setQueryData(['event', seed.id], { id: seed.id, name: seed.name })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />} path="/">
            <Route element={<p>section</p>} path="events/:id" />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Layout · the phone header names the event', () => {
  it('shows the event’s name in place of the route’s label', () => {
    setWidth(true)
    const markup = render('/events/7', { id: 7, name: 'Nordic Sound Festival' })
    expect(markup).toContain('Nordic Sound Festival')
    expect(markup).not.toContain('Event Detail')
  })

  it('falls back to the page title while the event is unknown', () => {
    setWidth(true)
    // No seeded cache entry: pending, and an error resolves the same way.
    expect(render('/events/7')).toContain('Event Detail')
  })

  it('truncates rather than wrapping, so the brand mark and avatar do not move', () => {
    setWidth(true)
    const markup = render('/events/7', { id: 7, name: 'A very long festival name indeed' })
    expect(markup).toContain('min-w-0 truncate text-sm font-semibold')
  })

  it('leaves the desktop header alone — it already has the name on the page below it', () => {
    setWidth(false)
    const markup = render('/events/7', { id: 7, name: 'Nordic Sound Festival' })
    expect(markup).toContain('Event Detail')
    expect(markup).not.toContain('Nordic Sound Festival')
  })
})
