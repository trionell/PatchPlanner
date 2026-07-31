import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlotTruss } from '../../types'
import { PlotTrussManager } from './PlotTrussManager'

/**
 * The Trusses overlay (Slice 39).
 *
 * What is worth pinning is **presence**, which is the one thing
 * `renderToStaticMarkup` can see and the one thing this slice put at risk. The
 * read view is not the edit view with its inputs disabled — it renders different
 * nodes — so the way that promise breaks is a control appearing in a surface that
 * must have none, or a *value* disappearing from a surface whose whole job is to
 * show values.
 *
 * `disabled` is asserted against directly. It left this file in this slice, and a
 * greyed-out control is exactly the shape that creeps back the next time someone
 * needs a read view in a hurry.
 */

const setWidth = (mobile: boolean) => {
  // No DOM in this project's tests, so `useIsMobile`'s query is answered directly.
  // `localStorage` comes with it because the drawer carries an `info` note, and
  // `useInfoNote` reads the remembered choice off `window` during render.
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: mobile }),
    localStorage: { getItem: () => null, setItem: () => {} },
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const FRONT: PlotTruss = {
  id: 1,
  event_id: 7,
  name: 'Front truss',
  height_cm: 620,
  total_length_cm: 800,
  pieces: [
    { id: 11, truss_id: 1, inventory_item_id: 3, item_name: 'Prolyte H30V 300', length_cm: 300, sort_order: 0 },
    { id: 12, truss_id: 1, inventory_item_id: 3, item_name: 'Prolyte H30V 300', length_cm: 300, sort_order: 1 },
    { id: 13, truss_id: 1, label: 'Ladder 1 m', length_cm: 200, sort_order: 2 },
  ],
  fixtures: [
    {
      id: 21,
      truss_id: 1,
      fixture_id: 91,
      offset_cm: 100,
      side: 'top',
      fixture_number: 12,
      fixture_name: 'Robe Spiikie',
      dmx_universe: 1,
      dmx_start_address: 1,
    },
    {
      id: 22,
      truss_id: 1,
      side: 'middle',
      fixture_id: 92,
      fixture_number: 13,
      fixture_name: 'Martin MAC Aura',
      dmx_universe: 1,
      dmx_start_address: 20,
    },
  ],
}

function render({ readOnly, touch }: { readOnly: boolean; touch: boolean }): string {
  setWidth(touch)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <PlotTrussManager
        closingNote="a closing sentence"
        eventId={7}
        onChanged={() => {}}
        onClose={() => {}}
        onPlace={() => {}}
        onRotate={() => {}}
        open
        placedElements={new Map([[1, { id: 5, rotation_deg: 0, tilt_deg: 8 }]])}
        placedTrussIds={new Set([1])}
        readOnly={readOnly}
        touch={touch}
        trusses={[FRONT]}
      />
    </QueryClientProvider>,
  )
}

describe('PlotTrussManager · the read view (FR-011)', () => {
  const markup = () => render({ readOnly: true, touch: true })

  it('offers nothing to press and nothing to type in', () => {
    const html = markup()
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('Add piece')
    expect(html).not.toContain('Attach')
    expect(html).not.toContain('Place on this plot')
    expect(html).not.toContain('New truss name')
  })

  it('never expresses read-only as a disabled control', () => {
    expect(markup()).not.toContain('disabled')
  })

  it('states every value the canvas cannot draw (FR-010)', () => {
    const html = markup()
    expect(html).toContain('Front truss')
    expect(html).toContain('620 cm') // hang height
    expect(html).toContain('800 cm') // total length
    expect(html).toContain('8°') // rake, from the placement
    expect(html).toContain('On this plot')
    expect(html).toContain('Prolyte H30V 300')
    expect(html).toContain('300 cm')
    expect(html).toContain('Robe Spiikie')
    expect(html).toContain('100 cm') // the fixture's offset
    expect(html).toContain('top lane')
  })

  it('says so where a fixture has no offset rather than drawing an empty box', () => {
    expect(markup()).toContain('no offset')
  })

  it('states the legacy piece as a consequence, not as a hover (FR-022, FR-023)', () => {
    const html = markup()
    expect(html).toContain('not on the rental order')
    expect(html).not.toContain('(legacy)')
    expect(html).not.toContain('title=')
    // The fix needs the catalog, which is a desk job — so the phone is not sent on it.
    expect(html).not.toContain('re-pick it from the catalog')
  })
})

describe('PlotTrussManager · the edit view', () => {
  const markup = () => render({ readOnly: false, touch: false })

  it('carries the pickers and both forms', () => {
    const html = markup()
    expect(html).toContain('<input')
    expect(html).toContain('<select')
    expect(html).toContain('Add piece')
    expect(html).toContain('Attach')
    expect(html).toContain('New truss name')
  })

  /*
    `disabled` still appears in the edit view, on the three submits whose forms are
    empty — a button with nothing to submit. That is a *form-completeness* gate and
    always was. What left this file is `disabled` standing for **read-only**, which
    is what SC-004 is about, so the strict assertion belongs to the read view above
    and this one names the shape it replaced: a truss already on the plot used to be
    a greyed-out button reading "On plot".
  */
  it('states that a placed truss is placed instead of disabling a button that says so (FR-012)', () => {
    const html = markup()
    expect(html).toContain('On this plot')
    expect(html).not.toContain('On plot')
    // No *field* is greyed out: read-only is a different render, not this one dimmed.
    expect(html).not.toContain('tabular-nums" disabled')
    expect(html).not.toContain('text-xs" disabled')
  })

  it('names both destructive controls (FR-020)', () => {
    const html = markup()
    expect(html).toContain('Delete truss Front truss')
    expect(html).toContain('Remove piece Prolyte H30V 300 from Front truss')
    expect(html).toContain('Detach Robe Spiikie (it stays in the rig)')
  })

  it('spells rotation and rake as the plot does (approved Q3)', () => {
    const html = markup()
    expect(html).toContain('Rake')
    expect(html).not.toContain('Rotation (top)')
    expect(html).not.toContain('Rotation (front)')
  })

  it('offers the legacy piece its fix, which is a desk job', () => {
    expect(markup()).toContain('re-pick it from the catalog')
  })
})
