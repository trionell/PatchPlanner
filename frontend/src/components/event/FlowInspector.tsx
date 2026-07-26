import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Trash2, X } from 'lucide-react'
import { createInputSource, deleteInputSource, updateInputSource } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { derivedSourceColor, sourcePorts, type PortRef } from '../../lib/inputGraph'
import { buildInputChannelFlow } from '../../lib/inputSignalFlow'
import { toOptionalNumber } from '../../lib/utils'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, InventoryItem, StageMulti, Stagebox } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

/** What the canvas has selected — a node, not a port. */
export interface FlowSelection {
  kind: PortRef['kind']
  id: number
}

interface FlowInspectorProps {
  eventId: number
  selection: FlowSelection
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
 * The Flow view's one editor (Slice 23 FR-032). It replaces the sheet's row
 * editor when the canvas is showing, and for a source it holds every field the
 * old Sources card held — mic, stand, connector, width, phantom power — which
 * is what allowed that card to be retired rather than merely relocated.
 *
 * A source still has no colour picker: its colour is always derived from
 * whichever channels it reaches, and the "Reaches" line below states that
 * relationship explicitly rather than leaving the user to read it off the
 * cables.
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

  const title = source
    ? source.name
    : selection.kind === 'stagebox'
      ? stageboxes.find((box) => box.id === selection.id)?.name ?? 'Stagebox'
      : selection.kind === 'stage_multi'
        ? stageMultis.find((multi) => multi.id === selection.id)?.name ?? 'Stage multi'
        : selection.kind === 'device'
          ? devices.find((device) => device.id === selection.id)?.name ?? 'Device'
          : selection.kind === 'console_local'
            ? consoles.find((console) => console.id === selection.id)?.name || 'Console'
            : 'Channels'

  return (
    <aside className="w-64 shrink-0 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          {source && <Badge variant={source.kind === 'mic' ? 'mic' : 'line'}>{source.kind}</Badge>}
          <h4 className="mt-1 text-sm font-semibold text-zinc-100">{title}</h4>
        </div>
        <button aria-label="Close inspector" className="text-zinc-500 hover:text-zinc-200" onClick={onClose} type="button">
          <X className="h-4 w-4" />
        </button>
      </div>

      {source ? (
        <>
          <Field label="Name">
            <Input
              defaultValue={source.name}
              disabled={readOnly}
              key={`${source.id}-name`}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== source.name) saveSource({ name })
              }}
            />
          </Field>
          <Field label="Kind">
            <Select value={source.kind} disabled={readOnly} onChange={(event) => saveSource({ kind: event.target.value as InputSource['kind'] })}>
              <option value="mic">Mic</option>
              <option value="line">Line</option>
            </Select>
          </Field>
          {source.kind === 'mic' && (
            <>
              <Field label="Mic">
                <Select value={source.mic_item_id ?? ''} disabled={readOnly} onChange={(event) => saveSource({ mic_item_id: toOptionalNumber(event.target.value) })}>
                  <option value="">—</option>
                  {micItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Stand">
                <Select value={source.stand_item_id ?? ''} disabled={readOnly} onChange={(event) => saveSource({ stand_item_id: toOptionalNumber(event.target.value) })}>
                  <option value="">—</option>
                  {standItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={source.phantom_power}
                  disabled={readOnly}
                  onChange={(event) => saveSource({ phantom_power: event.target.checked })}
                  className="h-4 w-4 accent-red-500"
                />
                48 V phantom power
              </label>
            </>
          )}
          <Field label="Connector">
            <Select value={source.connector_type} disabled={readOnly} onChange={(event) => saveSource({ connector_type: event.target.value })}>
              <option value="">—</option>
              {options('preamp_connectors', source.connector_type).map((value) => (
                <option key={value.value} value={value.value}>
                  {value.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Width">
            <Select value={source.width} disabled={readOnly} onChange={(event) => saveSource({ width: event.target.value as InputSource['width'] })}>
              <option value="mono">Mono</option>
              <option value="stereo">Stereo</option>
            </Select>
          </Field>

          <Reaches source={source} channels={channels} devices={devices} stageboxes={stageboxes} stageMultis={stageMultis} consoles={consoles} cables={cables} itemLabelById={itemLabelById} />

          {!readOnly && (
            <div className="flex gap-2 border-t border-zinc-800 pt-2">
              <Button
                size="sm"
                variant="outline"
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
                <Copy className="mr-2 h-4 w-4" />Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Delete source"
                onClick={() => {
                  if (window.confirm(`Delete source “${source.name}”? Any cable connected to it is removed with it.`)) {
                    remove.mutate(source.id)
                    onClose()
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-zinc-500">
          Rig gear is edited in the Rig drawer — it is declared once per event and shared by both audio tabs. Select a source to edit it here.
        </p>
      )}

      <Legend />

      {(update.error ?? create.error ?? remove.error) && (
        <p className="text-xs text-red-400">{(update.error ?? create.error ?? remove.error)?.message}</p>
      )}
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

/**
 * Where this source actually lands — the question the whole graph exists to
 * answer, stated in words so it doesn't have to be traced by eye.
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
    <div className="space-y-1 border-t border-zinc-800 pt-2">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">Reaches</span>
      {reached.length === 0 ? (
        <p className="text-xs text-zinc-500">Nothing yet — this source doesn't land on a channel.</p>
      ) : (
        <p className="text-xs" style={color ? { color } : undefined}>
          {reached.map((channel) => `ch ${channel.channel_number}${channel.channel_name ? ` ${channel.channel_name}` : ''}`).join(', ')}
        </p>
      )}
      <p className="font-mono text-[10px] text-zinc-500">
        {ports.length} {ports.length === 1 ? 'port' : 'ports'}
        {source.phantom_power ? ' · 48 V on' : ''}
      </p>
    </div>
  )
}

/** The two encodings a run carries, spelled out once. */
function Legend() {
  return (
    <div className="space-y-1 border-t border-zinc-800 pt-2 text-[10px] text-zinc-500">
      <p className="uppercase tracking-wide">Legend</p>
      <p>Colour — the channel this run reaches</p>
      <p>Dashed long — network hop, no cable</p>
      <p>Dashed grey — reaches no channel</p>
      <p>
        <span className="mr-1 inline-block h-[3px] w-2 rounded-sm bg-red-500 align-middle" />
        48 V on
      </p>
    </div>
  )
}
