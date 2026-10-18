import { Button } from '../ui/Button'

/** A refusal held next to the editor or the bar it answers, with its one-click fix. */
export interface SheetRefusal {
  message: string
  fix?: { label: string; apply: () => void }
}

/** A refusal, inline where it was raised (patterns.md §5, Error), with its one fix. */
export function RefusalNotice({ refusal }: { refusal: SheetRefusal }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
      {refusal.message}
      {refusal.fix && (
        <Button size="xs" variant="outline" onClick={refusal.fix.apply}>
          {refusal.fix.label}
        </Button>
      )}
    </div>
  )
}
