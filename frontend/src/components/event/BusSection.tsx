import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createDCA, createGroup, deleteDCA, deleteGroup, updateDCA, updateGroup } from '../../api/audioPatch'
import { busTint } from '../../lib/utils'
import type { BusRequest, InputChannel } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
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
}: {
  eventId: number
  groups: Bus[]
  dcas: Bus[]
  channels: InputChannel[]
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
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <BusManagerCard
        title="Groups"
        noun="group"
        buses={groups}
        assignedCount={(id) => assignedChannels(channels.map((channel) => channel.group_ids), id)}
        onCreate={(d) => createGroupM.mutate(d)}
        onUpdate={(id, d) => updateGroupM.mutate({ id, d })}
        onDelete={(id) => deleteGroupM.mutate(id)}
        error={createGroupM.error ?? updateGroupM.error ?? deleteGroupM.error}
      />
      <BusManagerCard
        title="DCAs"
        noun="DCA"
        buses={dcas}
        assignedCount={(id) => assignedChannels(channels.map((channel) => channel.dca_ids), id)}
        onCreate={(d) => createDcaM.mutate(d)}
        onUpdate={(id, d) => updateDcaM.mutate({ id, d })}
        onDelete={(id) => deleteDcaM.mutate(id)}
        error={createDcaM.error ?? updateDcaM.error ?? deleteDcaM.error}
      />
    </div>
  )
}

function BusManagerCard({
  title,
  noun,
  buses,
  assignedCount,
  onCreate,
  onUpdate,
  onDelete,
  error,
}: {
  title: string
  noun: string
  buses: Bus[]
  assignedCount: (id: number) => number
  onCreate: (d: BusRequest) => void
  onUpdate: (id: number, d: BusRequest) => void
  onDelete: (id: number) => void
  error: Error | null
}) {
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState('')

  const add = () => {
    if (!draftName.trim()) return
    onCreate({ name: draftName.trim(), color: draftColor || undefined })
    setDraftName('')
    setDraftColor('')
  }

  const remove = (bus: Bus) => {
    const count = assignedCount(bus.id)
    const usage = count > 0 ? ` ${count} channel${count === 1 ? ' is' : 's are'} assigned to it.` : ''
    if (confirm(`Delete ${noun} "${bus.name}"?${usage}`)) onDelete(bus.id)
  }

  return (
    <Card className="mb-0">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {buses.map((bus) => (
          <div key={bus.id} className="flex items-center gap-2">
            <ColorSelect value={bus.color} onChange={(color) => onUpdate(bus.id, { name: bus.name, color })} />
            {bus.is_builtin ? (
              <>
                <span className="flex-1 px-3 text-sm">{bus.name}</span>
                <Badge style={busTint(bus.color)}>built-in</Badge>
              </>
            ) : (
              <>
                <Input
                  key={`${bus.id}-${bus.name}`}
                  defaultValue={bus.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== bus.name) onUpdate(bus.id, { name, color: bus.color })
                  }}
                  className="flex-1"
                />
                <Button size="sm" variant="ghost" aria-label={`Delete ${bus.name}`} onClick={() => remove(bus)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2">
          <ColorSelect value={draftColor || undefined} onChange={setDraftColor} />
          <Input
            value={draftName}
            placeholder={`New ${noun} name`}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            className="flex-1"
          />
          <Button size="sm" onClick={add} disabled={!draftName.trim()}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
      </CardContent>
    </Card>
  )
}
