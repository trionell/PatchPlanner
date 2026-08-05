import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createOutputDevice, deleteOutputDevice, updateOutputDevice } from '../../api/audioPatch'
import type { InventoryItem, OutputDevice, OwnedItem } from '../../types'
import { DeviceSection, type DeviceDraftData } from './DeviceSection'

/**
 * `DeviceRow` keeps link ports optional so `InputDevice`, which has no such
 * column, satisfies it too. `OutputDevice` requires them, so they are defaulted
 * here at the boundary rather than by weakening either type.
 */
const asOutputDevice = (data: DeviceDraftData): Omit<OutputDevice, 'id' | 'event_id'> => ({
  ...data,
  link_port_count: data.link_port_count ?? 0,
})

/**
 * True destination gear — only an input side (speakers, IEM packs, powered
 * wedges). It asks for no output side at all, since `output_port_count` is what
 * puts a device in this list rather than in `ProcessingDeviceSection`. It is the
 * one list that declares link-out ports, because daisy-chaining is a destination's
 * habit: sub → sub → top.
 */
export function TrueOutputDeviceSection({
  eventId,
  devices,
  audioItems,
  ownedItems,
  readOnly = false,
}: {
  eventId: number
  devices: OutputDevice[]
  audioItems: InventoryItem[]
  ownedItems: OwnedItem[]
  readOnly?: boolean
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

  const destinations = useMemo(() => devices.filter((device) => device.output_port_count === 0), [devices])

  return (
    <DeviceSection<OutputDevice>
      eventId={eventId}
      label="Destinations"
      addNoun="Destination"
      tag="on outputs"
      devices={destinations}
      audioItems={audioItems}
      ownedItems={ownedItems}
      connectorVocabulary="preamp_connectors"
      linkVocabulary="speaker_cable_types"
      minInputs={1}
      withOutputs={false}
      onCreate={(data) => createM.mutate(asOutputDevice(data))}
      onUpdate={(id, data) => updateM.mutate({ id, data: asOutputDevice(data) })}
      onDelete={(device) => deleteM.mutate(device.id)}
      error={createM.error ?? updateM.error ?? deleteM.error}
      readOnly={readOnly}
    />
  )
}
