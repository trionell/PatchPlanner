import { Printer } from 'lucide-react'
import { Button } from '../ui/Button'

/** Opens the browser print dialog; the active tab's print sheet is what prints. */
export function PrintButton() {
  return (
    <Button size="sm" variant="secondary" className="print:hidden" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />Print
    </Button>
  )
}
