import { describe, expect, it } from 'vitest'
import {
  ACCESS_REASONS,
  orgCapabilities,
  projectCapabilities,
  rolesFromOrgRole,
  workspaceCapabilities,
} from '../access.js'

const facts = { ownLock: false, lockedByProject: null, isLastWorkspace: false, sharedInUse: false }

describe('rolesFromOrgRole', () => {
  it('makes owners and admins run every project and workspace, and members build in all', () => {
    expect(rolesFromOrgRole('owner')).toEqual({ projectRole: 'admin', workspaceRole: 'admin' })
    expect(rolesFromOrgRole('admin')).toEqual({ projectRole: 'admin', workspaceRole: 'admin' })
    expect(rolesFromOrgRole('member')).toEqual({ projectRole: 'member', workspaceRole: 'editor' })
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
    expect(projectCapabilities('member', false).createWorkspace.reason).toBe(
      ACCESS_REASONS.projectAdmins,
    )
    expect(projectCapabilities('admin', true).delete.reason).toBe(ACCESS_REASONS.lockFirst)
    expect(projectCapabilities('admin', false, 'member').move.reason).toBe(ACCESS_REASONS.orgAdmins)
    expect(projectCapabilities('admin', false, 'owner').move.allowed).toBe(true)
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
