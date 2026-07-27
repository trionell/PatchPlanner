import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createDCA, createGroup, deleteDCA, deleteGroup, updateDCA, updateGroup } from '../../api/audioPatch'
import { busTint } from '../../lib/utils'
import type { BusRequest, InputChannel } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DrawerSection, FieldStack, FormActions, GearCard, GearForm, GearSpecs, GearTop, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { ColorSelect } from './ColorSelect'

interface Bus {
  id: number
  name: string
  color?: string
  is_builtin?: boolean
}

/**
 * Managers for the event's mix groups and DCAs (the stagebox/multi manager
 * pattern). LR is built-in: recolorable, never renamed or deleted. Deleting
 * an assigned bus asks for confirmation with the affected-channel count.
 */
export function BusSection({
  eventId,
  groups,
  dcas,
  channels,
  readOnly = false,
}: {
  eventId: number
  groups: Bus[]
  dcas: Bus[]
  channels: InputChannel[]
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
  }

  const createGroupM = useMutation({ mutationFn: (d: BusRequest) => createGroup(eventId, d), onSuccess: invalidate })
  const updateGroupM = useMutation({ mutationFn: ({ id, d }: { id: number; d: BusRequest }) => updateGroup(eventId, id, d), onSuccess: invalidate })
  const deleteGroupM = useMutation({ mutationFn: (id: number) => deleteGroup(eventId, id), onSuccess: invalidate })
  const createDcaM = useMutation({ mutationFn: (d: BusRequest) => createDCA(eventId, d), onSuccess: invalidate })
  const updateDcaM = useMutation({ mutationFn: ({ id, d }: { id: number; d: BusRequest }) => updateDCA(eventId, id, d), onSuccess: invalidate })
  const deleteDcaM = useMutation({ mutationFn: (id: number) => deleteDCA(eventId, id), onSuccess: invalidate })

  const assignedChannels = (ids: (number[] | undefined)[], busID: number) =>
    ids.filter((memberships) => memberships?.includes(busID)).length

  return (
    // Stacked full width in the Buses drawer, in the same language as every Rig
    // section (Slice 24 FR-017) — one Card left in here would have been the one
    // section a planner could pick out as different.
    <>
      <BusManagerSection
        eventId={eventId}
        title="Groups"
        noun="group"
        buses={groups}
        assignedCount={(id) => assignedChannels(channels.map((channel) => channel.group_ids), id)}
        onCreate={(d) => createGroupM.mutate(d)}
        onUpdate={(id, d) => updateGroupM.mutate({ id, d })}
        onDelete={(id) => deleteGroupM.mutate(id)}
        error={createGroupM.error ?? updateGroupM.error ?? deleteGroupM.error}
        readOnly={readOnly}
      />
      <BusManagerSection
        eventId={eventId}
        title="DCAs"
        noun="DCA"
        buses={dcas}
        assignedCount={(id) => assignedChannels(channels.map((channel) => channel.dca_ids), id)}
        onCreate={(d) => createDcaM.mutate(d)}
        onUpdate={(id, d) => updateDcaM.mutate({ id, d })}
        onDelete={(id) => deleteDcaM.mutate(id)}
        error={createDcaM.error ?? updateDcaM.error ?? deleteDcaM.error}
        readOnly={readOnly}
      />
    </>
  )
}

function BusManagerSection({
  eventId,
  title,
  noun,
  buses,
  assignedCount,
  onCreate,
  onUpdate,
  onDelete,
  error,
  readOnly = false,
}: {
  eventId: number
  title: string
  noun: string
  buses: Bus[]
  assignedCount: (id: number) => number
  onCreate: (d: BusRequest) => void
  onUpdate: (id: number, d: BusRequest) => void
  onDelete: (id: number) => void
  error: Error | null
  readOnly?: boolean
}) {
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const add = () => {
    if (!draftName.trim()) return
    onCreate({ name: draftName.trim(), color: draftColor || undefined })
    setDraftName('')
    setDraftColor('')
    setAdding(false)
  }

  const remove = (bus: Bus) => {
    const count = assignedCount(bus.id)
    const usage = count > 0 ? ` ${count} channel${count === 1 ? ' is' : 's are'} assigned to it.` : ''
    if (confirm(`Delete ${noun} "${bus.name}"?${usage}`)) onDelete(bus.id)
  }

  return (
    <DrawerSection
      label={title}
      count={buses.length}
      action={
        !readOnly && (
          <Button size="xs" variant="outline" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {noun}
          </Button>
        )
      }
    >
      {buses.map((bus) => {
        const assigned = assignedCount(bus.id)
        const editing = editingId === bus.id && !readOnly
        return (
          <GearCard key={bus.id}>
            <GearTop
              badge={
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 rounded border border-zinc-600"
                  style={bus.color ? { backgroundColor: bus.color } : undefined}
                />
              }
              name={bus.name}
              item={bus.is_builtin ? <Badge style={busTint(bus.color)}>built-in</Badge> : undefined}
              actions={
                !readOnly && (
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(editing ? null : bus.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                )
              }
            />
            <GearSpecs>
              <Spec label="channels" value={assigned} />
            </GearSpecs>

            {/* The built-in LR bus is recolourable but never renamed or deleted,
                so its form is a colour picker and nothing else. */}
            {editing && (
              <GearForm>
                <FieldStack label="Colour" width="short">
                  <ColorSelect eventId={eventId} value={bus.color} onChange={(color) => onUpdate(bus.id, { name: bus.name, color })} />
                </FieldStack>
                {!bus.is_builtin && (
                  <>
                    <FieldStack label="Name" width="grow">
                      <Input
                        size="sm"
                        key={`${bus.id}-${bus.name}`}
                        defaultValue={bus.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim()
                          if (name && name !== bus.name) onUpdate(bus.id, { name, color: bus.color })
                        }}
                      />
                    </FieldStack>
                    <FormActions>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => remove(bus)}
                      >
                        Delete
                      </Button>
                    </FormActions>
                  </>
                )}
              </GearForm>
            )}
          </GearCard>
        )
      })}

      {adding && !readOnly && (
        <GearForm>
          <FieldStack label="Colour" width="short">
            <ColorSelect eventId={eventId} value={draftColor || undefined} onChange={setDraftColor} />
          </FieldStack>
          <FieldStack label="Name" width="grow">
            <Input
              size="sm"
              value={draftName}
              placeholder={`New ${noun} name`}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
            />
          </FieldStack>
          <FormActions>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={add} disabled={!draftName.trim()}>
              Add {noun}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </FormActions>
        </GearForm>
      )}

      {error && <p className="text-xs text-red-400">{error.message}</p>}
    </DrawerSection>
  )
}
