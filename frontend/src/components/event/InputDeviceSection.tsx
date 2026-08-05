import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createInputDevice, deleteInputDevice, updateInputDevice } from '../../api/audioPatch'
import type { InputDevice, InventoryItem, OwnedItem } from '../../types'
import { DeviceSection, type DeviceDraftData } from './DeviceSection'

/**
 * Input-side processing devices — a DI box or similar gear with an input side and
 * an output side. A separate table from the output graph's devices
 * (`input_devices`), so the two directional graphs never share a device row
 * (Slice 12 research.md R3); declared once here and wired into the input graph on
 * the canvas, counted once on the rental order however many cables reference it.
 *
 * The list itself is `DeviceSection`, shared with the two output-side sections
 * since Slice 24 — they were three near-identical copies, which is how they came
 * to look like three different things.
 */
export function InputDeviceSection({
  eventId,
  devices,
  audioItems,
  ownedItems,
  readOnly = false,
}: {
  eventId: number
  devices: InputDevice[]
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
    mutationFn: (data: Omit<InputDevice, 'id' | 'event_id'>) => createInputDevice(eventId, data),
    onSuccess: invalidate,
  })
  const updateM = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<InputDevice, 'id' | 'event_id'> }) => updateInputDevice(eventId, id, data),
    onSuccess: invalidate,
  })
  const deleteM = useMutation({ mutationFn: (id: number) => deleteInputDevice(eventId, id), onSuccess: invalidate })

  return (
    <DeviceSection<InputDevice>
      eventId={eventId}
      label="Processing devices"
      addNoun="Device"
      tag="on inputs"
      devices={devices}
      audioItems={audioItems}
      ownedItems={ownedItems}
      connectorVocabulary="preamp_connectors"
      minInputs={1}
      withOutputs
      onCreate={(data: DeviceDraftData) => createM.mutate(data)}
      onUpdate={(id, data) => updateM.mutate({ id, data })}
      onDelete={(device) => deleteM.mutate(device.id)}
      error={createM.error ?? updateM.error ?? deleteM.error}
      readOnly={readOnly}
    />
  )
}
