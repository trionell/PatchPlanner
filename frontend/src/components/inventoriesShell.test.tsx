import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { InventoriesPage } from '../pages/Inventories'

/**
 * The inventory list scrolls (Slice 35 field test).
 *
 * The shell's rule is that the panel fills the body and only its rows move, and that
 * needs an unbroken column of flex items from `Layout`'s `main` down to the panel.
 * `Tabs` and `TabPanel` are blocks, so this page broke the chain: the panel had no
 * definite height to fill, grew to its content, and was clipped by the shell's
 * `overflow-hidden` with no scrollbar anywhere.
 *
 * It is the one page that reaches a panel through a wrapper, which is why it was the one
 * page that did not scroll — and why the assertion is on the *chain* rather than on this
 * page's own markup.
 */

const setWidth = (mobile: boolean) => {
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

function render(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inventories']}>
        <InventoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Inventories · the chain to the panel', () => {
  it('every wrapper between the shell and the panel is a column on a phone', () => {
    setWidth(true)
    const markup = render()
    const panel = markup.indexOf('rounded-xl border border-zinc-700')
    expect(panel).toBeGreaterThan(-1)
    // Both wrappers — `Tabs` and the active `TabPanel` — before the panel itself.
    const before = markup.slice(0, panel)
    expect(before.match(/flex min-h-0 flex-1 flex-col/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('and the panel is still the only thing that scrolls', () => {
    setWidth(true)
    expect(render().match(/overflow-y-auto/g)).toHaveLength(1)
  })

  it('the desktop keeps its stacked spacing', () => {
    setWidth(false)
    const markup = render()
    expect(markup).toContain('space-y-4')
    expect(markup).not.toContain('flex min-h-0 flex-1 flex-col')
  })
})
