import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GENERIC } from '../../hooks/useDeskModels'
import { previewTint } from '../../lib/deskPreview'
import type { Console, DeskMapping, DeskModel, InputChannel } from '../../types'
import { DeskMappingDialog } from './DeskMappingDialog'
import { DeskSelector } from './DeskSelector'
import { InputSheet } from './InputSheet'

/**
 * Slice 47, as markup: the switch preview's words and tint, the selector's presence,
 * and an X32 desk's list in two sections with the over flag. Presence is what
 * `renderToStaticMarkup` can see, and presence is what these rules are about.
 */

beforeEach(() => {
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem: () => {} },
  }
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const M32: DeskModel = { ...GENERIC, key: 'm32l', family: 'Midas M32', label: 'M32 Live', engine: 'x32', stereo: 'linked', strips: 32, aux_in: 8 }
const desk = (id: number, name: string, extra: Partial<Console> = {}) => ({ id, event_id: 1, name, desk_model: 'm32l', bus_mode: '', input_count: 32, ...extra }) as Console
const ch = (id: number, n: number, extra: Partial<InputChannel> = {}): InputChannel =>
  ({ id, event_id: 1, channel_number: n, channel_name: `Ch${id}`, width: 'mono', mixer_behavior: 'linked_channels', console_id: 1, strip_pool: 'channel', group_ids: [], dca_ids: [], ...extra }) as InputChannel

const withQuery = (node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)

describe('the switch preview', () => {
  const mapping: DeskMapping = {
    rows: [],
    figures: [{ label: 'Strips', before: 41, before_capacity: 64, after: 41, after_capacity: 32 }],
    lines: [
      { word: 'Left out', text: '9 channels past strip 32.', items: ['Ambience L/R'] },
      { word: 'Moved', text: '2 channels move.', items: ['Trumpet 8 → 9'] },
    ],
  }

  it('leads each line with its word and names the switch on the primary', () => {
    const html = renderToStaticMarkup(<DeskMappingDialog open title="Change FOH's model" confirmLabel="Switch to X32 Compact" mapping={mapping} onConfirm={() => {}} onCancel={() => {}} />)
    expect(html).toContain('Left out')
    expect(html).toContain('9 channels past strip 32.')
    expect(html).toContain('Switch to X32 Compact')
    expect(html).toContain('Nothing is deleted.')
    // The after figure the desk cannot hold is red.
    expect(html).toMatch(/text-red-300">41 \/ 32/)
  })

  it('tints the box by its worst line, and leaves a Fits-again-only box untinted', () => {
    expect(previewTint(mapping.lines!)).toBe('red')
    expect(previewTint([{ word: 'Changed', text: '' }])).toBe('amber')
    expect(previewTint([{ word: 'Fits again', text: '' }])).toBe('none')
  })
})

describe('the desk selector', () => {
  const entries = [{ desk: desk(1, 'FOH'), label: 'FOH · M32 Live 30/32' }]

  it('is absent with one desk and nothing on no desk', () => {
    expect(renderToStaticMarkup(<DeskSelector entries={entries} deskless={0} selection={1} onSelect={() => {}} />)).toBe('')
  })

  it('ends with No desk while anything is on it', () => {
    const html = renderToStaticMarkup(<DeskSelector entries={entries} deskless={2} selection={1} onSelect={() => {}} />)
    expect(html).toContain('FOH · M32 Live 30/32')
    expect(html).toContain('No desk · 2')
  })
})

describe('an X32 desk on the Inputs sheet', () => {
  const props = {
    eventId: 1,
    sources: [], devices: [], stageboxes: [], stageMultis: [], cables: [], groups: [], dcas: [],
    cableItems: [], itemLabelById: new Map<number, string>(),
    models: [M32],
  }

  it('lists Channels then Aux in, prints pairs, and flags a row past the end', () => {
    const html = withQuery(
      <InputSheet
        {...props}
        consoles={[desk(1, 'FOH')]}
        desk={{ console: desk(1, 'FOH'), model: M32 }}
        channels={[ch(1, 5, { width: 'stereo' }), ch(2, 33), ch(3, 1, { strip_pool: 'aux' })]}
        onAddAux={() => {}}
      />,
    )
    expect(html.indexOf('Channels')).toBeLessThan(html.indexOf('Aux in'))
    expect(html).toContain('5–6')
    expect(html).toContain('Aux 1')
    expect(html).toMatch(/33 <span[^>]*>over<\/span>/)
    expect(html).toContain('+ Aux')
  })

  it('says an empty aux section is empty, and gives a viewer no + Aux', () => {
    const html = withQuery(<InputSheet {...props} readOnly consoles={[desk(1, 'FOH')]} desk={{ console: desk(1, 'FOH'), model: M32 }} channels={[ch(1, 1)]} />)
    expect(html).toContain('No aux inputs used.')
    expect(html).not.toContain('+ Aux')
  })

  it('shows rows on no desk with the note and one Put on per desk', () => {
    const html = withQuery(<InputSheet {...props} consoles={[desk(1, 'FOH'), desk(2, 'Mon')]} channels={[ch(1, 3, { console_id: undefined })]} />)
    expect(html).toContain('on no desk')
    expect(html).toContain('Put on FOH')
    expect(html).toContain('Put on Mon')
  })
})
