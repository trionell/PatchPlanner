import { API_BASE, get } from './client'

/**
 * The event's audio documentation — input patch, output patch, stage rig and
 * both signal-flow drawings, in one PDF (Slice 40).
 *
 * A plain URL rather than a `request()` call: downloads are navigations, which
 * is how every other export in the application is taken.
 *
 * One document, whichever audio surface asked for it. The surface the request
 * came from does not change what is in the file.
 */
export const audioExportPdfUrl = (eventId: number) => `${API_BASE}/events/${eventId}/audio-export/pdf`

/** Where the export dialog put a stagebox (or the desk's local jacks) on the desk's I/O (Slice 49). */
export interface ExportPortChoice {
  socket?: 'local' | 'a' | 'b' | 'card'
  start?: number
  bank?: number
  slot?: number
  device?: 'SG4000' | 'SG1000' | 'Classic' | 'Other'
}
export type ExportPorts = Record<string, ExportPortChoice>

export interface ConsoleExportPreview {
  filename: string
  figures: { label: string; value: string }[]
  lines: { word: 'Left out' | 'Changed' | 'No input' | 'No port'; text: string; items?: string[] }[] | null
  boxes: { key: string; name: string; inputs: number }[] | null
}

const exportQuery = (consoleId: number, ports: ExportPorts) =>
  `console=${consoleId}&ports=${encodeURIComponent(JSON.stringify(ports))}`

/** The showfile itself, downloaded by navigation like every export. */
export const consoleExportUrl = (eventId: number, consoleId: number, ports: ExportPorts) =>
  `${API_BASE}/events/${eventId}/console-export?${exportQuery(consoleId, ports)}`

/** What the file will hold and cannot hold — computed by the code that writes it. */
export const getConsoleExportPreview = (eventId: number, consoleId: number, ports: ExportPorts, signal?: AbortSignal) =>
  get<ConsoleExportPreview>(`/events/${eventId}/console-export/preview?${exportQuery(consoleId, ports)}`, signal)
