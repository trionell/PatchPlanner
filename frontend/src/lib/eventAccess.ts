import type { EventMember } from '../types'

/**
 * The two lines the access row states, at both widths (Slice 38).
 *
 * They are here rather than built inline because the row exists twice — a
 * `CondensedListRow` on the phone and the event card's own arrangement on a desk
 * — and a sentence assembled at two call sites is a sentence that will eventually
 * be assembled two ways. It is also the only part of this slice a test can reach
 * without a DOM: `renderToStaticMarkup` can assert that a string is present, but
 * not that the plural was chosen correctly for a list of four people.
 */

const ROLE_NOUN: Record<EventMember['role'], [string, string]> = {
  owner: ['owner', 'owners'],
  contributor: ['contributor', 'contributors'],
  viewer: ['viewer', 'viewers'],
}

/** The row's title — "4 people have access". */
export function accessCountLine(members: EventMember[]): string {
  const n = members.length
  if (n === 0) return 'Nobody has access yet'
  return n === 1 ? '1 person has access' : `${n} people have access`
}

/**
 * The row's subtitle — "You are the owner · 2 contributors, 1 viewer".
 *
 * The breakdown counts **everyone but you**, because the first clause has already
 * accounted for you and a reader who is one of the two contributors should not
 * have to work out whether they are inside the number or beside it.
 *
 * A role with nobody in it is omitted rather than printed as a zero; a reader
 * alone on the event gets the first clause and no separator, because "· " with
 * nothing after it is how a derived line admits it was assembled by a machine.
 */
export function accessRoleLine(members: EventMember[], yourUserId: number): string {
  const you = members.find((member) => member.userId === yourUserId)
  const others = members.filter((member) => member.userId !== yourUserId)

  const counts = (['owner', 'contributor', 'viewer'] as const)
    .map((role) => {
      const n = others.filter((member) => member.role === role).length
      if (n === 0) return undefined
      const [one, many] = ROLE_NOUN[role]
      return `${n} ${n === 1 ? one : many}`
    })
    .filter((entry): entry is string => entry != null)
    .join(', ')

  // A reader who is not on the member list should not be reading this row at all,
  // but the list can arrive a render before the event does. Say the true half.
  if (!you) return counts
  // "the owner" but "a contributor": an event has one owner and any number of the
  // other two, and the article is the only place that distinction is stated. The
  // meta line this row replaces said "the" for all three.
  const mine = you.role === 'owner' ? 'You are the owner' : `You are a ${ROLE_NOUN[you.role][0]}`
  return counts ? `${mine} · ${counts}` : mine
}
