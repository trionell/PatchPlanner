import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MobilePanel } from './MobilePanel'

/**
 * The panel's structure, pinned.
 *
 * Same reasoning as `Sheet.test.tsx`: what a frame must get right is **what is a
 * sibling of what**, which is invisible in a screenshot and plain in the element
 * order. P2 below is the one that matters: the strip is what *closes* the panel, so it
 * must not be part of what the panel contains — the same invariant `ui/Sheet`'s footer
 * has, one edge over, and invisible in a screenshot either way.
 *
 * Tests run without a DOM, so these read the markup. Nothing here asserts a height:
 * `renderToStaticMarkup` produces no layout, and the row arithmetic lives in
 * research.md R2 and quickstart.md row 2.
 */

const rows = <div id="rows">eight rows</div>
const strip = <div id="strip">3 gaps</div>

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

describe('MobilePanel', () => {
  it('P1 · draws one bordered frame, and the rows get no padding or gap of their own', () => {
    const markup = render(<MobilePanel title="Audio Inputs">{rows}</MobilePanel>)
    expect(markup.match(/rounded-xl border border-zinc-700/g)).toHaveLength(1)
    // The rows container is a bare `<div>`: no class at all, so it cannot be adding
    // padding, a gap, or a second scroll region inside the page's.
    expect(markup).toContain('<div><div id="rows">')
  })

  it('P2 · the strip is a sibling of the rows, never inside them', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" strip={strip}>
        {rows}
      </MobilePanel>,
    )
    // It is what closes the panel, so it cannot be part of what the panel contains:
    // the rows container must have closed before the strip appears.
    expect(markup).toContain('<div><div id="rows">eight rows</div></div><div id="strip">')
  })

  it('P6 · a role that cannot act gets no primary element at all, not a disabled one', () => {
    const markup = render(<MobilePanel title="Audio Inputs">{rows}</MobilePanel>)
    expect(markup).not.toContain('bg-amber-500')
    expect(markup).not.toContain('disabled')
  })

  it('the bar keeps §1 order: title, then the flexible gap, then the controls', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" onSearch={() => {}} primaryAction={<button id="add" type="button" />}>
        {rows}
      </MobilePanel>,
    )
    const title = markup.indexOf('Audio Inputs')
    const spacer = markup.indexOf('flex-1"')
    const search = markup.indexOf('aria-label="Search"')
    const add = markup.indexOf('id="add"')
    expect(title).toBeLessThan(spacer)
    expect(spacer).toBeLessThan(search)
    expect(search).toBeLessThan(add)
  })

  it('every bar control is a 44px target', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" onSearch={() => {}}>
        {rows}
      </MobilePanel>,
    )
    expect(markup).toContain('h-11 w-11')
    expect(markup).not.toContain('h-9')
  })

  it('renders no search control when the surface has nothing to filter', () => {
    const markup = render(<MobilePanel title="Your events">{rows}</MobilePanel>)
    expect(markup).not.toContain('aria-label="Search"')
  })

  it('the search field is absent until the target is used — the bar is one row at rest', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" onSearch={() => {}} searchPlaceholder="Find a channel…">
        {rows}
      </MobilePanel>,
    )
    expect(markup).toContain('aria-label="Search"')
    expect(markup).not.toContain('Find a channel…')
  })

  it('places actions between the flexible gap and the primary action', () => {
    const markup = render(
      <MobilePanel
        title="Items"
        actions={<button id="filter" type="button" />}
        primaryAction={<button id="add" type="button" />}
      >
        {rows}
      </MobilePanel>,
    )
    expect(markup.indexOf('id="filter"')).toBeLessThan(markup.indexOf('id="add"'))
  })

  it('a non-empty query always draws the row, however it arrived', () => {
    // The invariant is the component's, not its callers': four call sites share the
    // query with a desktop branch whose field is always open, so crossing 768 px with
    // `mic` typed used to hand this component a filter with the row shut.
    const markup = render(
      <MobilePanel title="Equipment" search="mic" onSearch={() => {}} searchPlaceholder="Find a line…">
        {rows}
      </MobilePanel>,
    )
    expect(markup).toContain('value="mic"')
    expect(markup).toContain('aria-label="Clear search"')
  })
})
