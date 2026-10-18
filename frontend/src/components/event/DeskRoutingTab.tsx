import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LayoutGrid, Plus, Search, Table2 } from 'lucide-react'
import { createDeskMix, deleteDeskMix, fillRecorder, getAudioPatch, setRecorderRoutes, updateDeskMix } from '../../api/audioPatch'
import { useDeskModels } from '../../hooks/useDeskModels'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePatchView } from '../../hooks/usePatchView'
import { useRoutingTable } from '../../hooks/useRoutingTable'
import { useSelectedDesk } from '../../hooks/useSelectedDesk'
import {
  ROUTING_TABLES,
  TABLE_KIND,
  cellAllowed,
  deskMixes,
  mixLabel,
  mixesOfKind,
  playsNowhere,
  poolFill,
  recorderTracks,
  sourcesOf,
  tableLabel,
  type RoutingTable,
} from '../../lib/deskRouting'
import { deskLabel, orderChannels, stripLabel } from '../../lib/deskStrips'
import { cn } from '../../lib/utils'
import type { DeskMix, DeskModel, DeskRoute, MixKind } from '../../types'
import { MobilePicker } from '../mobile/MobilePicker'
import { CondensedListRow } from '../mobile/CondensedListRow'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../ui/Input'
import { MobilePanel } from '../ui/MobilePanel'
import { PatchPanel } from '../ui/PatchPanel'
import { Sheet } from '../ui/Sheet'
import { DeskSelector } from './DeskSelector'
import { DeskRoutingCanvas } from './routing/DeskRoutingCanvas'
import { RecorderTable } from './routing/RecorderTable'
import { RoutingGrid, type MixSave } from './routing/RoutingGrid'
import { StatusStrip } from './StatusStrip'

/** The kinds + Mix offers, by engine: LV1 16 has no groups and no Mon. */
function addableKinds(model: DeskModel): MixKind[] {
  const kinds: MixKind[] = ['subgroup', 'monitor', 'fx', 'matrix', 'dca', 'mute']
  if (model.engine !== 'lv1') return kinds
  return kinds.filter((kind) => (kind === 'subgroup' ? model.groups > 0 : kind === 'monitor' ? model.mon > 0 : true))
}

const KIND_NOUN: Record<MixKind, string> = { main: 'Main', subgroup: 'Subgroup', monitor: 'Monitor', fx: 'FX send', matrix: 'Matrix', dca: 'DCA', mute: 'Mute group' }

/**
 * Desk Routing (Slice 48): one desk's insides, a table at a time — or, in Flow, drawn.
 * The desk is the selection the audio sheets share (B6); a mix cannot exist off a desk,
 * so there is no No desk entry here.
 */
