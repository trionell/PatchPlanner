import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { inviteMember, listMembers, removeMember, updateMemberRole } from '../../api/eventMembers'
import { listUsers } from '../../api/users'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'

const ROLE_BADGE: Record<string, string> = { owner: 'success', contributor: 'default', viewer: 'warning' }

interface EventMembersDialogProps {
  eventId: number
  open: boolean
  onClose: () => void
}

/**
 * Invite picker + members list for one event. Known users (anyone who has
 * signed in at least once) already on the member list are filtered out of
 * the invite picker client-side (research.md R6) — the server has no
 * "exclude already-invited" query of its own.
 */
export function EventMembersDialog({ eventId, open, onClose }: EventMembersDialogProps) {
  const queryClient = useQueryClient()
  const membersQuery = useQuery({ queryKey: ['event-members', eventId], queryFn: () => listMembers(eventId), enabled: open })
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: open })

  const [selectedUserId, setSelectedUserId] = useState<number | ''>('')
  const [selectedRole, setSelectedRole] = useState<'contributor' | 'viewer'>('contributor')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['event-members', eventId] })

  const inviteM = useMutation({
    mutationFn: () => inviteMember(eventId, Number(selectedUserId), selectedRole),
    onSuccess: () => {
      invalidate()
      setSelectedUserId('')
    },
  })
  const updateRoleM = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'contributor' | 'viewer' }) => updateMemberRole(eventId, userId, role),
    onSuccess: invalidate,
  })
  const removeM = useMutation({
    mutationFn: (userId: number) => removeMember(eventId, userId),
    onSuccess: invalidate,
  })

  const members = membersQuery.data ?? []
  const availableUsers = useMemo(() => {
    const memberIds = new Set((membersQuery.data ?? []).map((m) => m.userId))
    return (usersQuery.data ?? []).filter((u) => !memberIds.has(u.id))
  }, [membersQuery.data, usersQuery.data])

  return (
    <Dialog open={open} onClose={onClose} title="Manage access">
      <div className="space-y-5">
        <div>
          <h4 className="mb-2 text-sm font-medium text-zinc-300">People with access</h4>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {member.pictureUrl && (
                    <img src={member.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
                  )}
                  <div>
                    <div className="text-sm text-zinc-100">{member.name}</div>
                    <div className="text-xs text-zinc-500">{member.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'owner' ? (
                    <Badge variant={ROLE_BADGE.owner}>Owner</Badge>
                  ) : (
                    <>
                      <Select
                        value={member.role}
                        onChange={(e) =>
                          updateRoleM.mutate({ userId: member.userId, role: e.target.value as 'contributor' | 'viewer' })
                        }
                        options={[
                          { label: 'Contributor', value: 'contributor' },
                          { label: 'Viewer', value: 'viewer' },
                        ]}
                        className="h-8 w-32 text-xs"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeM.mutate(member.userId)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <h4 className="mb-2 text-sm font-medium text-zinc-300">Invite someone</h4>
          {availableUsers.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Everyone who has signed in is already on this event. New people must sign in at least once before they
              can be invited.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                options={[
                  { label: 'Choose a person...', value: '' },
                  ...availableUsers.map((u) => ({ label: `${u.name} (${u.email})`, value: u.id })),
                ]}
                className="flex-1"
              />
              <Select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as 'contributor' | 'viewer')}
                options={[
                  { label: 'Contributor', value: 'contributor' },
                  { label: 'Viewer', value: 'viewer' },
                ]}
                className="w-36"
              />
              <Button disabled={!selectedUserId || inviteM.isPending} onClick={() => inviteM.mutate()}>
                Invite
              </Button>
            </div>
          )}
          {inviteM.error && (
            <p className="mt-2 text-sm text-red-400">
              {inviteM.error instanceof Error ? inviteM.error.message : 'Failed to invite'}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
