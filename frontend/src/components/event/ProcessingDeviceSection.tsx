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
 * Output-side gear that has an output side — a standalone source with no inputs
 * (a signal generator), or true processing gear with both (an amplifier, a
 * distro). Gear with only an input side lives in `TrueOutputDeviceSection`
 * instead; the split mirrors the canvas's own Sources/Processing versus
 * Destinations zones, so a form never asks for fields that do not apply.
 *
 * `minInputs` is 0 here for exactly that reason: a source legitimately has none.
 */
export function ProcessingDeviceSection({
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

  const withOutputSide = useMemo(() => devices.filter((device) => device.output_port_count > 0), [devices])

  return (
    <DeviceSection<OutputDevice>
      eventId={eventId}
      label="Processing devices"
      addNoun="Device"
      tag="on outputs"
      devices={withOutputSide}
      audioItems={audioItems}
      ownedItems={ownedItems}
      connectorVocabulary="preamp_connectors"
      minInputs={0}
      withOutputs
      onCreate={(data) => createM.mutate(asOutputDevice(data))}
      onUpdate={(id, data) => updateM.mutate({ id, data: asOutputDevice(data) })}
      onDelete={(device) => {
        if (window.confirm(`Delete "${device.name}"? Any cable connected to it is removed with it.`)) deleteM.mutate(device.id)
      }}
      error={createM.error ?? updateM.error ?? deleteM.error}
      readOnly={readOnly}
    />
  )
}
