import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import type { ReferenceValue } from '../types'
import { Button } from './ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Input } from './ui/Input'

/**
 * One vocabulary's add/rename/delete card — shared presentation for both
 * an event's own Settings tab and a user's personal "My Defaults" page
 * (Slice 17). The caller owns which API (event-scoped or template-scoped)
 * the callbacks hit; this component only renders and manages the add-row
 * draft state.
 */
export function VocabularyCard({
  title,
  values,
  onCreate,
  onRename,
  onDelete,
  readOnly = false,
}: {
  title: string
  values: ReferenceValue[]
  onCreate: (value: string, label: string) => Promise<unknown>
  onRename: (id: number, label: string) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState({ value: '', label: '' })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  // The raw stored value is a debugging/reference detail — on a phone it
  // costs more width than it's worth, so the label input gets the room instead.
  const isMobile = useIsMobile()

  async function run(action: () => Promise<unknown>, onDone?: () => void) {
    setPending(true)
    setError('')
    try {
      await action()
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="space-y-2">
          {values.map((value) => (
            <div key={value.id} className="flex items-center gap-2">
              <Input
                key={`${value.id}-${value.label}`}
                defaultValue={value.label}
                disabled={readOnly}
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label && label !== value.label) void run(() => onRename(value.id, label))
                }}
                className="flex-1"
              />
              {!isMobile && (
                <code className="w-32 truncate text-xs text-zinc-500" title={value.value}>{value.value}</code>
              )}
              {!readOnly && (
                <Button size="sm" variant="ghost" title="Delete value" onClick={() => void run(() => onDelete(value.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {values.length === 0 && <p className="text-sm text-zinc-500">No values — dropdowns for this vocabulary are empty.</p>}
        </div>
        {!readOnly && (
          <div className="flex items-end gap-2 border-t border-zinc-800 pt-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-400">Label</label>
              <Input value={draft.label} onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder="DMX 5-pin" />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs text-zinc-400">Value (stored)</label>
              <Input value={draft.value} onChange={(e) => setDraft((prev) => ({ ...prev, value: e.target.value }))} placeholder="dmx5" />
            </div>
            <Button
              size="sm"
              disabled={!draft.value.trim() || !draft.label.trim() || pending}
              onClick={() => void run(() => onCreate(draft.value, draft.label), () => setDraft({ value: '', label: '' }))}
            >
              <Plus className="mr-2 h-4 w-4" />Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
