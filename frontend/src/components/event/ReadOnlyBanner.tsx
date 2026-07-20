import { Eye } from 'lucide-react'

/** Shown on an event a viewer has been given read-only access to. */
export function ReadOnlyBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300 print:hidden">
      <Eye className="h-4 w-4 shrink-0" />
      You have view-only access to this event. You can view and print/export everything, but can't make changes.
    </div>
  )
}
