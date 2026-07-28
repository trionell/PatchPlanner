import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MobilePanel } from './MobilePanel'

/**
 * The panel's structure, pinned.
 *
 * Same reasoning as `Sheet.test.tsx`: what a frame must get right is **what is a
 * sibling of what**, which is invisible in a screenshot and plain in the element
 * order. P2 below is the one that matters — a strip nested inside the scrolling rows
 * scrolls away with them, and a strip you have to scroll to is a strip nobody reads
 * (audit.md M3, and the same failure `ui/Sheet`'s footer has one edge over).
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
    const scroller = markup.match(/class="([^"]*overflow-y-auto[^"]*)"/)?.[1] ?? ''
    expect(scroller).toContain('flex-1')
    expect(scroller).not.toMatch(/\bp-|\bpx-|\bpy-|\bgap-/)
  })

  it('P2 · the strip is a sibling of the scrolling rows, never inside them', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" strip={strip}>
        {rows}
      </MobilePanel>,
    )
    const scrollerStart = markup.indexOf('overflow-y-auto')
    const scrollerOpenTagEnd = markup.indexOf('>', scrollerStart)
    // The strip must appear after the scrolling region closes, not within it.
    const rowsIndex = markup.indexOf('id="rows"')
    const stripIndex = markup.indexOf('id="strip"')
    expect(rowsIndex).toBeGreaterThan(scrollerOpenTagEnd)
    expect(stripIndex).toBeGreaterThan(rowsIndex)
    expect(markup.slice(rowsIndex, stripIndex)).toContain('</div>')
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
})
