import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { audioExportPdfUrl } from '../../api/audio'
import { stagePlotExportPdfUrl } from '../../api/stagePlots'
import { ExportPdfButton } from './ExportPdfButton'

/**
 * The audio surfaces stopped opening the browser's print dialog and started
 * downloading a document the server writes (Slice 40); the stage plot followed
 * (Slice 41). These cases hold what made the swap worth making: it is one URL
 * per document, and each document is scoped to the thing it draws.
 */
describe('ExportPdfButton', () => {
  it('offers the export rather than a print', () => {
    const html = renderToStaticMarkup(<ExportPdfButton href="/api/v1/anything" />)
    expect(html).toContain('Export PDF')
    expect(html).not.toContain('Print')
  })

  it('is hidden from the printed page, as the print controls were', () => {
    const html = renderToStaticMarkup(<ExportPdfButton href="/api/v1/anything" />)
    expect(html).toContain('print:hidden')
  })
})

describe('audioExportPdfUrl', () => {
  it('names the event, so the same button on three surfaces is one document', () => {
    expect(audioExportPdfUrl(7)).toBe('/api/v1/events/7/audio-export/pdf')
    expect(audioExportPdfUrl(41)).toBe('/api/v1/events/41/audio-export/pdf')
  })
})

describe('stagePlotExportPdfUrl', () => {
  // Per plot, not per event: an event holds several plots and they are drawings
  // of different rooms.
  it('names the plot as well as the event', () => {
    expect(stagePlotExportPdfUrl(7, 2)).toBe('/api/v1/events/7/stage-plots/2/export/pdf')
    expect(stagePlotExportPdfUrl(41, 1)).toBe('/api/v1/events/41/stage-plots/1/export/pdf')
  })

  it('gives two plots on one event two different documents', () => {
    expect(stagePlotExportPdfUrl(7, 1)).not.toBe(stagePlotExportPdfUrl(7, 2))
  })
})