export function DeskRoutingTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const { modelOf } = useDeskModels()
  const isMobile = useIsMobile()
  const { openTab } = useEventTab()
  const [view, setView] = usePatchView(eventId, 'routing')
  const [table, setTable] = useRoutingTable(eventId)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [pendingDelete, setPendingDelete] = useState<DeskMix | null>(null)
  const [phoneMix, setPhoneMix] = useState<DeskMix | null>(null)

  const consoles = audioQuery.data?.consoles ?? []
  const allMixes = audioQuery.data?.mixes ?? []
  const routes = audioQuery.data?.routes ?? []
  const [selection, selectDesk] = useSelectedDesk(eventId, consoles, false)
  const desk = typeof selection === 'number' ? consoles.find((candidate) => candidate.id === selection) : undefined
  const model = desk ? modelOf(desk) : undefined
  const mixes = desk ? deskMixes(allMixes, desk.id) : []
  const deskRoutes = desk ? routes.filter((route) => route.console_id === desk.id) : []
  const channels = desk ? orderChannels((audioQuery.data?.input_channels ?? []).filter((channel) => channel.console_id === desk.id)) : []
  const outputs = desk ? (audioQuery.data?.outputs ?? []).filter((output) => output.console_id === desk.id) : []

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
  }
  const onError = (err: Error) => setError(err.message)
  const create = useMutation({
    mutationFn: (kind: MixKind) => createDeskMix(eventId, desk!.id, { kind }),
    onSuccess: async (mix) => {
      setAdding(false)
      setError(undefined)
      const kindTable = ROUTING_TABLES.find((candidate) => candidate !== 'recorder' && TABLE_KIND[candidate] === mix.kind)
      if (kindTable) setTable(kindTable)
      await invalidate()
    },
    onError,
  })
  const save = useMutation({
    mutationFn: ({ mix, fields, sources }: MixSave) => updateDeskMix(eventId, mix.id, { ...fields, sources }),
    onSuccess: async () => {
      setError(undefined)
      await invalidate()
    },
    onError,
  })
  const remove = useMutation({ mutationFn: (mix: DeskMix) => deleteDeskMix(eventId, mix.id), onSuccess: invalidate, onError })
  const recorder = useMutation({
    mutationFn: (next: Parameters<typeof setRecorderRoutes>[2]) => setRecorderRoutes(eventId, desk!.id, next),
    onSuccess: invalidate,
    onError,
  })
  const fill = useMutation({ mutationFn: () => fillRecorder(eventId, desk!.id), onSuccess: invalidate, onError })

  const selectTable = (next: RoutingTable) => {
    setError(undefined)
    setTable(next)
  }
  const deskEntries = consoles.map((candidate) => ({ desk: candidate, label: deskLabel(candidate, modelOf(candidate)) }))
  const nowhere = playsNowhere(mixes, deskRoutes)

  if (audioQuery.isLoading) return <p className="text-sm text-zinc-400">Loading …</p>

  if (!desk || !model) {
    return (
      /* A fact about the plan, not an error: amber (tokens.md §5). Rig lives on the audio tabs. */
      <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-200">
        Desk routing belongs to a desk, and this event has none yet. Add the desk in Rig first.
        {!readOnly && (
          <Button size="xs" variant="outline" className="ml-2" onClick={() => openTab('audio-inputs')}>
            Open Rig
          </Button>
        )}
      </div>
    )
  }

  const kind = table === 'recorder' ? undefined : TABLE_KIND[table]
  const strip = (
    <StatusStrip tint={nowhere.length > 0 ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-zinc-800 bg-zinc-950/60'}>
      <span className="font-mono tabular-nums text-zinc-300">{deskLabel(desk, model)}</span>
      <span className="font-mono tabular-nums text-zinc-500">{mixes.filter((mix) => mix.kind !== 'main').length} mixes</span>
      {nowhere.length > 0 && (
        <span className="text-amber-300">
          {nowhere.length} {nowhere.length === 1 ? 'mix plays' : 'mixes play'} nowhere: {nowhere.slice(0, 3).map(mixLabel).join(', ')}
        </span>
      )}
    </StatusStrip>
  )

  const confirm = (
    <ConfirmDialog
      open={pendingDelete != null}
      title="Delete mix"
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => {
        if (pendingDelete) remove.mutate(pendingDelete)
        setPendingDelete(null)
      }}
    >
      {pendingDelete && (
        <>
          <span className="text-zinc-200">{mixLabel(pendingDelete)}</span> is removed from {desk.name || 'the desk'}, with every route to and from it.
        </>
      )}
    </ConfirmDialog>
  )

  if (isMobile) {
    const tableOptions = ROUTING_TABLES.map((candidate) => ({ id: candidate, label: tableLabel(candidate, model), hint: candidate === 'recorder' ? undefined : poolFill(model, mixes, TABLE_KIND[candidate]) }))
    const rows = kind ? mixesOfKind(mixes, kind) : []
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobilePanel
          title={
            consoles.length > 1 ? (
              <MobilePicker label="Desk" title="Desk" variant="title" options={deskEntries.map((entry) => ({ id: entry.desk.id, label: entry.label }))} value={desk.id} onChange={(id) => selectDesk(Number(id))} />
            ) : (
              'Desk Routing'
            )
          }
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Find a mix…"
          actions={<MobilePicker label="Table" title="Table" options={tableOptions} value={table} onChange={(id) => selectTable(id as RoutingTable)} />}
          primaryAction={
            !readOnly && kind && kind !== 'main' ? (
              <button aria-label={`Add ${KIND_NOUN[kind]}`} className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950" onClick={() => create.mutate(kind)} type="button">
                <Plus className="h-5 w-5" />
              </button>
            ) : undefined
          }
          strip={strip}
        >
          {error && <p className="mx-3 my-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
          {table === 'recorder' ? (
            <RecorderTable desk={desk} model={model} channels={channels} mixes={mixes} routes={deskRoutes} readOnly={readOnly} pending={recorder.isPending || fill.isPending} onSave={(next) => recorder.mutate(next)} onFill={() => fill.mutate()} />
          ) : (
            <>
              {rows.length === 0 && <p className="px-3 py-3 text-sm text-zinc-500">{emptyLine(table, model)}</p>}
              {rows.map((mix) => (
                <CondensedListRow
                  key={mix.id}
                  title={
                    <>
                      <span className="mr-1.5 font-mono text-xs tabular-nums text-amber-400">{mix.slot}</span>
                      {mixLabel(mix)}
                    </>
                  }
                  subtitle={`${sourcesOf(deskRoutes, mix.id).size} sources`}
                  accentColor={mix.color}
                  onClick={() => setPhoneMix(mix)}
                />
              ))}
            </>
          )}
        </MobilePanel>
        {phoneMix && (
          <PhoneMixSheet
            mix={phoneMix}
            model={model}
            channels={channels}
            mixes={mixes}
            routes={deskRoutes}
            readOnly={readOnly}
            onClose={() => setPhoneMix(null)}
            onSave={(sources) => {
              save.mutate({ mix: phoneMix, fields: { name: phoneMix.name, width: phoneMix.width, color: phoneMix.color, slot: phoneMix.slot }, sources })
              setPhoneMix(null)
            }}
          />
        )}
        {confirm}
      </div>
    )
  }

  return (
    <div className="print:hidden">
      <PatchPanel
        bar={
          <>
            <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Desk routing</span>
            <div className="inline-flex shrink-0 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
              <Button size="sm" variant={view === 'sheet' ? 'default' : 'ghost'} onClick={() => setView('sheet')} className="h-6 px-2 text-xs">
                <Table2 className="mr-1.5 h-3.5 w-3.5" />Sheet
              </Button>
              <Button size="sm" variant={view === 'flow' ? 'default' : 'ghost'} onClick={() => setView('flow')} className="h-6 px-2 text-xs">
                <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />Flow
              </Button>
            </div>
            {/* C1: Flow here draws one desk's inside, so the selector stays in both views. */}
            <DeskSelector entries={deskEntries} deskless={0} selection={desk.id} onSelect={(next) => typeof next === 'number' && selectDesk(next)} />
            <div className="relative min-w-[10rem] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input size="sm" className="pl-7" placeholder="Find a channel or mix…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <span className="flex-1" />
            {!readOnly && view === 'sheet' && (
              <span className="relative">
                <Button size="xs" onClick={() => setAdding((open) => !open)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />Mix
                </Button>
                {adding && (
                  /* + Mix asks the type first, then takes the first legal free slot. */
                  <span className="absolute right-0 top-8 z-20 flex w-44 flex-col rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                    {addableKinds(model).map((candidate) => (
                      <button key={candidate} type="button" className="rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800" onClick={() => create.mutate(candidate)}>
                        {candidate === 'subgroup' && model.engine === 'lv1' ? 'Group' : KIND_NOUN[candidate]}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            )}
          </>
        }
      >
        {view === 'flow' ? (
          <DeskRoutingCanvas
            desk={desk}
            model={model}
            channels={channels}
            mixes={mixes}
            routes={deskRoutes}
            outputs={outputs}
            search={search}
            onOpenTable={(next) => {
              selectTable(next)
              setView('sheet')
            }}
          />
        ) : (
          <>
            {/* C2: the index row — one table at a time, each with its pool's fill. */}
            <div role="tablist" className="flex flex-wrap gap-x-4 gap-y-1 border-b border-zinc-800 px-3 pt-2">
              {ROUTING_TABLES.map((candidate) => (
                <button
                  key={candidate}
                  role="tab"
                  aria-selected={candidate === table}
                  type="button"
                  onClick={() => selectTable(candidate)}
                  className={cn('-mb-px flex items-baseline gap-1.5 border-b-2 pb-1.5 text-xs', candidate === table ? 'border-amber-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200')}
                >
                  {tableLabel(candidate, model)}
                  <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                    {candidate === 'recorder' ? (desk.recorder ? `${recorderTracks(model, desk)}` : '—') : poolFill(model, mixes, TABLE_KIND[candidate])}
                  </span>
                </button>
              ))}
            </div>
            {table === 'recorder' ? (
              <RecorderTable
                desk={desk}
                model={model}
                channels={channels}
                mixes={mixes}
                routes={deskRoutes}
                readOnly={readOnly}
                pending={recorder.isPending || fill.isPending}
                error={error}
                onSave={(next) => recorder.mutate(next)}
                onFill={() => fill.mutate()}
              />
            ) : mixesOfKind(mixes, kind!).length === 0 ? (
              <div className="px-3 py-3 text-xs text-zinc-500">
                {error && <p className="mb-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-red-300">{error}</p>}
                {emptyLine(table, model)}
                {!readOnly && kind !== 'main' && addableKinds(model).includes(kind!) && (
                  <Button size="xs" variant="outline" className="ml-2" onClick={() => create.mutate(kind!)}>
                    + {KIND_NOUN[kind!]}
                  </Button>
                )}
              </div>
            ) : (
              <RoutingGrid
                key={`${desk.id}:${table}`}
                eventId={eventId}
                model={model}
                kind={kind!}
                channels={channels}
                mixes={mixes}
                routes={deskRoutes}
                search={search}
                readOnly={readOnly}
                pending={save.isPending}
                error={error}
                onSave={(next) => save.mutate(next)}
                onDelete={(mix) => setPendingDelete(mix)}
              />
            )}
            {strip}
          </>
        )}
      </PatchPanel>
      {confirm}
    </div>
  )
}

function emptyLine(table: RoutingTable, model: DeskModel): string {
  if (table === 'subgroups' && model.engine === 'lv1' && model.groups === 0) return `${model.label} has no groups.`
  if (table === 'monitors' && model.engine === 'lv1' && model.mon === 0) return `${model.label} has no Mon mixes.`
  const nouns: Record<RoutingTable, string> = {
    mains: 'mains',
    subgroups: model.engine === 'lv1' ? 'groups' : 'subgroups',
    monitors: 'monitor mixes',
    fx: 'FX sends',
    matrices: 'matrices',
    dcas: 'DCAs',
    mutes: 'mute groups',
    recorder: 'tracks',
  }
  return `No ${nouns[table]} yet.`
}

/** A mix in the hand: its sources as 44 px tick rows in a bottom sheet (Slice 48 §12). */
function PhoneMixSheet({
  mix,
  model,
  channels,
  mixes,
  routes,
  readOnly,
  onClose,
  onSave,
}: {
  mix: DeskMix
  model: DeskModel
  channels: ReturnType<typeof orderChannels>
  mixes: DeskMix[]
  routes: DeskRoute[]
  readOnly: boolean
  onClose: () => void
  onSave: (sources: { kind: 'channel' | 'mix'; id: number }[]) => void
}) {
  const [picked, setPicked] = useState(() => sourcesOf(routes, mix.id))
  const candidates = [
    ...channels
      .filter(() => cellAllowed(model, { kind: 'channel' }, mix))
      .map((channel) => ({ key: `channel:${channel.id}`, label: `${stripLabel(model, channel)} ${channel.channel_name ?? ''}` })),
    ...mixes
      .filter((source) => source.kind !== 'dca' && source.kind !== 'mute' && cellAllowed(model, { kind: source.kind, slot: source.slot, id: source.id }, mix))
      .map((source) => ({ key: `mix:${source.id}`, label: mixLabel(source) })),
  ]
  const toggle = (key: string) => {
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPicked(next)
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={mixLabel(mix)}
      footer={
        readOnly ? undefined : (
          <Button
            className="w-full"
            onClick={() =>
              onSave(
                [...picked].map((key) => {
                  const [kind, id] = key.split(':')
                  return { kind: kind as 'channel' | 'mix', id: Number(id) }
                }),
              )
            }
          >
            Save {mixLabel(mix)}
          </Button>
        )
      }
    >
      {candidates.length === 0 && <p className="text-sm text-zinc-500">Nothing on this desk can feed it.</p>}
      <div className="-mx-4">
        {candidates.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            disabled={readOnly}
            onClick={() => toggle(candidate.key)}
            className="flex min-h-11 w-full items-center gap-3 border-b border-zinc-800/60 px-4 text-left text-sm text-zinc-200"
          >
            <span className={cn('flex h-5 w-5 items-center justify-center border', picked.has(candidate.key) ? 'border-amber-400 bg-amber-400 text-zinc-950' : 'border-zinc-600')}>
              {picked.has(candidate.key) && <Check className="h-3.5 w-3.5" />}
            </span>
            {candidate.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

