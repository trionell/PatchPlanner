import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConsoleExportPreview } from '../../api/audio'
import { GENERIC } from '../../hooks/useDeskModels'
import type { Console, DeskModel } from '../../types'
import { ConsoleExportDialog } from './ConsoleExportDialog'

beforeEach(() => {
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem: () => {} } }
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const M32: DeskModel = { ...GENERIC, key: 'm32l', label: 'M32 Live', engine: 'x32' }
const LV1: DeskModel = { ...GENERIC, key: 'lv1_64', label: 'LV1 64', engine: 'lv1' }
const desk = { id: 3, name: 'FOH' } as Console

function render(model: DeskModel, preview?: ConsoleExportPreview, readOnly = false, deskCount = 1) {
  const client = new QueryClient()
  if (preview) client.setQueryData(['console-export', 1, 3, {}], preview)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ConsoleExportDialog open onClose={() => {}} eventId={1} desk={{ console: desk, model }} deskCount={deskCount} readOnly={readOnly} onOpenRig={() => {}} />
    </QueryClientProvider>,
  )
}

const preview: ConsoleExportPreview = {
  filename: 'Julkonsert-FOH.scn',
  figures: [{ label: 'Channel strips', value: '30 +4 aux' }],
  lines: [
    { word: 'Left out', text: '1 channel flagged over on FOH, not in the file.', items: ['Orgel L/R'] },
    { word: 'Changed', text: '3 names cut to 12 characters.', items: ['Gitarr Johannes → Gitarr Johan'] },
  ],
  boxes: [{ key: 'stagebox:7', name: 'Scen A', inputs: 32 }],
}

describe('ConsoleExportDialog', () => {
  it('states the file and asks only for ports on an X32', () => {
    const html = render(M32, preview, false, 2)
    expect(html).toContain('FOH · M32 Live')
    expect(html).toContain('Julkonsert-FOH.scn')
    expect(html).toContain('1 of 2')
    expect(html).toContain('Scen A')
    expect(html).toContain('AES50-A')
    expect(html).toContain('Download scene')
    expect(html).toContain('Left out')
    expect(html).toContain('30 +4 aux')
  })

  it('offers I/O slots and device models on an LV1', () => {
    const html = render(LV1, { ...preview, filename: 'Julkonsert-FOH.emo' })
    expect(html).toContain('Bank 1 · slot 1')
    expect(html).toContain('Download session')
  })

  it('writes nothing for a Generic desk, and tells a viewer who can fix it', () => {
    const owner = render(GENERIC)
    expect(owner).toContain('Pick its model in Rig')
    expect(owner).toContain('Open Rig')
    expect(owner).not.toContain('Download')
    const viewer = render(GENERIC, undefined, true)
    expect(viewer).toContain('An owner can pick its model in Rig.')
    expect(viewer).not.toContain('Open Rig')
  })
})
