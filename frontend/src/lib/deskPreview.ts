import type { DeskMapping, PreviewLine } from '../types'

export const BOX_TINT = {
  red: 'border-red-400/40 bg-red-500/[0.05]',
  amber: 'border-amber-500/40 bg-amber-500/[0.05]',
  none: 'border-zinc-800 bg-zinc-950/40',
} as const

/** The box's tint: red for any loss, amber for any change, none when only Fits again. */
export function previewTint(lines: PreviewLine[]): keyof typeof BOX_TINT {
  if (lines.some((line) => line.word === 'Left out')) return 'red'
  if (lines.some((line) => line.word === 'Changed' || line.word === 'Moved')) return 'amber'
  return 'none'
}

/** Whether a preview has anything to state; with nothing, the change is applied at once. */
export const previewHasLines = (mapping: DeskMapping) => (mapping.lines ?? []).length > 0
