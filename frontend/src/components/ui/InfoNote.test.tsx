import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InfoNote } from './InfoNote'

/**
 * An explanation you can put away (Slice 35 field test).
 *
 * The drawers had grown a paragraph each at the foot — correct, unread after the first
 * time, and on a phone a fifth of the screen. The sentence keeps its place and gains a
 * lid; what must not happen is that it is *deleted*, because `patterns.md` §7g requires
 * the reason a gesture is withheld to stay readable.
 */
describe('InfoNote', () => {
  it('is one target when closed, and says nothing else', () => {
    const markup = renderToStaticMarkup(<InfoNote>Auto-assign repacks each universe.</InfoNote>)
    expect(markup).toContain('aria-label="What is this?"')
    expect(markup).not.toContain('Auto-assign repacks')
  })

  it('says its piece when open, and can be put away again', () => {
    const markup = renderToStaticMarkup(<InfoNote defaultOpen>Auto-assign repacks each universe.</InfoNote>)
    expect(markup).toContain('Auto-assign repacks each universe.')
    expect(markup).toContain('aria-label="Hide this"')
  })

  it('the control that gets pressed is 44px on a phone', () => {
    const markup = renderToStaticMarkup(<InfoNote defaultOpen>x</InfoNote>)
    expect(markup).toContain('h-11 w-11')
  })

  it('renders without a window — the test method has none, and so does the server', () => {
    // `localStorage` reached during render is how a component becomes unrenderable here.
    expect(() => renderToStaticMarkup(<InfoNote id="plot-desk-job">x</InfoNote>)).not.toThrow()
  })
})
