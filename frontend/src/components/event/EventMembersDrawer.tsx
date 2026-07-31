import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { inviteMember, listMembers, removeMember, updateMemberRole } from '../../api/eventMembers'
import { listUsers } from '../../api/users'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Drawer } from '../ui/Drawer'
import { DrawerSection, FieldStack, GearCard } from '../ui/GearList'
import { Pill } from '../ui/SheetTable'
import { Select } from '../ui/Select'
import type { EventMember } from '../../types'

interface EventMembersDrawerProps {
  eventId: number
  open: boolean
  onClose: () => void
  /**
   * A viewer sees the list and no control that would change it.
   *
   * This used to be defense in depth behind a hidden trigger — the *Invite*
   * button was gated, and this flag caught the case where the surface was somehow
   * reached anyway. **It is now the only client-side gate there is** (Slice 38):
   * the door is an Overview row open to every role, because who can see an event
   * is worth knowing whether or not you can change it. So the prop is passed
   * explicitly at the mount, and what a viewer may not do is decided here rather
   * than by whether they can find the way in.
   *
   * The server has refused a viewer's writes throughout, and still does.
   */
  readOnly?: boolean
}

const ROLE_OPTIONS = [
  { label: 'Contributor', value: 'contributor' },
  { label: 'Viewer', value: 'viewer' },
]

const ROLE_WORD: Record<EventMember['role'], string> = {
  owner: 'Owner',
  contributor: 'Contributor',
  viewer: 'Viewer',
}

/**
 * Who can see this event, and — for an owner or a contributor — the controls to
 * change it (Slice 38).
 *
 * **It is a `Drawer`, and it was a `Dialog` since Slice 15.** That is the whole
 * reason a phone could not reach it: a `Dialog` stays centred at every width, so
 * it has no phone form, while `ui/Drawer` *is* `ui/Sheet` below 768 px. One call
 * site therefore serves both widths, and a surface that had been desktop-only for
 * twenty-three slices acquired a phone form by being spelled correctly.
 *
 * `components.md` §`ui/Dialog` states the test it is filed under: **a `Dialog`
 * interrupts, a `Drawer` accompanies.** Nothing waits on this list — you open it
 * to work in it, and the event behind it is untouched. The one thing here that
 * *does* interrupt is the removal confirm below, which is a `Dialog` for exactly
 * the reason this is not.
 *
 * Known users already on the member list are filtered out of the invite picker
 * client-side (Slice 15 research.md R6) — the server has no "exclude
 * already-invited" query of its own.
 */
export function EventMembersDrawer({ eventId, open, onClose, readOnly = false }: EventMembersDrawerProps) {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const { user } = useCurrentUser()
  const membersQuery = useQuery({ queryKey: ['event-members', eventId], queryFn: () => listMembers(eventId), enabled: open })
  // Not for a viewer: the only thing this list feeds is the invite picker, which a
  // viewer never sees. `GET /users` is open to any signed-in caller by design, but
  // before this slice a viewer could not open this surface at all, so an unguarded
  // fetch here would be a request that did not exist yesterday.
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: open && !readOnly })

  const [selectedUserId, setSelectedUserId] = useState<number | ''>('')
  const [selectedRole, setSelectedRole] = useState<'contributor' | 'viewer'>('contributor')
  const [pendingRemoval, setPendingRemoval] = useState<EventMember | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['event-members', eventId] })

  const inviteM = useMutation({
    mutationFn: () => inviteMember(eventId, Number(selectedUserId), selectedRole),
    // `onSettled`, not `onSuccess`: an invite fails when the picker is stale —
    // someone signed in and was invited from another session — and a stale picker
    // that stays stale invites the same failure again.
    onSettled: invalidate,
    onSuccess: () => setSelectedUserId(''),
  })
  const updateRoleM = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'contributor' | 'viewer' }) => updateMemberRole(eventId, userId, role),
    onSuccess: invalidate,
  })
  const removeM = useMutation({
    mutationFn: (userId: number) => removeMember(eventId, userId),
    onSuccess: () => {
      invalidate()
      setPendingRemoval(null)
    },
  })

  const members = membersQuery.data ?? []
  const availableUsers = useMemo(() => {
    const memberIds = new Set((membersQuery.data ?? []).map((m) => m.userId))
    return (usersQuery.data ?? []).filter((u) => !memberIds.has(u.id))
  }, [membersQuery.data, usersQuery.data])

  return (
    <>
      <Drawer
        info={
          <>
            <p>
              A <strong className="font-medium text-zinc-300">contributor</strong> can change everything in this
              event. A <strong className="font-medium text-zinc-300">viewer</strong> can read it and change
              nothing.
            </p>
            <p className="mt-2">
              An invitation goes to an account, not to an email address — people appear in the picker only after
              they have signed in at least once.
            </p>
          </>
        }
        noteId="event-access"
        onClose={onClose}
        open={open}
        subtitle="Everyone here can open this event"
        title="Who has access"
        width="narrow"
      >
        <DrawerSection count={members.length} label="People">
          <div className="flex flex-col gap-1.5">
            {members.map((member) => (
              <MemberCard
                isMobile={isMobile}
                isYou={member.userId === user?.id}
                key={member.userId}
                member={member}
                onRemove={() => setPendingRemoval(member)}
                onRoleChange={(role) => updateRoleM.mutate({ userId: member.userId, role })}
                readOnly={readOnly}
              />
            ))}
          </div>
        </DrawerSection>

        {/* Absent for a viewer, never disabled — P7. A form you may not submit is a
            form that has to explain itself; an absent one does not. */}
        {!readOnly && (
          <DrawerSection label="Invite">
            {availableUsers.length === 0 ? (
              /*
                A state, not a rule — it stops being true the moment anyone new signs
                in — so it stands where the picker stood rather than joining the two
                durable sentences behind the `i` (components.md §`ui/Drawer`, the
                footer/`info` test read the other way). The heading stays, so the
                sentence has something to be the answer to.
              */
              <p className="text-sm text-zinc-500">Everyone who has signed in is already on this event.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <FieldStack label="Person" width="full">
                  <Select
                    onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                    options={[
                      { label: 'Choose a person…', value: '' },
                      ...availableUsers.map((u) => ({ label: `${u.name} (${u.email})`, value: u.id })),
                    ]}
                    size={isMobile ? 'md' : 'sm'}
                    value={selectedUserId}
                  />
                </FieldStack>
                {/* The role is a field of the invitation, under the person it applies
                    to — not a third control floating beside the confirm, which is
                    what it was when all three sat in one flex row. */}
                <FieldStack label="Role" width="full">
                  <Select
                    onChange={(e) => setSelectedRole(e.target.value as 'contributor' | 'viewer')}
                    options={ROLE_OPTIONS}
                    size={isMobile ? 'md' : 'sm'}
                    value={selectedRole}
                  />
                </FieldStack>
                <Button
                  className="mt-1 w-full"
                  disabled={!selectedUserId || inviteM.isPending}
                  onClick={() => inviteM.mutate()}
                  size={isMobile ? 'md' : 'sm'}
                >
                  Invite
                </Button>
              </div>
            )}
            {inviteM.error && (
              <p className="mt-2 text-sm text-red-400">
                {inviteM.error instanceof Error ? inviteM.error.message : 'Failed to invite'}
              </p>
            )}
          </DrawerSection>
        )}
      </Drawer>

      {/*
        The one thing on this surface that interrupts. Removing was a bare icon
        that fired on click — the smallest target here performing the only
        irreversible act on it.
      */}
      <ConfirmDialog
        confirmLabel="Remove"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => pendingRemoval && removeM.mutate(pendingRemoval.userId)}
        open={pendingRemoval != null}
        title="Remove access"
      >
        <strong className="font-medium text-zinc-200">{pendingRemoval?.name}</strong> loses access to this event
        immediately. Nothing already changed is undone, and you can invite them again.
      </ConfirmDialog>
    </>
  )
}

