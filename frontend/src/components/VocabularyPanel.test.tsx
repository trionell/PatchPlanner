import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VocabularyPanel } from './VocabularyPanel'
import type { ReferenceData } from '../types'

/**
 * The vocabularies, on a phone (Wave 6c, audit.md M9).
 *
 * This branch is in the **shared component**, so one change gives event Settings and
 * `/my-defaults` a phone form — the `ui/Drawer` precedent. That is what these tests are
 * really guarding: both callers pass the same six props and differ only in `showUsage`
 * and `note`, so a branch written per call site would be the same branch twice, free to
 * drift. The last test pins the other half — that the desktop return did not move.
 */

const setWidth = (mobile: boolean) => {
  // No DOM in this project's tests, so `useIsMobile`'s query is answered directly.
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

// `signal_types` is the first key of `vocabularyTitles`, so it is what the panel
// opens on — and it is also one of the four vocabularies nothing stores any more.
const data: ReferenceData = {
  signal_types: [
    { id: 1, value: 'analog', label: 'Analog', usageCount: 14 },
    { id: 2, value: 'aes', label: 'AES', usageCount: 0 },
  ],
  mic_stands: [{ id: 3, value: 'tall', label: 'Tall boom', usageUntracked: true }],
} as unknown as ReferenceData

function render(over: { showUsage?: boolean; readOnly?: boolean } = {}): string {
  return renderToStaticMarkup(
    <VocabularyPanel
      data={data}
      note="this event's own copy — editing it changes nothing anywhere else"
      onCreate={async () => {}}
      onDelete={async () => {}}
      onRename={async () => {}}
      readOnly={over.readOnly ?? false}
      showUsage={over.showUsage ?? true}
      title="Vocabularies"
    />,
  )
}

describe('VocabularyPanel · the phone', () => {
  it('the rail becomes the panel’s title, and the title is readable', () => {
    setWidth(true)
    const markup = render()
    expect(markup).toContain('aria-label="Vocabularies"')
    // It names the open vocabulary, not the category of them.
    expect(markup).toContain('Signal types')
    /*
      And it is **not** capped at 112px. That is what it was first, beside the word
      *Vocabularies*, and every option truncated — so the one thing the control existed
      to tell you was the one thing you could not read (Slice 35 field test).
    */
    expect(markup).not.toContain('max-w-[7rem]')
  })

  it('a value carries its label, its stored value and how many rows use it', () => {
    setWidth(true)
    const markup = render()
    expect(markup).toContain('Analog')
    expect(markup).toContain('analog')
    expect(markup).toContain('used in 14 rows')
    expect(markup).toContain('not used')
  })

  it('a vocabulary nothing stores says so, rather than showing a dash', () => {
    setWidth(true)
    // `mic_stands` is one of the four that outlived the column that stored it.
    expect(render()).toContain('9 vocabularies')
  })

  it('the personal template reports no usage at all — reporting 0 would imply it could', () => {
    setWidth(true)
    const markup = render({ showUsage: false })
    expect(markup).not.toContain('used in 14 rows')
    expect(markup).not.toContain('not used')
  })

  it('the strip states what this copy is and offers no filter', () => {
    setWidth(true)
    const markup = render()
    expect(markup).toContain('editing it changes nothing anywhere else')
    expect(markup).not.toContain('lucide-chevron-right')
  })

  it('a role that cannot act gets no add control and no pencil', () => {
    setWidth(true)
    const markup = render({ readOnly: true })
    expect(markup).not.toContain('aria-label="Add value"')
    expect(markup).not.toContain('lucide-pencil')
  })

  it('the desktop still gets the rail and the table', () => {
    setWidth(false)
    const markup = render()
    expect(markup).toContain('Stored value')
    expect(markup).toContain('In use')
    expect(markup).not.toContain('aria-label="Add value"')
  })
})
