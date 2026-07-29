import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CondensedListRow } from './CondensedListRow'

/**
 * The row's values, pinned — and this file exists mostly for one of them.
 *
 * tokens.md §7 stated `px-3 py-2.5`, `text-sm` over `text-xs`, and "44 px tall" in one
 * table row. At the framework's default line boxes that padding makes a **56px** row,
 * and building it as written would have taken two rows of data off a 667px handset.
 * Two implementations — the drawn specimen and the shipped code — independently reached
 * 44px and independently disagreed with the table for five waves, because nothing
 * checked (audit.md M2, F3).
 *
 * So the height and the leading are asserted here rather than only stated in a
 * document. A future edit that reaches for `py-2.5` trips over this file.
 */

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

const root = (markup: string): string => markup.match(/class="([^"]*)"/)?.[1] ?? ''

describe('CondensedListRow', () => {
  it('P3 · states a height and a tight leading, not a padding', () => {
    const markup = render(<CondensedListRow title="Snare Top" subtitle="e906 · SB1 in 3" />)
    expect(root(markup)).toContain('min-h-[44px]')
    expect(markup.match(/leading-tight/g)).toHaveLength(2)
    expect(markup).not.toContain('py-2.5')
  })

  it('P3 · carries no value outside the two density tiers', () => {
    const markup = render(<CondensedListRow title="Snare Top" subtitle="e906 · SB1 in 3" />)
    expect(markup).not.toContain('text-[13px]')
    expect(markup).not.toContain('text-[11px]')
    expect(markup).toContain('text-sm')
    expect(markup).toContain('text-xs')
  })

  it('is a row, not a card: no border, radius or raised ground of its own', () => {
    const markup = render(<CondensedListRow title="Snare Top" />)
    const classes = root(markup)
    expect(classes).not.toContain('rounded')
    expect(classes).not.toContain('bg-zinc-900')
    expect(classes).toContain('border-b border-zinc-800/60')
  })

  it('both lines truncate, so content cannot make a row taller than the pitch', () => {
    const markup = render(<CondensedListRow title="A very long channel name" subtitle="and its routing" />)
    expect(markup.match(/truncate/g)).toHaveLength(2)
  })

  it('draws the derived colour as a 3px edge with the tint on the content', () => {
    const markup = render(<CondensedListRow accentColor="#38bdf8" title="Kick In" />)
    expect(markup).toContain('w-[3px]')
    expect(markup).toContain('background-color:#38bdf8')
    expect(markup).toContain('#38bdf81a')
  })

  it('is a button only when it does something', () => {
    expect(render(<CondensedListRow title="Kick In" onClick={() => {}} />)).toContain('<button')
    expect(render(<CondensedListRow title="Kick In" />)).not.toContain('<button')
  })
})
