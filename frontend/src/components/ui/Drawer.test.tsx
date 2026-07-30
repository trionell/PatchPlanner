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

/**
 * `noteId` — the info note's identity (ROADMAP D5).
 *
 * The defect was two drawers both titled *Pricing* sharing one remembered
 * choice, and it was invisible at both call sites: nothing in either file
 * mentioned a key. What replaces that is a type, so the check that matters here
 * is a **compile-time** one — these `@ts-expect-error`s fail `tsc -b` if either
 * direction of the rule stops being an error, which is the only way the next
 * drawer gets caught before it ships.
 *
 * The remembering itself is not tested and cannot be: this file renders with no
 * `window`, so `useInfoNote` returns its default and never reaches
 * `localStorage`. That walk is in the slice's acceptance criteria instead.
 */
describe('ui/Drawer · noteId', () => {
  it('will not compile an explanation nothing remembers', () => {
    renderToStaticMarkup(
      // @ts-expect-error `info` without `noteId` — the note would have no identity
      <Drawer
        info={<>what this drawer does</>}
        onClose={() => {}}
        open
        title="Pricing"
      >
        <p>a sheet</p>
      </Drawer>,
    )
  })

  it('will not compile an identity with nothing to remember', () => {
    renderToStaticMarkup(
      // @ts-expect-error `noteId` without `info` — nothing to put away, so nothing to key
      <Drawer
        noteId="event-pricing"
        onClose={() => {}}
        open
        title="Pricing"
      >
        <p>a sheet</p>
      </Drawer>,
    )
  })

  it('draws one `i`, closed, when it has both', () => {
    const markup = renderToStaticMarkup(
      <Drawer info={<>what this drawer does</>} noteId="event-pricing" onClose={() => {}} open title="Pricing">
        <p>a sheet</p>
      </Drawer>,
    )

    // One toggle, not one per width: the phone branch is the other side of an `if`.
    expect(markup.match(/aria-label="What is this\?"/g)).toHaveLength(1)
    // And closed, which is what an unremembered note is — the sentence is put away
    // until it is asked for, and D5 was that state being lost to another drawer's key.
    expect(markup).not.toContain('what this drawer does')
    expect(markup).toContain('a sheet')
  })
})

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
