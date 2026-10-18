import { Fragment, useMemo, useState } from 'react'
import { cellAllowed, mixLabel, mixOver, mixesOfKind, ruleOf, slotWidth, sourcesOf } from '../../../lib/deskRouting'
import { busTint, cn } from '../../../lib/utils'
import { stripLabel } from '../../../lib/deskStrips'
import type { DeskMix, DeskModel, DeskRoute, InputChannel, MixKind } from '../../../types'
import { Button } from '../../ui/Button'
import { FieldStack, FormActions, GearForm } from '../../ui/GearList'
import { Input } from '../../ui/Input'
import { MicroLabel } from '../../ui/Label'
import { Select } from '../../ui/Select'
import { ColorSelect } from '../ColorSelect'

export interface MixSave {
  mix: DeskMix
  fields: { name: string; width: DeskMix['width']; color?: string; slot: number }
  sources: { kind: 'channel' | 'mix'; id: number }[]
}

interface RoutingGridProps {
  eventId: number
  model: DeskModel
  kind: MixKind
  channels: InputChannel[]
  mixes: DeskMix[]
  routes: DeskRoute[]
  search: string
  readOnly: boolean
  pending?: boolean
  error?: string
  onSave: (save: MixSave) => void
  onDelete: (mix: DeskMix) => void
}

interface GridRow {
  key: string
  kind: 'channel' | MixKind
  id: number
  slot: number
  label: string
  number: string
  color?: string
}

/** The run of mix rows a table takes, from the rules: e.g. groups into Mains, buses and mains into Matrices. */
const SOURCE_MIX_KINDS: MixKind[] = ['main', 'subgroup', 'monitor', 'fx', 'matrix']

/**
 * One Desk Routing table (Slice 48, C3): columns are this kind's mixes in slot order,
 * rows are what can feed them, and a square is a route. A cell the desk can never
 * route is hatched with no control. A column edits like a row: open its head, and
 * its fields sit above the grid and its cells become controls; Save writes both.
 */
