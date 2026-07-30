import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Drawer } from './Drawer'

/**
 * `flush` — the drawer's body giving up its padding and the gap between its
 * sections (ROADMAP D4).
 *
 * There is no `window` here, so `useIsMobile` is false and this is the desktop
 * shell, which is the reach where the class string is the whole of the behaviour.
 * The phone half is one forwarded prop into `ui/Sheet`, which has its own tests.
 *
 * What is worth pinning is that the **default did not move**: five other drawers
 * render this component and none of them passed anything, so a body that quietly
 * lost its `px-5 py-4` would be five surfaces regressed by a sixth's requirement.
 */
const body = 'px-5 py-4'

function render(flush: boolean): string {
  return renderToStaticMarkup(
    <Drawer flush={flush} onClose={() => {}} open title="Nordic AV">
      <p>a catalog</p>
    </Drawer>,
  )
}

describe('ui/Drawer · flush', () => {
  it('leaves the padded body alone by default', () => {
    // Twice: the header keeps its own `px-5 py-4` whatever the body does.
    expect(render(false).match(new RegExp(body, 'g'))).toHaveLength(2)
    expect(render(false)).toContain('flex flex-col gap-5')
  })

  it('drops the inset and the gap when the contents are one construction', () => {
    const markup = render(true)

    expect(markup.match(new RegExp(body, 'g'))).toHaveLength(1)
    expect(markup).not.toContain('flex flex-col gap-5')
    // And nothing else moves: the body is still the drawer's one scroll.
    expect(markup).toContain('flex-1 overflow-y-auto')
    expect(markup).toContain('a catalog')
  })
})
