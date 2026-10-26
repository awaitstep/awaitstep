import { describe, expect, it } from 'vitest'
import { coveringRole, describeAccess, isOrgWide, toAccessGrant } from '../access-draft'
import { ACCESS_PROJECTS, DANIEL_ACCESS } from './fixtures/projects'

describe('access draft', () => {
  it('treats org admins and owners as reaching everything', () => {
    expect(isOrgWide(DANIEL_ACCESS)).toBe(false)
    expect(isOrgWide({ ...DANIEL_ACCESS, orgRole: 'admin' })).toBe(true)
    expect(isOrgWide({ ...DANIEL_ACCESS, orgRole: 'owner' })).toBe(true)
  })

  it('finds the project role that covers a project’s workspaces', () => {
    const draft = { ...DANIEL_ACCESS, projects: { p101: 'member' as const } }
    expect(coveringRole(draft, 'p101')).toBe('member')
    expect(coveringRole(draft, 'marketing')).toBeNull()
  })

  it('lists workspace roles one by one', () => {
    expect(describeAccess(DANIEL_ACCESS, ACCESS_PROJECTS, 'Acme Inc')).toEqual([
      'Project 101 · Sales (Editor)',
    ])
  })

  it('lists a project role as the whole project, hiding the workspace roles it covers', () => {
    const draft = {
      ...DANIEL_ACCESS,
      projects: { p101: 'admin' as const },
      workspaces: { sales: 'editor' as const, 'i-default': 'viewer' as const },
    }
    expect(describeAccess(draft, ACCESS_PROJECTS, 'Acme Inc')).toEqual([
      'Project 101 · all workspaces (Project admin)',
      'Internal Tools · Default (Viewer)',
    ])
  })

  it('says everything for org-wide roles and nothing yet for an empty draft', () => {
    expect(
      describeAccess({ ...DANIEL_ACCESS, orgRole: 'owner' }, ACCESS_PROJECTS, 'Acme Inc'),
    ).toEqual(['Every project and workspace in Acme Inc'])
    expect(
      describeAccess(
        { orgRole: 'member', projects: {}, workspaces: {} },
        ACCESS_PROJECTS,
        'Acme Inc',
      ),
    ).toEqual(['Nothing yet. Pick a project or workspace above'])
  })

  it('saves no covered workspace role, and keeps the uncovered ones', () => {
    const draft = {
      orgRole: 'member' as const,
      projects: { p101: 'member' as const, marketing: null },
      workspaces: { sales: 'editor' as const, it: null, 'm-default': 'admin' as const },
    }
    expect(toAccessGrant(draft, ACCESS_PROJECTS)).toEqual({
      orgRole: 'member',
      projects: [{ projectId: 'p101', role: 'member' }],
      workspaces: [{ workspaceId: 'm-default', role: 'admin' }],
    })
  })

  it('saves no picks at all for an org-wide role', () => {
    const draft = {
      ...DANIEL_ACCESS,
      orgRole: 'admin' as const,
      projects: { p101: 'admin' as const },
    }
    expect(toAccessGrant(draft, ACCESS_PROJECTS)).toEqual({
      orgRole: 'admin',
      projects: [],
      workspaces: [],
    })
  })
})
