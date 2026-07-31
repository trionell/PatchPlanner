import { describe, expect, it } from 'vitest'
import { accessCountLine, accessRoleLine } from './eventAccess'
import type { EventMember } from '../types'

/**
 * The plural boundaries and the alone case, which are the two things the row's
 * text can get wrong without anyone noticing until an event has exactly one
 * viewer on it (Slice 38, FR-005).
 */

function member(userId: number, role: EventMember['role']): EventMember {
  return {
    userId,
    email: `person${userId}@example.test`,
    name: `Person ${userId}`,
    role,
    createdAt: '2026-07-31T00:00:00Z',
  }
}

const YOU = 1

describe('accessCountLine', () => {
  it('says nothing has been shared when the list is empty', () => {
    expect(accessCountLine([])).toBe('Nobody has access yet')
  })

  it('is singular at one', () => {
    expect(accessCountLine([member(YOU, 'owner')])).toBe('1 person has access')
  })

  it('is plural at two', () => {
    expect(accessCountLine([member(YOU, 'owner'), member(2, 'viewer')])).toBe('2 people have access')
  })

  it('counts everyone, whatever their role', () => {
    const members = [member(YOU, 'owner'), member(2, 'contributor'), member(3, 'contributor'), member(4, 'viewer')]
    expect(accessCountLine(members)).toBe('4 people have access')
  })
})

describe('accessRoleLine', () => {
  it('drops the separator when you are alone on the event', () => {
    expect(accessRoleLine([member(YOU, 'owner')], YOU)).toBe('You are the owner')
  })

  it('is the mockup line at four people', () => {
    const members = [member(YOU, 'owner'), member(2, 'contributor'), member(3, 'contributor'), member(4, 'viewer')]
    expect(accessRoleLine(members, YOU)).toBe('You are the owner · 2 contributors, 1 viewer')
  })

  it('is singular at one of each', () => {
    const members = [member(YOU, 'owner'), member(2, 'contributor'), member(3, 'viewer')]
    expect(accessRoleLine(members, YOU)).toBe('You are the owner · 1 contributor, 1 viewer')
  })

  it('omits a role nobody holds rather than printing a zero', () => {
    const members = [member(YOU, 'owner'), member(2, 'contributor')]
    expect(accessRoleLine(members, YOU)).toBe('You are the owner · 1 contributor')
  })

  it('names the reader\'s own role, not the owner\'s', () => {
    const members = [member(2, 'owner'), member(YOU, 'viewer'), member(3, 'contributor')]
    expect(accessRoleLine(members, YOU)).toBe('You are a viewer · 1 owner, 1 contributor')
  })

  it('never counts you twice', () => {
    const members = [member(YOU, 'contributor'), member(2, 'contributor')]
    expect(accessRoleLine(members, YOU)).toBe('You are a contributor · 1 contributor')
  })

  it('says the true half when the reader is not on the list yet', () => {
    const members = [member(2, 'owner'), member(3, 'viewer')]
    expect(accessRoleLine(members, YOU)).toBe('1 owner, 1 viewer')
  })

  it('is empty when there is nothing to say', () => {
    expect(accessRoleLine([], YOU)).toBe('')
  })
})
