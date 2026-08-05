import { API_BASE } from './client'

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
