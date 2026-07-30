import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { InventoryCategory, InventoryItem } from '../../types'
import { EventInventoryBrowser } from './EventInventoryBrowser'

/**
 * The event's read-only catalog browse (ROADMAP D4).
 *
 * It was the last consumer of `ui/Table` in the application, and the reason it kept
 * it for nine slices is that the count Wave 4 reported — *navigation-tier tables ·
 * 4 → 0* — was taken across the four event tabs, and this is an overlay opened
 * *from* one of them. So what these tests pin is the **tier**, at both widths: an
 * absence nobody can see is what let this drift, and a grep is what would have
 * caught it.
 */

const setWidth = (mobile: boolean) => {
  // No DOM in this project's tests, so `useIsMobile`'s query is answered directly.
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const categories: InventoryCategory[] = [
  { id: 1, name: 'Microphones', category_type: 'audio', item_count: 2 },
  { id: 2, name: 'Movers', category_type: 'lighting', item_count: 7 },
]

const items: InventoryItem[] = [
  {
    id: 10,
    category_id: 1,
    category_name: 'Microphones',
    name: 'Beta 91A',
    description: 'Boundary kick mic',
    quantity_available: 4,
    price_ex_vat: 120,
    discontinued: false,
  },
  {
    id: 11,
    category_id: 1,
    category_name: 'Microphones',
    name: 'e906',
    quantity_available: 6,
    price_ex_vat: 95.5,
    discontinued: false,
  },
]

function render({ loaded = true }: { loaded?: boolean } = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (loaded) {
    client.setQueryData(['inventory-categories', 1], categories)
    client.setQueryData(['inventory-items', 1, undefined], items)
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EventInventoryBrowser eventId={1} />
    </QueryClientProvider>,
  )
}

describe('the catalog browse · the desk', () => {
  it('is the work surface the same data is on one page over', () => {
    setWidth(false)
    const markup = render()

    // `SheetHeadCell`'s mono micro-label, which is what a work-surface heading is.
    expect(markup).toContain('font-mono text-[10px] uppercase')
    /*
      `ui/Table`'s own heading and cell padding, which is what this used to render.
      The component is deleted, so nothing can import them back — these two guard
      the other route, which is the one that put them here in the first place:
      writing the classes out by hand.
    */
    expect(markup).not.toContain('px-3 py-3 text-left font-medium text-zinc-400')
    expect(markup).not.toContain('px-3 py-3 align-top text-zinc-100')
  })

  it('filters with `ui/PanelRail`, not with a copy of `Tab`', () => {
    setWidth(false)
    const markup = render()

    expect(markup).toContain('w-56 shrink-0')
    expect(markup).toContain('All items')
    // The selected rail row is a tint, never `Tab`'s border-and-fill copied by hand.
    expect(markup).not.toContain('border-amber-500 bg-amber-500/10 text-amber-300')
  })

  it('takes no height of its own — the drawer holding it owns the scroll', () => {
    setWidth(false)
    expect(render()).not.toContain('vh]')
  })
})

describe('the catalog browse · the phone', () => {
  it('ranks the columns into rows rather than scrolling a table sideways', () => {
    setWidth(true)
    const markup = render()

    expect(markup).not.toContain('<table')
    expect(markup).toContain('min-h-[44px]')
    expect(markup).toContain('Beta 91A')
    // This sheet's other three columns, ranked (patterns.md §7c).
    expect(markup).toContain('Boundary kick mic · Qty 4 · 120.00 kr')
    /*
      A missing description drops out. It must **not** fall back to the category:
      this sheet has no Category column — the rail beside it is the category — so
      substituting one would make the two reaches of one surface disagree.
    */
    expect(markup).toContain('Qty 6 · 95.50 kr')
    expect(markup).not.toContain('Microphones · Qty 6')
  })

  it('turns the rail into the control that names the category on screen', () => {
    setWidth(true)
    const markup = render()

    expect(markup).toContain('aria-label="Filter by category"')
    expect(markup).toContain('All categories')
    // `title`, not `field`: the capped variant would truncate the one thing it says.
    expect(markup).not.toContain('max-w-[7rem]')
  })

  it('adds no second scroll container inside the sheet', () => {
    setWidth(true)
    const markup = render()

    expect(markup).not.toContain('vh]')
    expect(markup).not.toContain('overflow-x-auto')
  })
})

/**
 * `ui/Drawer` renders nothing until it is open, so this component mounts *as* the
 * drawer opens and both queries are cold on the first browse of every session. An
 * empty catalog and an unfetched one look identical, and only one of them is a fact.
 */
describe('the catalog browse · before the fetch answers', () => {
  it('does not call a full catalog empty, at either reach', () => {
    setWidth(false)
    const desk = render({ loaded: false })
    expect(desk).toContain('Loading catalog…')
    expect(desk).not.toContain('Nothing in this catalog yet.')

    setWidth(true)
    const phone = render({ loaded: false })
    expect(phone).toContain('Loading catalog…')
    expect(phone).not.toContain('Nothing in this catalog yet.')
  })

  it('still says so once the answer is that there is nothing', () => {
    setWidth(false)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['inventory-categories', 1], [])
    client.setQueryData(['inventory-items', 1, undefined], [])
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <EventInventoryBrowser eventId={1} />
      </QueryClientProvider>,
    )

    // Both the rail's and the sheet's — an empty catalog has neither half.
    expect(markup.match(/Nothing in this catalog yet\./g)).toHaveLength(2)
    expect(markup).not.toContain('Loading catalog…')
  })
})