/** The initials, for someone whose account has no picture. Never a broken image. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * One person, as a `GearCard` — the drawer's own tier, so the list reads as the
 * work surface's contents rather than as a stack of controls (patterns.md §3).
 *
 * **The owner's row and your own row carry a chip and no controls at all.** The
 * server refuses every write against an owner, so a disabled control there would
 * be a promise it never intends to keep (P7); and a contributor who removed their
 * own row would drop out of the surface they were standing in, which is why
 * leaving an event is not a thing you do from here.
 *
 * On a phone the controls take a row of their own beneath the email, because
 * three things across 343 px is what the invite form was and this card is not
 * going to repeat it. `useIsMobile()` here decides geometry only — what a viewer
 * may not do is `readOnly`, at every width (patterns.md §7g).
 */
function MemberCard({
  member,
  isYou,
  isMobile,
  readOnly,
  onRoleChange,
  onRemove,
}: {
  member: EventMember
  isYou: boolean
  isMobile: boolean
  readOnly: boolean
  onRoleChange: (role: 'contributor' | 'viewer') => void
  onRemove: () => void
}) {
  const locked = readOnly || member.role === 'owner' || isYou

  const controls = locked ? null : (
    <>
      <Select
        aria-label={`Role for ${member.name}`}
        className={isMobile ? 'flex-1' : 'w-32'}
        onChange={(e) => onRoleChange(e.target.value as 'contributor' | 'viewer')}
        options={ROLE_OPTIONS}
        size={isMobile ? 'md' : 'sm'}
        value={member.role}
      />
      {/* 44x44 in the hand around a 16px icon; the desk keeps the work-surface
          size. tokens.md §7 amendment 1 — the minimum is the phone's. */}
      <button
        aria-label={`Remove ${member.name}`}
        className={
          isMobile
            ? 'flex h-11 w-11 flex-none items-center justify-center rounded-md text-zinc-500'
            : 'flex h-7 w-[34px] flex-none items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
        }
        onClick={onRemove}
        type="button"
      >
        <Trash2 className={isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      </button>
    </>
  )

  return (
    /* The phone's padding tier — `px-3 py-2.5` (tokens.md §7 amendment 2), not the
       work surface's `px-2.5 py-2`, on a card whose bottom row is a 44px target. */
    <GearCard className={isMobile ? 'px-3 py-2.5' : undefined}>
      <div className="flex items-center gap-2">
        {member.pictureUrl ? (
          <img alt="" className="h-6 w-6 flex-none rounded-full" referrerPolicy="no-referrer" src={member.pictureUrl} />
        ) : (
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-zinc-800 font-mono text-[10px] text-zinc-400">
            {initials(member.name)}
          </span>
        )}
        <span className="truncate text-sm font-medium text-zinc-100">{member.name}</span>
        {isYou && <Pill className="flex-none bg-zinc-800 text-zinc-400">You</Pill>}
        <span className="flex-1" />
        {/* The chip is neutral at every role. Amber is *needs attention*
            (tokens.md §5) and being a viewer is not a fault — the word is the
            data. A viewer used to draw the warning badge. */}
        {locked && <Pill className="flex-none bg-zinc-800 text-zinc-400">{ROLE_WORD[member.role]}</Pill>}
        {!isMobile && controls}
      </div>

      <div className="font-mono text-[10px] text-zinc-500">{member.email}</div>

      {isMobile && controls && <div className="flex items-center gap-2">{controls}</div>}
    </GearCard>
  )
}
