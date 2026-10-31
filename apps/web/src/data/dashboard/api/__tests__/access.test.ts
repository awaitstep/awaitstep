import { describe, expect, it } from 'vitest'
import type {
  ApiInviteDetails,
  ApiInvitation,
  ApiOrgMember,
  ApiPersonAccess,
  ApiProjectMembers,
} from '../../../../lib/dashboard-api'
import {
  toEditRequest,
  toInvitation,
  toInviteView,
  toOrgMember,
  toPendingInvite,
  toPersonAccess,
  toProjectMembers,
} from '../access'

const ama = { id: 'u-1', name: 'Ama Mensah', email: 'ama@acme.test', image: null }
const dan = { id: 'u-2', name: 'Dan Kim', email: 'dan@acme.test', image: null }

describe('toOrgMember', () => {
  it('nests the person with initials and keeps the places as the API shaped them', () => {
    const row: ApiOrgMember = {
      ...dan,
      role: 'member',
      joinedAt: '2026-10-20T00:00:00.000Z',
      places: [
        {
          project: { id: 'p-1', name: 'Project 101', workspaceCount: 2 },
          workspace: { id: 'ws-1', name: 'Sales' },
          role: 'viewer',
        },
      ],
    }
    expect(toOrgMember(row)).toEqual({
      person: { ...dan, initials: 'DK' },
      role: 'member',
      places: row.places,
    })
  })
})

describe('toPersonAccess', () => {
  it('turns the role maps into the editor’s draft and gives projects their initial', () => {
    const row: ApiPersonAccess = {
      person: dan,
      joinedAt: '2026-10-20T00:00:00.000Z',
      orgRole: 'member',
      projects: [
        {
          id: 'p-1',
          name: 'Project 101',
          workspaces: [{ id: 'ws-1', slug: 'sales', name: 'Sales', colour: 'blue' }],
        },
      ],
      projectRoles: { 'p-2': 'admin' },
      workspaceRoles: { 'ws-1': 'viewer' },
    }
    const access = toPersonAccess(row)
    expect(access.person.initials).toBe('DK')
    expect(access.projects[0]).toMatchObject({ id: 'p-1', initial: 'P' })
    expect(access.draft).toEqual({
      orgRole: 'member',
      projects: { 'p-2': 'admin' },
      workspaces: { 'ws-1': 'viewer' },
    })
  })
})

describe('toProjectMembers', () => {
  it('keeps the two groups, with persons nested', () => {
    const row: ApiProjectMembers = {
      wholeProject: [{ person: ama, role: 'owner' }],
      workspacesOnly: [
        {
          person: dan,
          workspaces: [
            {
              workspace: { id: 'ws-1', slug: 'sales', name: 'Sales', colour: 'blue' },
              role: 'viewer',
            },
          ],
        },
      ],
    }
    const members = toProjectMembers(row)
    expect(members.wholeProject[0]).toEqual({ person: { ...ama, initials: 'AM' }, role: 'owner' })
    expect(members.workspacesOnly[0]!.workspaces[0]).toEqual({
      workspace: { id: 'ws-1', slug: 'sales', name: 'Sales', colour: 'blue' },
      role: 'viewer',
    })
  })
})

describe('toInvitation', () => {
  it('shapes places by kind, with no workspace on a project-wide one', () => {
    const row: ApiInvitation = {
      id: 'inv-1',
      email: 'hal@example.test',
      role: 'member',
      places: [
        { kind: 'workspace', project: 'Project 101', workspace: 'Sales', role: 'editor' },
        { kind: 'project', project: 'Project 202', workspace: null, role: 'member' },
      ],
      sentAt: '2026-10-28T00:00:00.000Z',
      expiresAt: '2026-11-04T00:00:00.000Z',
      invitedBy: { id: 'u-1', name: 'Ama Mensah' },
      askedForNewAt: null,
    }
    expect(toInvitation(row)).toEqual({
      id: 'inv-1',
      email: 'hal@example.test',
      role: 'member',
      places: [
        { kind: 'workspace', project: 'Project 101', workspace: 'Sales', role: 'editor' },
        { kind: 'project', project: 'Project 202', workspace: null, role: 'member' },
      ],
      sentAt: '2026-10-28T00:00:00.000Z',
      invitedBy: { id: 'u-1', name: 'Ama Mensah' },
    })
  })
})

describe('toInviteView', () => {
  const invite: ApiInviteDetails = {
    token: 'inv-1',
    org: { name: 'Acme', slug: 'acme', logo: null },
    invitedBy: ama,
    email: 'hal@example.test',
    orgRole: 'member',
    place: { kind: 'workspace', name: 'Sales', projectName: 'Project 101', role: 'editor' },
    sentAt: '2026-10-28T00:00:00.000Z',
    expiresAt: '2026-11-04T00:00:00.000Z',
  }

  it('adds the org initial and the inviter’s initials, per state', () => {
    const open = toInviteView({ state: 'open', invite, viewerEmail: 'hal@example.test' })
    expect(open.state).toBe('open')
    if (open.state === 'open') {
      expect(open.invite.org).toEqual({ name: 'Acme', initial: 'A', logo: null })
      expect(open.invite.invitedBy).toEqual({ ...ama, initials: 'AM' })
      expect(open.invite.place).toEqual(invite.place)
    }
    const expired = toInviteView({ state: 'expired', invite, askedForNew: true })
    expect(expired).toMatchObject({ state: 'expired', askedForNew: true })
    expect(toInviteView({ state: 'gone' })).toEqual({ state: 'gone' })
  })

  it('shapes a pending invite for Waiting for you, with where it leads and when it expires', () => {
    const place = {
      kind: 'workspace' as const,
      name: 'Platform',
      projectName: 'Core',
      role: 'editor' as const,
    }
    expect(
      toPendingInvite({
        token: 'inv-1',
        org: { name: 'Globex', slug: 'globex', logo: null },
        invitedBy: 'Lena Ortiz',
        orgRole: 'member',
        place,
        expiresAt: '2026-11-04T00:00:00.000Z',
      }),
    ).toEqual({
      token: 'inv-1',
      org: { name: 'Globex', initial: 'G' },
      invitedBy: 'Lena Ortiz',
      orgRole: 'member',
      place,
      expiresAt: '2026-11-04T00:00:00.000Z',
    })
  })
})

describe('toEditRequest', () => {
  it('keeps the two people and the time', () => {
    expect(
      toEditRequest({
        id: 'req-1',
        workspaceId: 'ws-1',
        from: { id: 'u-2', name: 'Dan Kim' },
        to: { id: 'u-1', name: 'Ama Mensah' },
        status: 'pending',
        at: '2026-10-28T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'req-1',
      workspaceId: 'ws-1',
      from: { id: 'u-2', name: 'Dan Kim' },
      to: { id: 'u-1', name: 'Ama Mensah' },
      at: '2026-10-28T00:00:00.000Z',
    })
  })
})
