import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createOutputDevice, deleteOutputDevice, updateOutputDevice } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { itemLabel, toOptionalNumber } from '../../lib/utils'
import type { InventoryItem, OutputDevice, OwnedItem } from '../../types'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

/**
 * Manager for the event's declared shared output devices (Slice 11 US1) —
 * same create/rename/delete shape as StageboxMultiSection/BusSection, now
 * with each side's port count and connector type (the graph's node
 * shape). Declared once here, wired into the signal-flow graph by
 * drawing cables to/from it on the canvas; counted once on the rental
 * order regardless of how many cables reference it. Deleting a device
 * clears every cable that referenced it instead of being blocked (matches
 * stagebox/stage-multi delete behavior).
 */
export function OutputDeviceSection({
  eventId,
  devices,
  audioItems,
  ownedItems,
}: {
  eventId: number
  devices: OutputDevice[]
  audioItems: InventoryItem[]
  ownedItems: OwnedItem[]
}) {
  const queryClient = useQueryClient()
  const { options } = useReferenceData()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const createM = useMutation({
    mutationFn: (data: Omit<OutputDevice, 'id' | 'event_id'>) => createOutputDevice(eventId, data),
    onSuccess: invalidate,
  })
  const updateM = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<OutputDevice, 'id' | 'event_id'> }) => updateOutputDevice(eventId, id, data),
    onSuccess: invalidate,
  })
  const deleteM = useMutation({ mutationFn: (id: number) => deleteOutputDevice(eventId, id), onSuccess: invalidate })

  const [draftName, setDraftName] = useState('')
  const [draftSource, setDraftSource] = useState<'inventory' | 'owned'>('inventory')
  const [draftItemId, setDraftItemId] = useState<number | undefined>(undefined)
  const [draftInputs, setDraftInputs] = useState('0')
  const [draftInputConnector, setDraftInputConnector] = useState('')
  const [draftOutputs, setDraftOutputs] = useState('1')
  const [draftOutputConnector, setDraftOutputConnector] = useState('')

  const canAdd = draftName.trim() && draftItemId && (Number(draftInputs) > 0 || Number(draftOutputs) > 0) &&
    (Number(draftInputs) === 0 || draftInputConnector) && (Number(draftOutputs) === 0 || draftOutputConnector)

  const add = () => {
    const name = draftName.trim()
    if (!name || !draftItemId || !canAdd) return
    // New devices land in a staggered default position, not stacked on
    // the canvas origin — the tech drags them into place afterward
    // (data-model.md's state-transition note).
    const position_x = 420 + (devices.length % 3) * 220
    const position_y = 60 + Math.floor(devices.length / 3) * 160
    createM.mutate({
      name,
      inventory_item_id: draftSource === 'inventory' ? draftItemId : undefined,
      owned_item_id: draftSource === 'owned' ? draftItemId : undefined,
      input_port_count: Number(draftInputs) || 0,
      input_connector_type: Number(draftInputs) > 0 ? draftInputConnector : undefined,
      output_port_count: Number(draftOutputs) || 0,
      output_connector_type: Number(draftOutputs) > 0 ? draftOutputConnector : undefined,
      position_x,
      position_y,
    })
    setDraftName('')
    setDraftItemId(undefined)
    setDraftInputs('0')
    setDraftInputConnector('')
    setDraftOutputs('1')
    setDraftOutputConnector('')
  }

  const remove = (device: OutputDevice) => {
    if (confirm(`Delete device "${device.name}"? Any cable connected to it will be removed instead of being blocked.`)) {
      deleteM.mutate(device.id)
    }
  }

  const itemName = (device: OutputDevice) => {
    if (device.inventory_item_id) return audioItems.find((item) => item.id === device.inventory_item_id)?.name ?? itemLabel({ name: `Item #${device.inventory_item_id}` })
    if (device.owned_item_id) return ownedItems.find((item) => item.id === device.owned_item_id)?.name ?? `Owned #${device.owned_item_id}`
    return '—'
  }

  const saveField = (device: OutputDevice, patch: Partial<OutputDevice>) => {
    const merged = { ...device, ...patch }
    updateM.mutate({
      id: device.id,
      data: {
        name: merged.name,
        inventory_item_id: merged.inventory_item_id,
        owned_item_id: merged.owned_item_id,
        input_port_count: merged.input_port_count,
        input_connector_type: merged.input_connector_type,
        output_port_count: merged.output_port_count,
        output_connector_type: merged.output_connector_type,
        position_x: merged.position_x,
        position_y: merged.position_y,
      },
    })
  }

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>Output devices</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-zinc-400">
          Declare a device once (an amp, a splitter, a headphone distro…) with its port counts and connector types, then wire it into the graph below by drawing cables to/from it — counted once on the rental order no matter how many cables reference it.
        </p>
        {devices.map((device) => (
          <div key={device.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-2">
            <Input
              key={`${device.id}-name`}
              defaultValue={device.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== device.name) saveField(device, { name })
              }}
              className="min-w-0 flex-1"
            />
            <span className="min-w-32 text-sm text-zinc-400">{itemName(device)}</span>
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <span>In</span>
              <Input
                type="number"
                min={0}
                defaultValue={device.input_port_count}
                onBlur={(e) => saveField(device, { input_port_count: Number(e.target.value) || 0 })}
                className="w-14"
              />
              <Select
                value={device.input_connector_type ?? ''}
                onChange={(e) => saveField(device, { input_connector_type: e.target.value || undefined })}
                className="w-24"
                disabled={device.input_port_count === 0}
              >
                <option value="">—</option>
                {options('speaker_cable_types', device.input_connector_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <span>Out</span>
              <Input
                type="number"
                min={0}
                defaultValue={device.output_port_count}
                onBlur={(e) => saveField(device, { output_port_count: Number(e.target.value) || 0 })}
                className="w-14"
              />
              <Select
                value={device.output_connector_type ?? ''}
                onChange={(e) => saveField(device, { output_connector_type: e.target.value || undefined })}
                className="w-24"
                disabled={device.output_port_count === 0}
              >
                <option value="">—</option>
                {options('speaker_cable_types', device.output_connector_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </div>
            <Button size="sm" variant="ghost" aria-label={`Delete ${device.name}`} onClick={() => remove(device)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Input
            value={draftName}
            placeholder="New device name"
            onChange={(e) => setDraftName(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Select
            value={draftSource}
            onChange={(e) => { setDraftSource(e.target.value as 'inventory' | 'owned'); setDraftItemId(undefined) }}
            className="w-28 flex-none"
          >
            <option value="inventory">Rental</option>
            <option value="owned">Owned</option>
          </Select>
          <Select value={draftItemId ?? ''} onChange={(e) => setDraftItemId(toOptionalNumber(e.target.value))} className="w-48 flex-none">
            <option value="">—</option>
            {(draftSource === 'inventory' ? audioItems : ownedItems).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <span>In</span>
            <Input type="number" min={0} value={draftInputs} onChange={(e) => setDraftInputs(e.target.value)} className="w-14" />
            <Select value={draftInputConnector} onChange={(e) => setDraftInputConnector(e.target.value)} className="w-24" disabled={Number(draftInputs) === 0}>
              <option value="">—</option>
              {options('speaker_cable_types', draftInputConnector).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <span>Out</span>
            <Input type="number" min={0} value={draftOutputs} onChange={(e) => setDraftOutputs(e.target.value)} className="w-14" />
            <Select value={draftOutputConnector} onChange={(e) => setDraftOutputConnector(e.target.value)} className="w-24" disabled={Number(draftOutputs) === 0}>
              <option value="">—</option>
              {options('speaker_cable_types', draftOutputConnector).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </Select>
          </div>
          <Button size="sm" onClick={add} disabled={!canAdd}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>
        {(createM.error ?? updateM.error ?? deleteM.error) && (
          <p className="text-sm text-red-400">{(createM.error ?? updateM.error ?? deleteM.error)?.message}</p>
        )}
      </CardContent>
    </Card>
  )
}
