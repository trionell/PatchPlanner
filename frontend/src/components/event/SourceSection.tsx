import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createInputSource, deleteInputSource, updateInputSource } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { derivedSourceColor } from '../../lib/inputGraph'
import { toOptionalNumber } from '../../lib/utils'
import type { InputCable, InputChannel, InputDevice, InputSource, InventoryItem, StageMulti, Stagebox } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

/**
 * Manager for input Sources — the physical origin of a signal (a
 * microphone on a stand, or a bare line/instrument output). Mic model,
 * stand, and phantom power are shown only for a "mic" Source; a "line"
 * Source exposes only a connector type. Never shows a color picker — a
 * Source's color is always derived from whichever Channel(s) it reaches
 * (research.md R9), reflected via the left-edge/tint styling only.
 */
export function SourceSection({
  eventId,
  sources,
  micItems,
  standItems,
  channels,
  devices,
  stageboxes,
  stageMultis,
  cables,
  readOnly = false,
}: {
  eventId: number
  sources: InputSource[]
  micItems: InventoryItem[]
  standItems: InventoryItem[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const colorContext = { channels, devices, stageboxes, stageMultis, cables }
  const { options } = useReferenceData(eventId)
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const createM = useMutation({ mutationFn: (data: Omit<InputSource, 'id' | 'event_id'>) => createInputSource(eventId, data), onSuccess: invalidate })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: Omit<InputSource, 'id' | 'event_id'> }) => updateInputSource(eventId, id, data), onSuccess: invalidate })
  const deleteM = useMutation({ mutationFn: (id: number) => deleteInputSource(eventId, id), onSuccess: invalidate })

  const saveField = (source: InputSource, patch: Partial<InputSource>) => {
    const merged = { ...source, ...patch }
    // Switching to "line" clears the mic-only fields client-side, ahead
    // of the server's own clearing (FR: kind switch never silently
    // retains mic state) — matches the immediate-feedback convention
    // used elsewhere in this tab (ColorSelect, BusMultiSelect).
    if (merged.kind === 'line') {
      merged.mic_item_id = undefined
      merged.stand_item_id = undefined
      merged.phantom_power = false
    }
    updateM.mutate({
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

  const addSource = () => {
    // New nodes land staggered, not stacked on the canvas origin — the
    // tech drags them into place afterward.
    const position_x = 24
    const position_y = 24 + sources.length * 32
    createM.mutate({
      name: `Source ${sources.length + 1}`,
      kind: 'line',
      phantom_power: false,
      connector_type: '',
      width: 'mono',
      position_x,
      position_y,
    })
  }

  const remove = (source: InputSource) => {
    if (confirm(`Delete source "${source.name}"? Any cable connected to it will be removed instead of being blocked.`)) {
      deleteM.mutate(source.id)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Sources</CardTitle>
        {!readOnly && <Button size="sm" onClick={addSource}><Plus className="mr-2 h-4 w-4" />Add source</Button>}
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm text-zinc-400">
          The physical origin of a signal — a mic on a stand, or a bare line/instrument output. Mic pick, stand, 48V and connector live here; color does not — it's inherited from whichever channel(s) this source feeds.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {['Name', 'Kind', 'Mic', 'Stand', '48V', 'Connector', 'Width', ''].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => {
                const color = derivedSourceColor(source, colorContext)
                return (
                <TableRow key={source.id} style={color ? { backgroundColor: `${color}0f` } : undefined}>
                  <TableCell style={color ? { boxShadow: `inset 3px 0 0 0 ${color}` } : undefined}>
                    <Input
                      defaultValue={source.name}
                      disabled={readOnly}
                      onBlur={(e) => {
                        const name = e.target.value.trim()
                        if (name && name !== source.name) saveField(source, { name })
                      }}
                      className="min-w-36"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="min-w-24 space-y-2">
                      <Badge variant={source.kind === 'mic' ? 'mic' : 'line'}>{source.kind}</Badge>
                      <Select value={source.kind} disabled={readOnly} onChange={(e) => saveField(source, { kind: e.target.value as InputSource['kind'] })}>
                        <option value="mic">Mic</option>
                        <option value="line">Line</option>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    {source.kind === 'mic' ? (
                      <Select value={source.mic_item_id ?? ''} disabled={readOnly} onChange={(e) => saveField(source, { mic_item_id: toOptionalNumber(e.target.value) })} className="min-w-40">
                        <option value="">—</option>
                        {micItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </Select>
                    ) : (
                      <span className="px-2 text-xs text-zinc-500">— (no mic)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {source.kind === 'mic' ? (
                      <Select value={source.stand_item_id ?? ''} disabled={readOnly} onChange={(e) => saveField(source, { stand_item_id: toOptionalNumber(e.target.value) })} className="min-w-36">
                        <option value="">—</option>
                        {standItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </Select>
                    ) : (
                      <span className="px-2 text-xs text-zinc-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {source.kind === 'mic' ? (
                      <input
                        type="checkbox"
                        checked={source.phantom_power}
                        disabled={readOnly}
                        onChange={(e) => saveField(source, { phantom_power: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select value={source.connector_type} disabled={readOnly} onChange={(e) => saveField(source, { connector_type: e.target.value })} className="min-w-28">
                      <option value="">—</option>
                      {options('preamp_connectors', source.connector_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={source.width} disabled={readOnly} onChange={(e) => saveField(source, { width: e.target.value as InputSource['width'] })} className="min-w-24">
                      <option value="mono">Mono</option>
                      <option value="stereo">Stereo</option>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => remove(source)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {(createM.error ?? updateM.error ?? deleteM.error) && (
          <p className="mt-2 text-sm text-red-400">{(createM.error ?? updateM.error ?? deleteM.error)?.message}</p>
        )}
      </CardContent>
    </Card>
  )
}
