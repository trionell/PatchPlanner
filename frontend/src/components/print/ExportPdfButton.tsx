import { FileDown } from 'lucide-react'
import { Button } from '../ui/Button'

/**
 * Downloads a document the server writes: the audio plan (Slice 40) or a stage
 * plot (Slice 41).
 *
 * A navigation rather than a fetch, the same way every other export in the
 * application is taken: the browser handles the attachment, and there is no
 * blob to hold or revoke.
 *
 * It takes the URL rather than an id because the two documents are scoped
 * differently — the audio plan is per event, a stage plot is per plot — and a
 * button that knew both would have to be told which one it was anyway.
 *
 * This is not `PrintButton`. That one opens the browser's print dialog and
 * still serves Lighting, whose sheet is React and is revealed by `@media
 * print`. The two mechanisms coexist — `design/patterns.md` §8 says which
 * surface uses which and why.
 */
export function ExportPdfButton({ href, label = 'Export PDF' }: { href: string; label?: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="print:hidden"
      onClick={() => window.location.assign(href)}
    >
      <FileDown className="mr-2 h-4 w-4" />{label}
    </Button>
  )
}
