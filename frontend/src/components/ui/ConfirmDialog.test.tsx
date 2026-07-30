import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * The three things that make this a confirm rather than a dialog with a red button
 * in it (ROADMAP D2). All three are invisible in a screenshot of the open state.
 */

const noop = () => {}

const open = (
  <ConfirmDialog open title="Delete source" onCancel={noop} onConfirm={noop}>
    “Kick in” will be deleted. Any cable connected to it is removed with it.
  </ConfirmDialog>
)

describe('ConfirmDialog', () => {
  it('renders nothing when closed, so it costs a caller nothing to mount', () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog open={false} title="Delete source" onCancel={noop} onConfirm={noop}>
        anything
      </ConfirmDialog>,
    )
    expect(markup).toBe('')
  })

  it('is a sentence and two buttons, and the sentence names the consequence', () => {
    const markup = renderToStaticMarkup(open)
    expect(markup).toContain('Delete source')
    expect(markup).toContain('Any cable connected to it is removed with it.')
    expect(markup).toContain('Cancel')
  })

  it('confirms with the destructive fill, which is what that variant is reserved for', () => {
    // components.md §4: `destructive` is "confirmed deletes only". A ghost Cancel
    // beside a filled red confirm is the whole visual argument.
    const markup = renderToStaticMarkup(open)
    expect(markup).toContain('bg-red-500')
    expect(markup).toContain('bg-transparent')
  })

  it('narrows the dialog, because one sentence does not need 672 px', () => {
    const markup = renderToStaticMarkup(open)
    expect(markup).toContain('max-w-md')
  })
})
