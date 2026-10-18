import type { DeskSelection } from '../../hooks/useSelectedDesk'
import type { Console } from '../../types'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

export interface DeskEntry {
  desk: Console
  /** The desk's name and fill, "FOH · M32 Live 30/32". */
  label: string
}

interface DeskSelectorProps {
  entries: DeskEntry[]
  /** Rows on no desk; the selector ends with them while there are any. */
  deskless: number
  selection: DeskSelection
  onSelect: (selection: DeskSelection) => void
}

/**
 * Which desk a sheet lists (Slice 47, B6): a trough built like the view toggle,
 * after it. Absent with one desk and nothing on no desk — there is nothing to
 * choose. A fifth desk turns it into a select, which still names every entry.
 * Viewers have it too: choosing what to read is not an edit (P7).
 */
export function DeskSelector({ entries, deskless, selection, onSelect }: DeskSelectorProps) {
  if (entries.length <= 1 && deskless === 0) return null
  const noDesk = `No desk · ${deskless}`

  if (entries.length > 4) {
    return (
      <Select
        size="sm"
        aria-label="Desk"
        className="w-auto"
        value={String(selection)}
        onChange={(event) => onSelect(event.target.value === 'none' ? 'none' : Number(event.target.value))}
      >
        {entries.map((entry) => (
          <option key={entry.desk.id} value={entry.desk.id}>
            {entry.label}
          </option>
        ))}
        {deskless > 0 && <option value="none">{noDesk}</option>}
      </Select>
    )
  }

  return (
    <div role="group" aria-label="Desk" className="inline-flex shrink-0 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
      {entries.map((entry) => (
        <Button
          key={entry.desk.id}
          size="sm"
          variant={selection === entry.desk.id ? 'default' : 'ghost'}
          onClick={() => onSelect(entry.desk.id)}
          className="h-6 px-2 font-mono text-xs tabular-nums"
        >
          {entry.label}
        </Button>
      ))}
      {deskless > 0 && (
        <Button
          size="sm"
          variant={selection === 'none' ? 'default' : 'ghost'}
          onClick={() => onSelect('none')}
          className={selection === 'none' ? 'h-6 px-2 text-xs' : 'h-6 px-2 text-xs text-amber-300'}
        >
          {noDesk}
        </Button>
      )}
    </div>
  )
}
