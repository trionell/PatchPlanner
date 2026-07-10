import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createOutputDevice, deleteOutputDevice, updateOutputDevice } from '../../api/audioPatch'
import { itemLabel, toOptionalNumber } from '../../lib/utils'
import type { InventoryItem, OutputDevice, OwnedItem } from '../../types'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

/**
 * Manager for the event's declared shared output devices (Slice 10 US2) —
 * same create/rename/delete shape as StageboxMultiSection/BusSection.
 * Declared once here, referenced by position from any output channel's
 * chain (the "shared" device_source option on a device hop); counted once
 * on the rental order regardless of how many chains reference it.
 * Deleting a device clears the reference on every hop that pointed at it
 * instead of being blocked (matches stagebox/stage-multi delete behavior).
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

  const add = () => {
    const name = draftName.trim()
    if (!name || !draftItemId) return
    createM.mutate({
      name,
      inventory_item_id: draftSource === 'inventory' ? draftItemId : undefined,
      owned_item_id: draftSource === 'owned' ? draftItemId : undefined,
    })
    setDraftName('')
    setDraftItemId(undefined)
  }

  const remove = (device: OutputDevice) => {
    if (confirm(`Delete shared device "${device.name}"? Any chain hop referencing it will show a gap instead of being blocked.`)) {
      deleteM.mutate(device.id)
    }
  }

  const itemName = (device: OutputDevice) => {
    if (device.inventory_item_id) return audioItems.find((item) => item.id === device.inventory_item_id)?.name ?? itemLabel({ name: `Item #${device.inventory_item_id}` })
    if (device.owned_item_id) return ownedItems.find((item) => item.id === device.owned_item_id)?.name ?? `Owned #${device.owned_item_id}`
    return '—'
  }

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>Shared output devices</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-zinc-400">
          Declare a device once (a multichannel headphone amp, a distro rack…) and reference it from any output channel's chain — counted once on the rental order no matter how many chains use it.
        </p>
        {devices.map((device) => (
          <div key={device.id} className="flex items-center gap-2">
            <Input
              key={`${device.id}-${device.name}`}
              defaultValue={device.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== device.name) updateM.mutate({ id: device.id, data: { name, inventory_item_id: device.inventory_item_id, owned_item_id: device.owned_item_id } })
              }}
              className="flex-1"
            />
            <span className="min-w-40 text-sm text-zinc-400">{itemName(device)}</span>
            <Button size="sm" variant="ghost" aria-label={`Delete ${device.name}`} onClick={() => remove(device)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2">
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
          <Button size="sm" onClick={add} disabled={!draftName.trim() || !draftItemId}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>
        {(createM.error ?? updateM.error ?? deleteM.error) && (
          <p className="text-sm text-red-400">{(createM.error ?? updateM.error ?? deleteM.error)?.message}</p>
        )}
      </CardContent>
    </Card>
  )
}
