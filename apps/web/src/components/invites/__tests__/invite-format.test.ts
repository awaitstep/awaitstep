import { describe, expect, it } from 'vitest'
import type { InviteDetails } from '../../../types/dashboard/invites'
import { firstName, inviteRole, placeKind, shortDay } from '../invite-format'

const INVITE: InviteDetails = {
  token: 'inv',
  org: { name: 'Acme Inc', initial: 'A', logo: null },
  invitedBy: { id: 'usr_ama', name: 'Ama Mensah', email: 'ama@acme.test', initials: 'AM' },
  email: 'daniel@acme.test',
  orgRole: 'member',
  place: { kind: 'workspace', name: 'Sales', projectName: 'Project 101', role: 'editor' },
  sentAt: '2026-10-25T12:00:00.000Z',
  expiresAt: '2026-11-01T12:00:00.000Z',
}

describe('invite format', () => {
  it('names the role a workspace or project invite gives', () => {
    expect(inviteRole(INVITE)).toEqual({
      label: 'Editor',
      detail: 'Build, run and deploy workflows',
    })
    expect(
      inviteRole({ ...INVITE, place: { kind: 'project', name: 'Project 101', role: 'member' } }),
    ).toMatchObject({ label: 'Project member' })
    expect(placeKind(INVITE.place!)).toBe('Workspace')
  })

  it('names an org-wide role over any place', () => {
    expect(inviteRole({ ...INVITE, orgRole: 'admin', place: null })).toMatchObject({
      label: 'Admin',
    })
    expect(inviteRole({ ...INVITE, place: null })).toMatchObject({ label: 'Member' })
  })

  it('writes days and first names the way the boards do', () => {
    expect(shortDay(INVITE.expiresAt)).toBe('1 Nov')
    expect(firstName('Tomás Barros')).toBe('Tomás')
  })
})
