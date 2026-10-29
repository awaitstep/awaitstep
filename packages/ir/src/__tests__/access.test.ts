import { describe, expect, it } from 'vitest'
import {
  ACCESS_REASONS,
  canSeeProject,
  grantCounts,
  orgCapabilities,
  projectCapabilities,
  resolveRoles,
  UNLOCKED_PROJECT,
  roleAbove,
  workspaceCapabilities,
  type OrgRole,
  type ProjectRole,
  type WorkspaceRole,
} from '../access.js'

const facts = { ownLock: false, lockedByProject: null, isLastWorkspace: false, sharedInUse: false }

const ORG_ROLES: (OrgRole | null)[] = ['owner', 'admin', 'member', null]
const PROJECT_GRANTS: (ProjectRole | null)[] = ['admin', 'member', null]
const WORKSPACE_GRANTS: (WorkspaceRole | null)[] = ['admin', 'editor', 'viewer', null]

describe('resolveRoles', () => {
  it('makes org owners and admins admins of every project and workspace', () => {
    for (const orgRole of ['owner', 'admin'] as const) {
      for (const projectGrant of PROJECT_GRANTS) {
        for (const workspaceGrant of WORKSPACE_GRANTS) {
          expect(resolveRoles({ orgRole, projectGrant, workspaceGrant })).toEqual({
            orgRole,
            projectRole: 'admin',
            inheritedWorkspaceRole: 'admin',
            workspaceRole: 'admin',
          })
        }
      }
    }
  })

  it('gives a project admin every workspace as Admin', () => {
    expect(
      resolveRoles({ orgRole: 'member', projectGrant: 'admin', workspaceGrant: 'viewer' }),
    ).toEqual({
      orgRole: 'member',
      projectRole: 'admin',
      inheritedWorkspaceRole: 'admin',
      workspaceRole: 'admin',
    })
  })

  it('gives a project member every workspace as Editor, raised to Admin by a grant', () => {
    const member = { orgRole: 'member' as const, projectGrant: 'member' as const }
    expect(resolveRoles({ ...member, workspaceGrant: null }).workspaceRole).toBe('editor')
    expect(resolveRoles({ ...member, workspaceGrant: 'viewer' }).workspaceRole).toBe('editor')
    expect(resolveRoles({ ...member, workspaceGrant: 'editor' }).workspaceRole).toBe('editor')
    expect(resolveRoles({ ...member, workspaceGrant: 'admin' })).toEqual({
      orgRole: 'member',
      projectRole: 'member',
      inheritedWorkspaceRole: 'editor',
      workspaceRole: 'admin',
    })
  })

  it('lets a plain member in only where a workspace grant says, and hides the rest', () => {
    const plain = { orgRole: 'member' as const, projectGrant: null }
    expect(resolveRoles({ ...plain, workspaceGrant: 'viewer' })).toEqual({
      orgRole: 'member',
      projectRole: null,
      inheritedWorkspaceRole: null,
      workspaceRole: 'viewer',
    })
    expect(resolveRoles({ ...plain, workspaceGrant: null }).workspaceRole).toBeNull()
  })

  it('hides everything from someone outside the org, whatever rows they left behind', () => {
    for (const projectGrant of PROJECT_GRANTS) {
      for (const workspaceGrant of WORKSPACE_GRANTS) {
        expect(resolveRoles({ orgRole: null, projectGrant, workspaceGrant })).toEqual({
          orgRole: null,
          projectRole: null,
          inheritedWorkspaceRole: null,
          workspaceRole: null,
        })
      }
    }
  })

  it('answers every combination with a role no lower than what the project gives', () => {
    for (const orgRole of ORG_ROLES) {
      for (const projectGrant of PROJECT_GRANTS) {
        for (const workspaceGrant of WORKSPACE_GRANTS) {
          const roles = resolveRoles({ orgRole, projectGrant, workspaceGrant })
          if (roles.inheritedWorkspaceRole && roles.workspaceRole) {
            expect(roleAbove(roles.inheritedWorkspaceRole, roles.workspaceRole)).toBe(false)
          }
        }
      }
    }
  })
})

describe('canSeeProject', () => {
  it('shows a project through the org, a project role, or any workspace grant in it', () => {
    expect(canSeeProject('admin', null, false)).toBe(true)
    expect(canSeeProject('member', 'member', false)).toBe(true)
    expect(canSeeProject('member', null, true)).toBe(true)
    expect(canSeeProject('member', null, false)).toBe(false)
    expect(canSeeProject(null, 'admin', true)).toBe(false)
  })
})

