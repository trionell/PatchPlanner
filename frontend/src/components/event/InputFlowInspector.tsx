import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { createInputSource, deleteInputSource, updateInputSource } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { derivedSourceColor, sourcePorts, type PortRef } from '../../lib/inputGraph'
import { buildInputChannelFlow } from '../../lib/inputSignalFlow'
import { toOptionalNumber } from '../../lib/utils'
import { vocabularyTint } from '../../lib/vocabularyTint'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, InventoryItem, StageMulti, Stagebox } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../ui/Input'
import { Pill } from '../ui/SheetTable'
import { Select } from '../ui/Select'
import { Field, Legend, Note, type LegendRow } from './graph/InspectorRail'
import { useInspectorControlSize } from './graph/inspectorTier'
import { InspectorFrame } from './graph/InspectorFrame'
import { PHANTOM_BAR } from './graph/tokens'

/** What the canvas has selected — a node, not a port. */
export interface InputFlowSelection {
  kind: PortRef['kind']
  id: number
}

interface FlowInspectorProps {
  eventId: number
  selection: InputFlowSelection
  sources: InputSource[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  consoles: Console[]
  cables: InputCable[]
  micItems: InventoryItem[]
  standItems: InventoryItem[]
  itemLabelById: Map<number, string>
  onClose: () => void
  onChanged: () => Promise<void>
  readOnly?: boolean
}

/**
 * The inputs Flow view's one editor (Slice 23 FR-032), rebuilt to the mockup's rail
 * (Slice 25 US4) and built on the shared rail since Slice 26.
 *
 * A rail with a left border rather than a floating card, every field beside a short
 * label in one narrow column rather than under it, what the source reaches and what
 * the canvas's line styles mean each in a bordered note, and the destructive actions
 * pinned to the bottom out of the way of the fields. Those five parts now live in
 * `graph/InspectorRail` because the outputs canvas has a rail too, and a second copy
 * of them is how the two would drift.
 *
 * For a source it holds every field the old Sources card held — mic, stand,
 * connector, width, phantom power — which is what allowed that card to be retired
 * rather than merely relocated. A source still has no colour picker: its colour is
 * always derived from whichever channels it reaches, and the "Reaches" note states
 * that relationship rather than leaving it to be read off the cables.
 */
export function FlowInspector({
  eventId,
  selection,
  sources,
  channels,
  devices,
  stageboxes,
  stageMultis,
  consoles,
  cables,
  micItems,
  standItems,
  itemLabelById,
  onClose,
  onChanged,
  readOnly = false,
}: FlowInspectorProps) {
  const queryClient = useQueryClient()
  const { options } = useReferenceData(eventId)
  // The rail's controls are `sm` on a desk and `md` in a hand — the one surface in the
  // application where a phone's geometry is not already the default, because a 240 px
  // column cannot afford 40 px rows (tokens.md §7 amendment 2; research R9).
  const ctl = useInspectorControlSize()
  const dense = ctl === 'sm'
  // The id being confirmed, not a boolean: the rail's subject can change under it
  // (deleted from the sheet in another window, refetched away), and an open confirm
  // that silently re-aims at a different source is the one outcome a confirm exists
  // to prevent.
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
    await onChanged()
  }
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<InputSource, 'id' | 'event_id'> }) => updateInputSource(eventId, id, data),
    onSuccess: invalidate,
  })
  const create = useMutation({
    mutationFn: (data: Omit<InputSource, 'id' | 'event_id'>) => createInputSource(eventId, data),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: number) => deleteInputSource(eventId, id), onSuccess: invalidate })

  const source = selection.kind === 'source' ? sources.find((candidate) => candidate.id === selection.id) : undefined

  const saveSource = (patch: Partial<InputSource>) => {
    if (!source) return
    const merged = { ...source, ...patch }
    // Switching to "line" clears the mic-only fields client-side, ahead of the
    // server's own clearing — the same immediate-feedback convention the old
    // Sources card used.
    if (merged.kind === 'line') {
      merged.mic_item_id = undefined
      merged.stand_item_id = undefined
      merged.phantom_power = false
    }
    update.mutate({
      id: source.id,
      data: {
        name: merged.name,
        kind: merged.kind,
        mic_item_id: merged.mic_item_id,
        stand_item_id: merged.stand_item_id,
        phantom_power: merged.phantom_power,
        connector_type: merged.connector_type,
        width: merged.width,
        position_x: merged.position_x,
        position_y: merged.position_y,
      },
    })
  }

  const { heading, title } = describe(selection, { sources, stageboxes, stageMultis, devices, consoles })

  return (
    <>
      <InspectorFrame
        heading={heading}
        onClose={onClose}
        pill={source && <Pill className={vocabularyTint(source.kind)}>{source.kind}</Pill>}
      >
        {source ? (
          <>
            <Input
              size={ctl}
              className={dense ? 'h-7 font-semibold' : 'font-semibold'}
              defaultValue={source.name}
              disabled={readOnly}
              key={`${source.id}-name`}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== source.name) saveSource({ name })
              }}
            />

            <Field label="Kind">
              <Select size={ctl} value={source.kind} disabled={readOnly} onChange={(event) => saveSource({ kind: event.target.value as InputSource['kind'] })}>
                <option value="mic">Mic</option>
                <option value="line">Line</option>
              </Select>
            </Field>
            {source.kind === 'mic' && (
              <>
                <Field label="Mic">
                  <Select size={ctl} value={source.mic_item_id ?? ''} disabled={readOnly} onChange={(event) => saveSource({ mic_item_id: toOptionalNumber(event.target.value) })}>
                    <option value="">—</option>
                    {micItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Stand">
                  <Select size={ctl} value={source.stand_item_id ?? ''} disabled={readOnly} onChange={(event) => saveSource({ stand_item_id: toOptionalNumber(event.target.value) })}>
                    <option value="">—</option>
                    {standItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="48 V">
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={source.phantom_power}
                      disabled={readOnly}
                      onChange={(event) => saveSource({ phantom_power: event.target.checked })}
                      className="h-3.5 w-3.5 accent-red-500"
                    />
                    <span className={source.phantom_power ? PHANTOM_BAR : 'inline-block h-[3px] w-2 rounded-sm bg-zinc-700'} />
                    {source.phantom_power ? 'on' : 'off'}
                  </label>
                </Field>
              </>
            )}
            <Field label="Conn">
              <Select size={ctl} value={source.connector_type} disabled={readOnly} onChange={(event) => saveSource({ connector_type: event.target.value })}>
                <option value="">—</option>
                {options('preamp_connectors', source.connector_type).map((value) => (
                  <option key={value.value} value={value.value}>
                    {value.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Width">
              <Select size={ctl} value={source.width} disabled={readOnly} onChange={(event) => saveSource({ width: event.target.value as InputSource['width'] })}>
                <option value="mono">Mono</option>
                <option value="stereo">Stereo</option>
              </Select>
            </Field>

            <Reaches source={source} channels={channels} devices={devices} stageboxes={stageboxes} stageMultis={stageMultis} consoles={consoles} cables={cables} itemLabelById={itemLabelById} />
            <Legend rows={INPUT_LEGEND} />

            {!readOnly && (
              <div className="mt-auto flex gap-2">
                <Button
                  size={dense ? 'sm' : 'md'}
                  variant="outline"
                  className={dense ? 'h-7 px-2.5 text-xs' : undefined}
                  onClick={() =>
                    create.mutate({
                      name: `${source.name} copy`,
                      kind: source.kind,
                      mic_item_id: source.mic_item_id,
                      stand_item_id: source.stand_item_id,
                      phantom_power: source.phantom_power,
                      connector_type: source.connector_type,
                      width: source.width,
                      position_x: source.position_x,
                      position_y: source.position_y + 24,
                    })
                  }
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />Duplicate
                </Button>
                <Button
                  size={dense ? 'sm' : 'md'}
                  variant="ghost"
                  className={dense ? 'h-7 px-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-red-400 hover:bg-red-500/10 hover:text-red-300'}
                  onClick={() => setConfirmingDelete(source.id)}
                >
                  Delete
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-zinc-100">{title}</p>
            <Note label="Edited in the Rig drawer">
              <span className="text-[11px] leading-snug text-zinc-400">
                Rig gear is declared once per event and shared by both audio tabs. Select a source to edit it here.
              </span>
            </Note>
            <Legend rows={INPUT_LEGEND} />
          </>
        )}

        {(update.error ?? create.error ?? remove.error) && (
          <p className="text-[11px] text-red-400">{(update.error ?? create.error ?? remove.error)?.message}</p>
        )}
      </InspectorFrame>

      {/* A sibling of the frame, not a child of it: on a phone the frame is a bottom
          sheet, and a centred overlay nested inside a scrolling sheet body is a
          stacking question nobody should have to answer twice. */}
      {source && (
        <ConfirmDialog
          open={confirmingDelete === source.id}
          title="Delete source"
          onCancel={() => setConfirmingDelete(null)}
          onConfirm={() => {
            setConfirmingDelete(null)
            remove.mutate(source.id)
            onClose()
          }}
        >
          “{source.name}” will be deleted. Any cable connected to it is removed with it.
        </ConfirmDialog>
      )}
    </>
  )
}

/**
 * What this canvas's lines mean. The strokes are the shared rail's; the words are
 * this graph's — here a run's colour says which *channel* it reaches, and 48 V is a
 * property only an input can have (Slice 26 R5).
 */
const INPUT_LEGEND: LegendRow[] = [
  { kind: 'cable', meaning: 'cable, reaching that channel' },
  { kind: 'network', meaning: 'network hop, no cable' },
  { kind: 'unpatched', meaning: 'reaches no channel' },
  { kind: 'phantom', meaning: '48 V on' },
]

/** What the rail is showing, resolved against whichever collection the node is in. */
function describe(
  selection: InputFlowSelection,
  context: { sources: InputSource[]; stageboxes: Stagebox[]; stageMultis: StageMulti[]; devices: InputDevice[]; consoles: Console[] },
): { heading: string; title: string } {
  switch (selection.kind) {
    case 'source':
      return { heading: 'Source', title: context.sources.find((s) => s.id === selection.id)?.name ?? 'Source' }
    case 'stagebox':
      return { heading: 'Stagebox', title: context.stageboxes.find((box) => box.id === selection.id)?.name ?? 'Stagebox' }
    case 'stage_multi':
      return { heading: 'Stage multi', title: context.stageMultis.find((multi) => multi.id === selection.id)?.name ?? 'Stage multi' }
    case 'device':
      return { heading: 'Device', title: context.devices.find((device) => device.id === selection.id)?.name ?? 'Device' }
    case 'console_local':
      return {
        heading: 'Local jacks',
        title: `${context.consoles.find((desk) => desk.id === selection.id)?.name || 'Console'} · local jacks`,
      }
    default:
      // A `channel` node: a desk's own channel rail, or the box holding rows that
      // belong to no desk (id 0).
      return {
        heading: 'Desk',
        title: selection.id > 0 ? context.consoles.find((desk) => desk.id === selection.id)?.name || 'Console' : 'Channels with no desk',
      }
  }
}



/**
 * Where this source actually lands — the question the whole graph exists to answer,
 * stated in words so it doesn't have to be traced by eye.
 */
function Reaches({
  source,
  channels,
  devices,
  stageboxes,
  stageMultis,
  consoles,
  cables,
  itemLabelById,
}: {
  source: InputSource
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  consoles: Console[]
  cables: InputCable[]
  itemLabelById: Map<number, string>
}) {
  const context = { sources: [source], channels, devices, stageboxes, stageMultis, consoles, cables, itemLabelById }
  const reached = channels.filter((channel) =>
    buildInputChannelFlow(channel, { ...context, sources: [source] }).paths.some((path) => path.sourceName === source.name),
  )
  const color = derivedSourceColor(source, { channels, devices, stageboxes, stageMultis, cables })
  const ports = sourcePorts(source)

  return (
    <Note label="Reaches">
      {reached.length === 0 ? (
        <span className="text-[11px] text-zinc-500">Nothing yet — this source doesn't land on a channel.</span>
      ) : (
        <span className="font-mono text-[11px]" style={color ? { color } : undefined}>
          {reached.map((channel) => `ch ${channel.channel_number}${channel.channel_name ? ` ${channel.channel_name}` : ''}`).join(', ')}
        </span>
      )}
      <span className="font-mono text-[10px] text-zinc-500">
        {ports.length} {ports.length === 1 ? 'port' : 'ports'}
        {source.phantom_power ? ' · 48 V on' : ''}
      </span>
    </Note>
  )
}

