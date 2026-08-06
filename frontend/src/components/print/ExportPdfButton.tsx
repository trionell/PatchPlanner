import { FileDown } from 'lucide-react'
import { audioExportPdfUrl } from '../../api/audio'
import { Button } from '../ui/Button'

/**
 * Downloads the event's audio documentation (Slice 40).
 *
 * A navigation rather than a fetch, the same way every other export in the
 * application is taken: the browser handles the attachment, and there is no
 * blob to hold or revoke.
 *
 * This is not `PrintButton`. That one opens the browser's print dialog and
 * still serves Lighting and the stage plot, whose sheets are React and are
 * revealed by `@media print`. The audio plan is a document the server writes,
 * and the two mechanisms now coexist — `design/patterns.md` §8 says which
 * surface uses which and why.
 */
export function ExportPdfButton({ eventId }: { eventId: number }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="print:hidden"
      onClick={() => window.location.assign(audioExportPdfUrl(eventId))}
    >
      <FileDown className="mr-2 h-4 w-4" />Export PDF
    </Button>
  )
}
