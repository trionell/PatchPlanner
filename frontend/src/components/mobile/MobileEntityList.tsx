import { useMemo, useState } from 'react'
import { Pencil, Plus, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CondensedListRow } from './CondensedListRow'

export interface MobileEntityRow {
  id: number
  /** Channel/output/fixture number or ID, shown as a small mono prefix. */
  number: number | string
  name: string
  subtitle: string
  color?: string
}

/**
 * Shared searchable, condensed, tap-to-edit list backing the mobile Audio
 * Inputs, Audio Outputs, and Lighting Rig sections (contracts/mobile-ui-
 * contract.md's `MobileChannelList`/`MobileFixtureList` — one component,
 * since all three are the same shape: rows differ only in what `number`,
 * `subtitle`, and `color` mean for that entity).
 */
export function MobileEntityList({
  items,
  onSelect,
  onAdd,
  readOnly,
  searchPlaceholder,
  addLabel,
  emptyLabel,
}: {
  items: MobileEntityRow[]
  onSelect: (id: number) => void
  onAdd?: () => void
  readOnly: boolean
  searchPlaceholder: string
  addLabel: string
  emptyLabel: string
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || String(item.number).toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
    )
  }, [items, query])

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="h-9 pl-8 text-sm" />
        </div>
        {/* Hidden, not disabled, for a viewer-role user (FR-015) — there is nothing to tap into that does nothing. */}
        {!readOnly && onAdd && (
          <Button size="sm" onClick={onAdd} title={addLabel} className="h-9 w-9 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {filtered.map((item) => (
          <CondensedListRow
            key={item.id}
            title={
              <>
                <span className="mr-1.5 font-mono text-[11px] text-amber-400">{item.number}</span>
                {item.name}
              </>
            }
            subtitle={item.subtitle}
            accentColor={item.color}
            onClick={readOnly ? undefined : () => onSelect(item.id)}
            trailing={!readOnly && <Pencil className="h-3.5 w-3.5 text-zinc-500" />}
          />
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-zinc-500">{items.length === 0 ? emptyLabel : 'No matches.'}</p>
        )}
      </div>
    </div>
  )
}
