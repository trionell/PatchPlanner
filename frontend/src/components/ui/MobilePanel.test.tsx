import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MobilePanel, PanelActionRow } from './MobilePanel'

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
    // The rows container carries scroll classes and nothing else — no padding and no
    // gap, so rows are separated by a hairline rather than by air.
    expect(markup).toContain('<div class="min-h-0 flex-1 overflow-y-auto"><div id="rows">')
  })

  /**
   * The shell's invariant, from the panel's side (Wave 6c).
   *
   * 6b built this column and reverted it, having got one half of the flex rule: it
   * could shrink but it could not scroll, so three surfaces collapsed below their
   * content and clipped with no scrollbar anywhere. Both classes are load-bearing and
   * neither is visible in a screenshot until the content is tall.
   */
  it('exactly one element scrolls, and it can shrink to let it', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" strip={strip}>
        {rows}
      </MobilePanel>,
    )
    expect(markup.match(/overflow-y-auto/g)).toHaveLength(1)
    expect(markup).toContain('min-h-0 flex-1 overflow-y-auto')
    // …and the bar and the strip must not be allowed to absorb or yield space.
    expect(markup).toContain('flex-none')
  })

  it('P2 · the strip is a sibling of the rows, never inside them', () => {
    const markup = render(
      <MobilePanel title="Audio Inputs" strip={strip}>
        {rows}
      </MobilePanel>,
    )
    // It is what closes the panel, so it cannot be part of what the panel contains:
    // the rows container must have closed before the strip appears.
    expect(markup).toContain('<div id="rows">eight rows</div></div><div id="strip">')
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

  /**
   * The overflow (Wave 6c, F2).
   *
   * `patterns.md` §7b specified it in 6b and nothing built it, because in 6b nothing
   * overflowed. What is pinned here is the part a caller must not be allowed to decide:
   * **how many actions earn a menu**. One does not, and a bar that hides a single action
   * behind two taps is the failure this is guarding against — it is invisible in a
   * screenshot and it would be settled differently by each of six call sites.
   */
  describe('the bar’s overflow', () => {
    const three = [
      { label: 'Open Rig', hint: '7 items', onClick: () => {} },
      { label: 'Groups & DCAs', hint: '6', onClick: () => {} },
      { label: 'Print patch sheet', onClick: () => {} },
    ]

    it('renders nothing when there is nothing to overflow', () => {
      const markup = render(
        <MobilePanel title="Equipment" overflow={[]}>
          {rows}
        </MobilePanel>,
      )
      expect(markup).not.toContain('aria-label="More actions"')
    })

    it('one action is its own target — a single control does not earn a menu', () => {
      const markup = render(
        <MobilePanel title="Signal flow" overflow={[{ label: 'Print', onClick: () => {} }]}>
          {rows}
        </MobilePanel>,
      )
      expect(markup).toContain('aria-label="Print"')
      expect(markup).not.toContain('aria-label="More actions"')
      // …and no sheet is rendered at all, so there is nothing to open.
      expect(markup).not.toContain('Print</span>')
    })

    it('two or more collapse behind one target', () => {
      const markup = render(
        <MobilePanel title="Audio Inputs" overflow={three}>
          {rows}
        </MobilePanel>,
      )
      expect(markup).toContain('aria-label="More actions"')
      expect(markup).not.toContain('aria-label="Open Rig"')
    })

    it('the overflow target is a 44px control like every other in the bar', () => {
      const markup = render(
        <MobilePanel title="Audio Inputs" overflow={three}>
          {rows}
        </MobilePanel>,
      )
      const target = markup.slice(markup.indexOf('aria-label="More actions"'))
      expect(target).toContain('h-11 w-11')
    })

    it('sits after the visible selector and before the primary action', () => {
      const markup = render(
        <MobilePanel
          title="Items"
          actions={<button id="filter" type="button" />}
          overflow={three}
          primaryAction={<button id="add" type="button" />}
        >
          {rows}
        </MobilePanel>,
      )
      expect(markup.indexOf('id="filter"')).toBeLessThan(markup.indexOf('aria-label="More actions"'))
      expect(markup.indexOf('aria-label="More actions"')).toBeLessThan(markup.indexOf('id="add"'))
    })

    it('a closed overflow leaks no labels into the bar', () => {
      // `ui/Sheet` renders null while closed, so the actions exist nowhere until the
      // target is pressed. Worth pinning: a label that leaked would be an unlabelled
      // 44px control's text sitting loose in a 317px bar.
      const markup = render(
        <MobilePanel title="Audio Inputs" overflow={three}>
          {rows}
        </MobilePanel>,
      )
      expect(markup).not.toContain('Open Rig')
      expect(markup).not.toContain('7 items')
    })

    it('the sheet’s row is the panel’s, not a caller’s: 52px, label, hint', () => {
      // Rendered directly, because the sheet it lives in is closed in every markup
      // above and `renderToStaticMarkup` cannot press the target that opens it.
      const markup = render(<PanelActionRow action={three[0]} onDone={() => {}} />)
      expect(markup).toContain('min-h-[52px]')
      expect(markup).toContain('Open Rig')
      expect(markup).toContain('7 items')
    })

    it('a row without a hint draws no trailing element', () => {
      const markup = render(<PanelActionRow action={three[2]} onDone={() => {}} />)
      expect(markup).not.toContain('text-xs text-zinc-500')
    })
  })
})
