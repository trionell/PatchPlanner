import { BOX_TINT, previewTint } from '../../lib/deskPreview'
import type { DeskMapping, PreviewWord } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

/** Each word's ink; the box takes the tint of its worst line (A3, B1). */
const WORD_INK: Record<PreviewWord, string> = {
  'Left out': 'text-red-300',
  Changed: 'text-amber-300',
  Moved: 'text-amber-300',
  'Fits again': 'text-zinc-200',
}

interface DeskMappingDialogProps {
  open: boolean
  title: string
  /** Names what happens: "Switch to X32 Compact", "Put 2 on Monitor". */
  confirmLabel: string
  mapping: DeskMapping | null
  pending?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The preview of a model switch or of placing deskless rows (Slice 47): the
 * desk's figures before and after, then word-led lines. The primary is never
 * disabled for a loss — the planner may be choosing a smaller desk on purpose —
 * and is `primary`, not destructive, because nothing is deleted.
 */
export function DeskMappingDialog({ open, title, confirmLabel, mapping, pending, error, onConfirm, onCancel }: DeskMappingDialogProps) {
  const lines = mapping?.lines ?? []
  const figures = mapping?.figures ?? []
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      className="max-w-md"
      footer={
        <>
          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 px-4 text-xs" disabled={pending || !mapping} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {!mapping ? (
        <p className="text-sm text-zinc-400">Loading …</p>
      ) : (
        <div className="space-y-3 text-sm">
          {figures.length > 0 && (
            <table className="w-full font-mono text-xs tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1 text-left font-medium" />
                  <th className="py-1 text-right font-medium">Now</th>
                  <th className="py-1 text-right font-medium">After</th>
                </tr>
              </thead>
              <tbody>
                {figures.map((figure) => {
                  const lost = figure.after_capacity > 0 && figure.after > figure.after_capacity
                  return (
                    <tr key={figure.label} className="border-t border-zinc-800/60">
                      <td className="py-1 font-sans text-zinc-400">{figure.label}</td>
                      <td className="py-1 text-right text-zinc-300">{fraction(figure.before, figure.before_capacity)}</td>
                      <td className={lost ? 'py-1 text-right text-red-300' : 'py-1 text-right text-zinc-100'}>{fraction(figure.after, figure.after_capacity)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {lines.length > 0 && (
            <div className={`space-y-2 rounded-md border px-3 py-2.5 ${BOX_TINT[previewTint(lines)]}`}>
              {lines.map((line, index) => (
                <div key={index}>
                  <p className="text-zinc-300">
                    <span className={`font-semibold ${WORD_INK[line.word]}`}>{line.word}</span> · {line.text}
                  </p>
                  {line.items && line.items.length > 0 && (
                    <details className="mt-0.5 text-xs text-zinc-400">
                      <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                        {line.items.slice(0, 3).join(', ')}
                        {line.items.length > 3 ? `, … ${line.items.length - 3} more` : ''}
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-3 font-mono">
                        {line.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-zinc-500">
            Nothing is deleted. Left-out channels stay on the sheet, flagged, and come back on a desk that holds them.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}

function fraction(used: number, capacity: number) {
  return capacity > 0 ? `${used} / ${capacity}` : `${used}`
}
