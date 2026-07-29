import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useInfoNote } from '../../hooks/useInfoNote'
import { InfoPanel, InfoToggle } from './InfoNote'

/**
 * An explanation you can put away (Slice 35 field test).
 *
 * The drawers had grown a paragraph each at the foot — correct, unread after the first
 * time, and on a phone a fifth of the screen. The sentence keeps its place and gains a
 * lid; what must not happen is that it is *deleted*, because `patterns.md` §7g requires
 * the reason a gesture is withheld to stay readable.
 */
function Note({ open, children }: { open: boolean; children?: React.ReactNode }) {
  const note = { open, toggle: () => {} }
  return (
    <div>
      <span>
        Universes
        <InfoToggle note={note} />
      </span>
      <InfoPanel note={note}>{children}</InfoPanel>
    </div>
  )
}

describe('InfoNote', () => {
  it('a closed note is one target and nothing else — no row, no words', () => {
    const markup = renderToStaticMarkup(<Note open={false}>Auto-assign repacks each universe.</Note>)
    expect(markup).toContain('aria-label="What is this?"')
    expect(markup).not.toContain('Auto-assign repacks')
  })

  it('the toggle sits inside the line it is beside, so it costs that row no height', () => {
    const markup = renderToStaticMarkup(<Note open={false} />)
    // Negative margin against its own padding: a 44px target that occupies a 16px icon.
    expect(markup).toContain('-m-2.5')
    expect(markup).toContain('p-2.5')
    expect(markup).not.toContain('h-8 w-8')
  })

  it('says its piece when open, and the toggle says so', () => {
    const markup = renderToStaticMarkup(<Note open>Auto-assign repacks each universe.</Note>)
    expect(markup).toContain('Auto-assign repacks each universe.')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('aria-label="Hide the explanation"')
  })

  it('renders without a window — the test method has none, and so does the server', () => {
    // `localStorage` reached during render is how a component becomes unrenderable here.
    function Probe() {
      const note = useInfoNote({ id: 'plot-desk-job', defaultOpen: true })
      return <InfoPanel note={note}>x</InfoPanel>
    }
    expect(() => renderToStaticMarkup(<Probe />)).not.toThrow()
  })
})