export function RoutingGrid({ eventId, model, kind, channels, mixes, routes, search, readOnly, pending, error, onSave, onDelete }: RoutingGridProps) {
  const columns = mixesOfKind(mixes, kind)
  const [openId, setOpenId] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ sources: Set<string>; name: string; width: DeskMix['width']; color?: string; slot: number } | null>(null)
  const [showAllChannels, setShowAllChannels] = useState(false)
  const open = columns.find((mix) => mix.id === openId)

  const channelRows: GridRow[] = useMemo(
    () =>
      ruleOf(model, 'channel', kind) === 'no'
        ? []
        : channels.map((channel) => ({
            key: `channel:${channel.id}`,
            kind: 'channel' as const,
            id: channel.id,
            slot: 0,
            label: channel.channel_name || 'unnamed',
            number: stripLabel(model, channel),
            color: channel.color,
          })),
    [channels, kind, model],
  )
  const mixRows: GridRow[] = SOURCE_MIX_KINDS.filter((source) => ruleOf(model, source, kind) !== 'no').flatMap((source) =>
    mixesOfKind(mixes, source).map((mix) => ({ key: `mix:${mix.id}`, kind: source, id: mix.id, slot: mix.slot, label: mixLabel(mix), number: '', color: mix.color })),
  )

  // An LV1 matrix folds its channel rows to the ones in use (§05); "Show all" unfolds.
  const folded = kind === 'matrix' && model.engine === 'lv1' && !showAllChannels
  const usedHere = new Set(routes.filter((route) => route.dst_kind === 'mix' && columns.some((mix) => mix.id === route.dst_id)).map((route) => `${route.src_kind}:${route.src_id}`))
  const q = search.trim().toLowerCase()
  const visibleChannels = channelRows.filter((row) => (!folded || usedHere.has(row.key) || draft?.sources.has(row.key)) && (!q || row.label.toLowerCase().includes(q) || row.number.includes(q)))
  const hiddenChannels = channelRows.length - channelRows.filter((row) => usedHere.has(row.key)).length

  const openColumn = (mix: DeskMix) => {
    if (readOnly) return
    setOpenId(mix.id)
    setDraft({ sources: sourcesOf(routes, mix.id), name: mix.name, width: mix.width, color: mix.color, slot: mix.slot })
  }
  const close = () => {
    setOpenId(null)
    setDraft(null)
  }
  const toggle = (row: GridRow) => {
    if (!draft) return
    const next = new Set(draft.sources)
    if (next.has(row.key)) next.delete(row.key)
    else next.add(row.key)
    setDraft({ ...draft, sources: next })
  }
  const save = () => {
    if (!open || !draft) return
    const sources = [...draft.sources].map((key) => {
      const [srcKind, id] = key.split(':')
      return { kind: srcKind as 'channel' | 'mix', id: Number(id) }
    })
    onSave({ mix: open, fields: { name: draft.name, width: draft.width, color: draft.color, slot: draft.slot }, sources })
    close()
  }

  if (columns.length === 0) return null

  const cell = (row: GridRow, mix: DeskMix) => {
    const allowed = cellAllowed(model, { kind: row.kind, slot: row.slot, id: row.id }, mix)
    const key = row.key
    const on = mix.id === openId && draft ? draft.sources.has(key) : sourcesOf(routes, mix.id).has(key)
    const editing = mix.id === openId
    if (!allowed) {
      return <td key={mix.id} className="border-l border-zinc-800/60 bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(113,113,122,0.18)_3px_4px)]" aria-label="cannot route" />
    }
    return (
      <td key={mix.id} className={cn('border-l border-zinc-800/60 text-center', editing && 'bg-amber-500/[0.06]')}>
        {editing ? (
          <button
            type="button"
            aria-pressed={on}
            aria-label={`${row.label} → ${mixLabel(mix)}`}
            onClick={() => toggle(row)}
            className="inline-flex h-6 w-6 items-center justify-center"
          >
            <span className={cn('block h-2.5 w-2.5 border', on ? 'border-amber-400 bg-amber-400' : 'border-zinc-600')} />
          </button>
        ) : (
          on && <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: mix.color || '#f59e0b' }} />
        )}
      </td>
    )
  }

  return (
    <div className="space-y-2">
      {open && draft && (
        <div className="px-3 pt-3">
          <GearForm>
            <FieldStack label={open.kind === 'main' ? 'Main' : 'Slot'} width="count">
              {open.kind === 'main' ? (
                <span className="flex h-8 items-center font-mono text-xs text-zinc-300">{open.slot}</span>
              ) : (
                <Input size="sm" type="number" min={1} value={draft.slot} onChange={(event) => setDraft({ ...draft, slot: Number(event.target.value) || draft.slot })} />
              )}
            </FieldStack>
            <FieldStack label="Name" width="grow">
              <Input size="sm" autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </FieldStack>
            {open.kind !== 'main' && open.kind !== 'dca' && open.kind !== 'mute' && !(model.engine === 'lv1' && open.kind === 'subgroup') && (
              <FieldStack label="Width" width="short">
                <Select size="sm" value={draft.width} onChange={(event) => setDraft({ ...draft, width: event.target.value as DeskMix['width'] })}>
                  <option value="mono">Mono</option>
                  <option value="stereo">Stereo</option>
                </Select>
              </FieldStack>
            )}
            <FieldStack label="Tape" width="short">
              <ColorSelect eventId={eventId} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            </FieldStack>
            <FormActions>
              <Button size="sm" className="h-8 px-4 text-xs" disabled={pending} onClick={save}>
                Save {mixLabel(open)}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={close}>
                Cancel
              </Button>
              {open.kind !== 'main' && (
                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => onDelete(open)}>
                  Delete
                </Button>
              )}
            </FormActions>
          </GearForm>
          {kind === 'matrix' && model.engine === 'lv1' && (
            <p className="mt-1 font-mono text-[10px] text-zinc-500">{draft.sources.size}/12 sources</p>
          )}
        </div>
      )}
      {error && <p className="mx-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="sticky left-0 z-10 bg-zinc-950 px-2 py-1.5 text-left font-normal">
                <MicroLabel>Source</MicroLabel>
              </th>
              {columns.map((mix) => {
                const over = mixOver(model, mix)
                const head = (
                  <span className="flex flex-col items-center gap-0.5">
                    <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                      {slotWidth(model, mix) === 2 ? `${mix.slot}–${mix.slot + 1}` : mix.slot}
                    </span>
                    <span className={cn('max-w-20 truncate', over ? 'text-red-400' : 'text-zinc-200')} style={busTint(mix.color)}>
                      {mixLabel(mix)}
                    </span>
                    {over && <span className="font-mono text-[10px] text-red-400">over</span>}
                  </span>
                )
                return (
                  <th key={mix.id} className={cn('border-l border-zinc-800/60 px-1.5 py-1.5 font-normal', mix.id === openId && 'bg-amber-500/[0.08]')}>
                    {readOnly ? (
                      head
                    ) : (
                      <button type="button" className="w-full rounded px-1 hover:bg-zinc-800/60" onClick={() => (mix.id === openId ? close() : openColumn(mix))}>
                        {head}
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleChannels.map((row, index) => (
              <tr key={row.key} className={cn('border-b border-zinc-800/40', index % 2 === 1 && 'bg-white/[0.014]')}>
                <RowHead row={row} />
                {columns.map((mix) => cell(row, mix))}
              </tr>
            ))}
            {folded && hiddenChannels > 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-2 py-1.5">
                  <button type="button" className="text-xs text-amber-300 hover:text-amber-200" onClick={() => setShowAllChannels(true)}>
                    Show all {channelRows.length} channels
                  </button>
                </td>
              </tr>
            )}
            {mixRows.length > 0 && (
              <Fragment>
                <tr>
                  <td colSpan={columns.length + 1} className="px-2 pb-1 pt-3">
                    <MicroLabel>{kind === 'subgroup' ? 'Groups' : 'Mixes'}</MicroLabel>
                  </td>
                </tr>
                {mixRows.map((row, index) => (
                  <tr key={row.key} className={cn('border-b border-zinc-800/40', index % 2 === 1 && 'bg-white/[0.014]')}>
                    <RowHead row={row} />
                    {columns.map((mix) => cell(row, mix))}
                  </tr>
                ))}
              </Fragment>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowHead({ row }: { row: GridRow }) {
  return (
    <th className="sticky left-0 z-10 whitespace-nowrap bg-zinc-950 px-2 py-1 text-left font-normal text-zinc-200">
      {row.number && <span className="mr-1.5 font-mono text-[11px] tabular-nums text-zinc-500">{row.number}</span>}
      <span style={row.kind !== 'channel' ? busTint(row.color) : undefined}>{row.label}</span>
    </th>
  )
}
