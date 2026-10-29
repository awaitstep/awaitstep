import { describe, expect, it } from 'vitest'
import type {
  ApiMember,
  ApiProject,
  ApiScope,
  ApiWorkspace,
  ApiWorkspacePerson,
} from '../../../../lib/dashboard-api'
import {
  projectFromRow,
  toOrgSummary,
  toPerson,
  toProject,
  toScopeLookup,
  toWorkspace,
  toWorkspacePeople,
  workspaceFromRow,
} from '../records'

const yes = { allowed: true }
const no = { allowed: false, reason: 'no' }

const members: ApiMember[] = [
  { id: 'u-1', name: 'Ama Mensah', email: 'ama@acme.test', image: null, role: 'owner' },
  { id: 'u-2', name: '', email: 'ben@acme.test', image: 'data:x', role: 'member' },
]

// The API resolves each person's role in the workspace and where it comes from.
const people: ApiWorkspacePerson[] = [
  {
    ...members[0]!,
    role: 'admin',
    inherited: true,
    projectRole: 'admin',
    orgRole: 'owner',
    lastActiveAt: null,
  },
  {
    ...members[1]!,
    role: 'admin',
    inherited: false,
    projectRole: 'editor',
    orgRole: null,
    lastActiveAt: '2026-10-28T06:00:00.000Z',
  },
]

const org = {
  id: 'org-1',
  slug: 'acme',
  name: 'Acme',
  logo: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  role: 'owner' as const,
  projectCount: 2,
  memberCount: 2,
  viewerCan: { createProject: yes, manageSettings: yes, delete: no },
  members,
}

const project: ApiProject = {
  id: 'p-1',
  organizationId: 'org-1',
  slug: 'project-101',
  name: 'Project 101',
  description: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  workspaces: [{ id: 'ws-1', slug: 'sales', name: 'Sales', colour: 'blue' }],
  health: { workflows: 3, deployed: 1, failing: 1, lastRunAt: '2026-10-28T07:00:00.000Z' },
  lock: { setBy: { id: 'u-1', name: 'Ama Mensah' }, setAt: '2026-10-21T00:00:00.000Z' },
  members,
  viewerRole: 'admin',
  viewerCan: {
    manageSettings: yes,
    createWorkspace: yes,
    manageMembers: yes,
    manageKeys: yes,
    manageVariables: yes,
    toggleLock: yes,
    delete: no,
    move: yes,
  },
}

const workspace: ApiWorkspace = {
  id: 'ws-1',
  projectId: 'p-1',
  slug: 'sales',
  name: 'Sales',
  description: 'Pipeline',
  colour: 'blue',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  createdBy: { id: 'u-1', name: 'Ama Mensah' },
  lock: null,
  inheritedLock: { fromName: 'Project 101', lock: project.lock! },
  counts: { workflows: 3, deployed: 1, functions: 1, runs24h: 5, failing: 1, lastRunAt: null },
  members: people,
  viewerRole: 'admin',
  viewerCan: {
    edit: yes,
    deploy: yes,
    run: yes,
    share: yes,
    manageSettings: yes,
    manageMembers: yes,
    manageKeys: yes,
    manageVariables: yes,
    toggleLock: no,
    delete: no,
  },
}

describe('toPerson', () => {
  it('derives initials from the name, or the email when there is none', () => {
    expect(toPerson(members[0]!)).toEqual({
      id: 'u-1',
      name: 'Ama Mensah',
      email: 'ama@acme.test',
      initials: 'AM',
      image: null,
    })
    expect(toPerson(members[1]!).initials).toBe('BE')
  })
})

describe('toOrgSummary', () => {
  it('adds the tile initial and leaves the last-opened time to the dashboard', () => {
    expect(toOrgSummary(org)).toMatchObject({ initial: 'A', role: 'owner', lastOpenedAt: null })
  })
})

describe('toProject / toWorkspace', () => {
  it('shapes people, locks and counts as the pages draw them', () => {
    const p = toProject(project)
    expect(p.initial).toBe('P')
    expect(p.people.map((person) => person.id)).toEqual(['u-1', 'u-2'])
    expect(p.lock).toEqual({ own: project.lock, inherited: null })
    expect(p.health.failing).toBe(1)

    const w = toWorkspace(workspace)
    expect(w.lock).toEqual({ own: null, inherited: workspace.inheritedLock })
    expect(w.counts).toEqual({ ...workspace.counts, sharedOut: 0 })
    expect(w.createdBy).toEqual({ id: 'u-1', name: 'Ama Mensah' })
  })
})

describe('toWorkspacePeople', () => {
  it('keeps the role the API resolved and where it comes from, nesting the person', () => {
    const rows = toWorkspacePeople(workspace)
    expect(
      rows.map((p) => [
        p.person.id,
        p.person.initials,
        p.role,
        p.projectRole,
        p.orgRole,
        p.inherited,
        p.lastActiveAt,
      ]),
    ).toEqual([
      ['u-1', 'AM', 'admin', 'admin', 'owner', true, null],
      ['u-2', 'BE', 'admin', 'editor', null, false, '2026-10-28T06:00:00.000Z'],
    ])
  })
})

describe('toScopeLookup', () => {
  it('keeps a miss as it is', () => {
    const miss: ApiScope = {
      found: false,
      notFound: { kind: 'workspace', slug: 'x', parent: { name: 'P', slug: 'p' } },
    }
    expect(toScopeLookup(miss)).toEqual(miss)
  })

  it('nests each level with its role and capabilities', () => {
    const lookup = toScopeLookup({ found: true, org, project, workspace })
    expect(lookup.found).toBe(true)
    if (!lookup.found) return
    expect(lookup.org.org.slug).toBe('acme')
    expect(lookup.org.viewerCan.manageSettings).toEqual(yes)
    expect(lookup.project?.project.slug).toBe('project-101')
    expect(lookup.project?.viewerRole).toBe('admin')
    expect(lookup.workspace?.workspace.slug).toBe('sales')
    expect(lookup.workspace?.viewerCan.delete).toEqual(no)

    const orgOnly = toScopeLookup({ found: true, org })
    expect(orgOnly.found && orgOnly.project).toBeUndefined()
  })
})

describe('rows from a create or rename', () => {
  it('make a workspace and a project with nothing in them yet', () => {
    const w = workspaceFromRow({
      id: 'ws-2',
      projectId: 'p-1',
      slug: 'ops',
      name: 'Ops',
      description: null,
      colour: 'amber',
      createdBy: 'u-1',
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    })
    expect(w).toMatchObject({ slug: 'ops', initial: 'O', people: [], createdBy: { id: 'u-1' } })
    expect(w.counts.workflows).toBe(0)

    const p = projectFromRow(
      {
        id: 'p-2',
        organizationId: 'org-1',
        slug: 'new',
        name: 'New',
        description: null,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:00:00.000Z',
      },
      [{ id: 'ws-3', slug: 'default', name: 'Default', colour: 'green' }],
    )
    expect(p.workspaces).toHaveLength(1)
    expect(p.health.workflows).toBe(0)
  })
})
