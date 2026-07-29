import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MobileEntityList, type MobileEntityRow } from './MobileEntityList'

/**
 * The one line of `M4` that is not a permission expression.
 *
 * `onClick={readOnly ? undefined : …}` appears on six desktop sheets and is correct on
 * all six: a desktop row already shows every column, and the click only opens an editor.
 * On a phone the row is a **truncation** — the source, the routing and the notes are
 * behind the tap — so the same line meant a viewer could not read the patch at all.
 *
 * That is invisible in a screenshot: a dead row and a live row look identical until one
 * is pressed. So it is pinned here, from both sides — the row is always a control, and
 * the *affordance* still tracks the role.
 */

const items: MobileEntityRow[] = [
  { id: 1, number: 12, name: 'Kick In', subtitle: 'Beta 91A · SB1 in 12' },
  { id: 2, number: 13, name: 'Snare Top', subtitle: 'e906 · SB1 in 13' },
]

function render(readOnly: boolean): string {
  return renderToStaticMarkup(
    <MobileEntityList
      addLabel="Add channel"
      emptyLabel="No input channels yet."
      items={items}
      onSelect={() => {}}
      readOnly={readOnly}
      searchPlaceholder="Find a channel…"
      title="Audio Inputs"
    />,
  )
}

describe('MobileEntityList · a viewer can read the patch', () => {
  it('every row is tappable for a role that may not edit', () => {
    const markup = render(true)
    // Two rows, two buttons — a `<div>` row here is a row a viewer cannot open.
    expect(markup.match(/<button type="button" class="flex min-h-\[44px\]/g)).toHaveLength(2)
  })

  it('and for a role that may', () => {
    expect(render(false).match(/<button type="button" class="flex min-h-\[44px\]/g)).toHaveLength(2)
  })

  it('the pencil still tracks the role — what the tap does differs, that it responds does not', () => {
    expect(render(false)).toContain('lucide-pencil')
    expect(render(true)).not.toContain('lucide-pencil')
  })

  it('a role that cannot act gets no add control at all, rather than a disabled one', () => {
    expect(render(true)).not.toContain('aria-label="Add channel"')
  })
})
