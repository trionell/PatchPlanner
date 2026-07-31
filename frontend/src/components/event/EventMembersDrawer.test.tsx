import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { CurrentUser, EventMember } from '../../types'
import { EventMembersDrawer } from './EventMembersDrawer'

/**
 * Who can see this event (Slice 38).
 *
 * What is worth pinning here is **presence**, which is the one thing
 * `renderToStaticMarkup` can see and the one thing this slice put at risk. The
 * surface used to be reachable only through a button viewers never saw; the door
 * is now an Overview row open to every role, so `readOnly` went from being a
 * second line of defence to being the only client-side gate there is. A control
 * that renders for a viewer is now a control a viewer can reach.
 *
 * The rows that carry no controls are the other half: the owner's, because the
 * server refuses every write against it, and your own, because removing yourself
 * would drop you out of the surface you are standing in.
 */

const setWidth = (mobile: boolean) => {
  // No DOM in this project's tests, so `useIsMobile`'s query is answered directly.
  // `localStorage` comes with it because this drawer carries an `info` note, and
  // `useInfoNote` reads the remembered choice off `window` during render.
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: mobile }),
    localStorage: { getItem: () => null, setItem: () => {} },
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const YOU: CurrentUser = {
  id: 1,
  email: 'elin@sandahlljud.test',
  name: 'Elin Sandahl',
  createdAt: '2026-01-01T00:00:00Z',
  lastLoginAt: '2026-07-31T00:00:00Z',
}

function member(userId: number, name: string, role: EventMember['role']): EventMember {
  return {
    userId,
    name,
    email: `${name.split(' ')[0]?.toLowerCase()}@example.test`,
    role,
    createdAt: '2026-07-01T00:00:00Z',
  }
}

const MEMBERS: EventMember[] = [
  member(1, 'Elin Sandahl', 'owner'),
  member(2, 'Nina Bergstrom', 'contributor'),
  member(3, 'Petra Holm', 'viewer'),
]

const OTHERS: CurrentUser[] = [
  { ...YOU, id: 9, name: 'Tove Ahlgren', email: 'tove@example.test' },
]

function render({
  readOnly = false,
  mobile = false,
  users = OTHERS,
  me = YOU,
}: { readOnly?: boolean; mobile?: boolean; users?: CurrentUser[]; me?: CurrentUser } = {}): string {
  setWidth(mobile)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['event-members', 1], MEMBERS)
  client.setQueryData(['users'], users)
  client.setQueryData(['auth', 'me'], me)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EventMembersDrawer eventId={1} onClose={() => {}} open readOnly={readOnly} />
    </QueryClientProvider>,
  )
}

describe('a viewer', () => {
  it('reaches no control that would change anything', () => {
    const markup = render({ readOnly: true })

    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('Remove ')
    expect(markup).not.toContain('>Invite<')
  })

  it('still sees everyone and their role', () => {
    const markup = render({ readOnly: true })

    expect(markup).toContain('Nina Bergstrom')
    expect(markup).toContain('Petra Holm')
    expect(markup).toContain('Viewer')
    expect(markup).toContain('Contributor')
  })

  it('is withheld the same controls on a phone, where the geometry differs', () => {
    const markup = render({ readOnly: true, mobile: true })

    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('Remove ')
  })
})

describe('someone who can manage', () => {
  it('gets a role control and a remove target for another member', () => {
    const markup = render()

    expect(markup).toContain('Role for Nina Bergstrom')
    expect(markup).toContain('Remove Nina Bergstrom')
  })

  it('gets neither on the owner’s row', () => {
    const markup = render()

    expect(markup).not.toContain('Role for Elin Sandahl')
    expect(markup).not.toContain('Remove Elin Sandahl')
  })

  it('gets neither on their own row, and it is marked as theirs', () => {
    // Reading as Nina, who is a contributor and so may manage — her own row is
    // still hers, and leaving an event is not something you do from here.
    const me = { ...YOU, id: 2, name: 'Nina Bergstrom' }
    const markup = render({ me })

    expect(markup).toContain('>You<')
    expect(markup).not.toContain('Role for Nina Bergstrom')
    expect(markup).not.toContain('Remove Nina Bergstrom')
    // Someone else's row is untouched by that.
    expect(markup).toContain('Remove Petra Holm')
  })
})

describe('the invite section', () => {
  it('offers only people who are not already on the event', () => {
    const markup = render()

    expect(markup).toContain('Tove Ahlgren')
    // The three members are in the list above, never in the picker.
    expect(markup).not.toContain('Nina Bergstrom (')
  })

  it('states why in place of the picker when there is nobody left', () => {
    const markup = render({ users: [] })

    expect(markup).toContain('Everyone who has signed in is already on this event')
    // Absent, not disabled — a picker with nothing in it is a control that lies.
    expect(markup).not.toContain('Choose a person')
  })
})

describe('the role chip', () => {
  it('is neutral at every role', () => {
    const markup = render({ readOnly: true })

    // Amber is *needs attention* (tokens.md §5). A viewer drew the warning badge
    // until this slice, which said a role was a fault.
    expect(markup).not.toContain('amber')
    expect(markup).toContain('bg-zinc-800 text-zinc-400')
  })
})

describe('the shape', () => {
  it('is a right-anchored drawer at `narrow`, not a centred dialog', () => {
    const markup = render()

    expect(markup).toContain('max-w-md')
    expect(markup).not.toContain('max-w-2xl')
  })

  it('carries its explanation as a note that can be put away, and no footer', () => {
    const markup = render()

    expect(markup).toContain('What is this?')
    expect(markup).toContain('Who has access')
    expect(markup).toContain('Everyone here can open this event')
  })
})
