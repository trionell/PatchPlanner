import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { audioExportPdfUrl } from '../../api/audio'
import { ExportPdfButton } from './ExportPdfButton'

/**
 * The audio surfaces stopped opening the browser's print dialog and started
 * downloading a document the server writes (Slice 40). These cases hold the two
 * things that made the swap worth making: it is one URL, and it is per event.
 */
describe('ExportPdfButton', () => {
  it('offers the export rather than a print', () => {
    const html = renderToStaticMarkup(<ExportPdfButton eventId={7} />)
    expect(html).toContain('Export PDF')
    expect(html).not.toContain('Print')
  })

  it('is hidden from the printed page, as the print controls were', () => {
    const html = renderToStaticMarkup(<ExportPdfButton eventId={7} />)
    expect(html).toContain('print:hidden')
  })
})

describe('audioExportPdfUrl', () => {
  it('names the event, so the same button on three surfaces is one document', () => {
    expect(audioExportPdfUrl(7)).toBe('/api/v1/events/7/audio-export/pdf')
    expect(audioExportPdfUrl(41)).toBe('/api/v1/events/41/audio-export/pdf')
  })
})
