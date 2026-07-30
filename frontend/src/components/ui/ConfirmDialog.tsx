import type { ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  /** A noun phrase naming the operation — "Delete source". Not a question. */
  title: string
  /** The sentence. It names the subject and the consequence, in that order. */
  children: ReactNode
  /** The destructive control's word. Defaults to the plain verb. */
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A sentence and two buttons, which is exactly what `components.md` §4 says a
 * `Dialog` is — here standing in for the browser's own `window.confirm`.
 *
 * Slice 32 removed the application's only `window.prompt` on the argument that a
 * browser primitive is not this language, and it applies harder to a destructive
 * confirm on a phone, where the dialog interrupts the sheet the user is reading.
 * It is `max-w-md` rather than `Dialog`'s `max-w-2xl` — one sentence does not need
 * 672 px, and `ChainCell` already narrows the same way.
 *
 * **Cancel is present**, unlike `ui/Sheet`'s footer (patterns.md §7d). There the
 * close target is a way out of an edit you can simply re-open; here the two
 * buttons *are* the question, and a confirm with one answer is not a question.
 *
 * `Escape`, the scrim and the × all cancel, because `Dialog`'s `onClose` is the
 * negative answer — the safe one is the one that costs nothing to repeat.
 */
export function ConfirmDialog({ open, title, children, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">{children}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