describe('grantCounts', () => {
  it('accepts a grant only above what the project already gives', () => {
    expect(grantCounts('viewer', null)).toBe(true)
    expect(grantCounts('editor', 'editor')).toBe(false)
    expect(grantCounts('admin', 'editor')).toBe(true)
    expect(grantCounts('admin', 'admin')).toBe(false)
  })
})

describe('orgCapabilities', () => {
  it('lets anyone create a project, admins manage, and only an owner of an empty org delete', () => {
    expect(orgCapabilities('member').createProject.allowed).toBe(true)
    expect(orgCapabilities('member').manageSettings).toEqual({
      allowed: false,
      reason: ACCESS_REASONS.orgAdmins,
    })
    expect(orgCapabilities('admin', 0).delete.reason).toBe(ACCESS_REASONS.orgOwners)
    expect(orgCapabilities('owner', 2).delete.reason).toBe('2 projects still in it')
    expect(orgCapabilities('owner', 0).delete.allowed).toBe(true)
  })
})

describe('projectCapabilities', () => {
  it('reserves management for admins, moves for org admins, and both behind the lock', () => {
    const locked = { ...UNLOCKED_PROJECT, ownLock: true }
    expect(projectCapabilities('member', UNLOCKED_PROJECT).createWorkspace.reason).toBe(
      ACCESS_REASONS.projectAdmins,
    )
    expect(projectCapabilities('admin', locked).delete.reason).toBe(ACCESS_REASONS.lockFirst)
    expect(projectCapabilities('admin', UNLOCKED_PROJECT, 'member').move.reason).toBe(
      ACCESS_REASONS.orgAdmins,
    )
    expect(projectCapabilities('admin', UNLOCKED_PROJECT, 'owner').move.allowed).toBe(true)
    expect(projectCapabilities('admin', locked, 'owner').move.reason).toBe(ACCESS_REASONS.lockFirst)
  })

  it('keeps a project with locked workspaces from being deleted, naming one or counting several', () => {
    const one = { ownLock: false, lockedWorkspaces: ['Sales'] }
    const two = { ownLock: false, lockedWorkspaces: ['Sales', 'IT'] }
    expect(projectCapabilities('admin', one).delete.reason).toBe('Sales is locked')
    expect(projectCapabilities('admin', two).delete.reason).toBe('2 workspaces in it are locked')
    // The project's own lock is named first; a member hears about the role, not the locks.
    expect(projectCapabilities('admin', { ...two, ownLock: true }).delete.reason).toBe(
      ACCESS_REASONS.lockFirst,
    )
    expect(projectCapabilities('member', two).delete.reason).toBe(ACCESS_REASONS.projectAdmins)
    // A workspace's lock does not keep the project in its org.
    expect(projectCapabilities('admin', two, 'owner').move.allowed).toBe(true)
  })
})

describe('workspaceCapabilities', () => {
  it('keeps viewers to reading and running', () => {
    const viewer = workspaceCapabilities('viewer', facts)
    expect(viewer.run.allowed).toBe(true)
    expect(viewer.edit.reason).toBe(ACCESS_REASONS.needsEditor)
    expect(viewer.share.reason).toBe(ACCESS_REASONS.shareNeedsEditor)
    expect(viewer.toggleLock.reason).toBe(ACCESS_REASONS.lockToggle)
  })

  it('refuses a delete for each blocking fact, in order', () => {
    expect(workspaceCapabilities('editor', facts).delete.reason).toBe(
      ACCESS_REASONS.workspaceAdmins,
    )
    expect(workspaceCapabilities('admin', { ...facts, lockedByProject: 'P' }).delete.reason).toBe(
      'Locked by P',
    )
    expect(workspaceCapabilities('admin', { ...facts, ownLock: true }).delete.reason).toBe(
      ACCESS_REASONS.lockFirst,
    )
    expect(workspaceCapabilities('admin', { ...facts, isLastWorkspace: true }).delete.reason).toBe(
      ACCESS_REASONS.lastWorkspace,
    )
    expect(workspaceCapabilities('admin', { ...facts, sharedInUse: true }).delete.reason).toBe(
      ACCESS_REASONS.sharedInUse,
    )
    expect(workspaceCapabilities('admin', facts).delete.allowed).toBe(true)
  })
})
