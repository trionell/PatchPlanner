import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Sheet } from './Sheet'

/**
 * The sheet's structure, pinned.
 *
 * The spec first claimed a shell has nothing to test. That is wrong in the way
 * `OverviewBands.test.tsx` is the counter-example to: what this component must
 * get right is **what is a sibling of what**, and that is invisible in a
 * screenshot and plain in the element order.
 *
 * The one that matters most is S1. A footer nested inside the scrolling body
 * scrolls away with it, which is half of audit.md M8 — the confirm you cannot
 * reach. Nothing about the rendered appearance would tell you which one you
 * had built.
 *
 * Tests run without a DOM here, so these read the markup.
 */

const body = <p>fields</p>
const footer = <button type="button">Save channel</button>

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

/** The markup of the element carrying `needle`, up to the end of its class attribute. */
function classesOf(markup: string, needle: string): string {
  const match = markup.match(new RegExp(`class="([^"]*${needle}[^"]*)"`))
  return match?.[1] ?? ''
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    // S8 — the contract Drawer and Dialog already keep.
    expect(render(<Sheet open={false} onClose={() => {}} title="Channel 12">{body}</Sheet>)).toBe('')
  })

  it('puts the footer outside the scrolling body, not inside it', () => {
    // S1. A nested footer scrolls away with the fields, and the confirm becomes
    // unreachable on exactly the form that needs it — which is the finding.
    const markup = render(
      <Sheet open onClose={() => {}} title="Channel 12" footer={footer}>
        {body}
      </Sheet>,
    )
    const scroller = markup.indexOf('overflow-y-auto')
    const scrollerEnd = markup.indexOf('</div>', markup.indexOf('fields'))
    const footerIndex = markup.indexOf('Save channel')

    expect(scroller).toBeGreaterThan(-1)
    expect(footerIndex).toBeGreaterThan(scrollerEnd)
  })

  it('gives exactly one element an internal scroll', () => {
    // S2. Two scroll containers in one overlay is patterns.md §3's
    // no-section-takes-a-height rule broken by another route.
    const markup = render(
      <Sheet open onClose={() => {}} title="Rig" footer={<span>6 items</span>}>
        {body}
      </Sheet>,
    )
    expect(markup.match(/overflow-y-auto/g)).toHaveLength(1)
  })

  it('emits no backdrop at all when the scrim is withheld', () => {
    // S3. Setting the backdrop transparent would satisfy the sentence and miss
    // the point: a transparent full-screen element still swallows every touch,
    // so the canvas behind it would be frozen.
    const withScrim = render(<Sheet open onClose={() => {}} title="Source">{body}</Sheet>)
    const without = render(<Sheet open onClose={() => {}} title="Source" scrim={false}>{body}</Sheet>)

    expect(withScrim).toContain('bg-zinc-950/80')
    expect(withScrim).toContain('touch-none')
    expect(without).not.toContain('bg-zinc-950/80')
    expect(without).not.toContain('touch-none')
    expect(without).toContain('pointer-events-none')
    expect(without).toContain('pointer-events-auto')
  })

  it('reports modality as a fact rather than a formality', () => {
    // S4. With no backdrop the sheet genuinely is not modal, and claiming
    // otherwise misdescribes it to assistive technology.
    expect(render(<Sheet open onClose={() => {}} title="Source">{body}</Sheet>)).toContain('aria-modal="true"')
    expect(
      render(<Sheet open onClose={() => {}} title="Source" scrim={false}>{body}</Sheet>),
    ).toContain('aria-modal="false"')
  })

  it('rounds the two corners it has', () => {
    // S5. It is anchored to an edge, so it has two corners (tokens.md §7).
    const panel = classesOf(render(<Sheet open onClose={() => {}} title="More">{body}</Sheet>), 'max-h-')
    expect(panel).toContain('rounded-t-xl')
    expect(panel).not.toMatch(/\brounded-xl\b/)
    expect(panel).toContain('max-h-[85svh]')
  })

  it('flush removes the body padding and nothing else', () => {
    // S6.
    const padded = render(
      <Sheet open onClose={() => {}} title="Sections" footer={footer}>{body}</Sheet>,
    )
    const flush = render(
      <Sheet open onClose={() => {}} title="Sections" footer={footer} flush>{body}</Sheet>,
    )

    expect(classesOf(padded, 'overflow-y-auto')).toContain('px-4 py-4')
    expect(classesOf(flush, 'overflow-y-auto')).not.toContain('px-4 py-4')
    // header and footer keep theirs
    expect(classesOf(flush, 'border-b border-zinc-800')).toContain('px-4 py-3.5')
    expect(classesOf(flush, 'border-t border-zinc-800')).toContain('px-4 py-3')
  })

  it('adds the safe-area inset to the footer padding rather than absorbing it', () => {
    // S7. `pb-[env(...)]` alone would replace the 0.75rem the footer already
    // needs, so on a device with no inset the confirm loses its padding and on
    // one with an inset it never had any of its own.
    const markup = render(
      <Sheet open onClose={() => {}} title="Channel 12" footer={footer}>{body}</Sheet>,
    )
    expect(classesOf(markup, 'border-t border-zinc-800')).toContain(
      'pb-[calc(env(safe-area-inset-bottom)+0.75rem)]',
    )
  })

  it('names itself from the title, whatever the title is made of', () => {
    // The inspector passes a MicroLabel and a Pill rather than a string, which
    // is why the name is `aria-labelledby` and not `aria-label`.
    const markup = render(
      <Sheet open onClose={() => {}} title={<><span>Source</span><span>MIC</span></>}>{body}</Sheet>,
    )
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1]
    expect(labelledBy).toBeTruthy()
    expect(markup).toContain(`id="${labelledBy}"`)
  })

  it('renders no footer element when given none', () => {
    // The inspector's case: it commits per field and has nothing to confirm.
    const markup = render(<Sheet open onClose={() => {}} title="Source" scrim={false}>{body}</Sheet>)
    expect(markup).not.toContain('border-t border-zinc-800')
  })
})
