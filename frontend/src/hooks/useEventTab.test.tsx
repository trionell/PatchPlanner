import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { useEventTab, withSelection } from './useEventTab'

/**
 * A hand-off is a link at both widths (Slice 35 field test).
 *
 * The desktop selection is `?tab=`; the phone's is `?section=`, and it predates it. They
 * carry the same nine strings but nothing kept them in step, so every hand-off built
 * since Wave 3 changed the URL and left the phone showing what it already showed — *See
 * on rental order*, Overview's readiness rows, `onOpenPlot`. The worst kind of broken
 * link, because it looks like nothing happened.
 */
describe('useEventTab', () => {
  it('a hand-off sets both params, so the phone follows the desktop', () => {
    const next = withSelection(new URLSearchParams('tab=overview&section=overview'), 'rentals')
    expect(next.get('tab')).toBe('rentals')
    expect(next.get('section')).toBe('rentals')
  })

  it('keeps whatever else was in the URL', () => {
    const next = withSelection(new URLSearchParams('tab=overview&plot=3'), 'stage-plots')
    expect(next.get('plot')).toBe('3')
  })

  it('repairs a URL where only one of the two was set', () => {
    // The state every hand-off left behind before this fix.
    const next = withSelection(new URLSearchParams('section=overview'), 'equipment')
    expect(next.get('tab')).toBe('equipment')
    expect(next.get('section')).toBe('equipment')
  })

  it('reads the tab from the URL, defaulting to overview', () => {
    let seen = ''
    function Read() {
      seen = useEventTab().tab
      return null
    }
    renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/1?tab=signal-flow']}>
        <Read />
      </MemoryRouter>,
    )
    expect(seen).toBe('signal-flow')
  })
})
