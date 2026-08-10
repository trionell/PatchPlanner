import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecordField } from './RecordField'

/**
 * The three states are the component's whole contract, and each one exists
 * because a `<select>` could not express it.
 */
describe('RecordField', () => {
  const noop = () => {}

  it('invites when it holds nothing', () => {
    const html = renderToStaticMarkup(<RecordField onOpen={noop} placeholder="Choose an item…" />)
    expect(html).toContain('Choose an item…')
  })

  it('names the record and the qualifier that tells it from a same-named one', () => {
    const html = renderToStaticMarkup(
      <RecordField onOpen={noop} placeholder="Choose an item…" record={{ name: 'Mikrofonkabel', qualifier: '7,5m' }} />,
    )
    expect(html).toContain('Mikrofonkabel')
    expect(html).toContain('7,5m')
    expect(html).not.toContain('Choose an item…')
  })

  it('says nothing where there is no qualifier — no em-dash standing in', () => {
    const html = renderToStaticMarkup(
      <RecordField onOpen={noop} placeholder="Choose an item…" record={{ name: 'Stativ' }} />,
    )
    expect(html).toContain('Stativ')
    expect(html).not.toContain('—')
    expect(html).not.toContain('·')
  })

  it('counts rather than listing when it holds several', () => {
    const html = renderToStaticMarkup(
      <RecordField
        count={5}
        onOpen={noop}
        placeholder="Choose an item…"
        record={{ name: 'Mikrofonkabel', qualifier: '7,5m' }}
      />,
    )
    expect(html).toContain('5 items')
    // The names belong to the batch block below, not truncated into 160px here.
    expect(html).not.toContain('Mikrofonkabel')
  })

  it('treats a count of one as the single record it is', () => {
    const html = renderToStaticMarkup(
      <RecordField count={1} onOpen={noop} placeholder="Choose an item…" record={{ name: 'Stativ' }} />,
    )
    expect(html).toContain('Stativ')
    expect(html).not.toContain('1 items')
  })
})
