import { beforeEach, describe, expect, it } from 'vitest'
import {
  REASONS,
  canSeeProject,
  projectCapabilities,
  workspaceCapabilities,
  workspaceRoleOf,
} from '../access'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, JONAS, LENA, PRIYA, TOM } from '../fixtures/people'
import { INTERNAL, MARKETING, P101 } from '../fixtures/projects'
import { IT, SALES, SUPPORT } from '../fixtures/workspaces'
import type { MockContext } from '../scenario'

const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})

function roleIn(ctx: MockContext, projectId: string, workspaceId: string) {
  const db = getDb()
  const project = db.projects.find((p) => p.id === projectId)!
  const workspace = db.workspaces.find((w) => w.id === workspaceId)!
  return workspaceRoleOf(db, ctx, project, workspace)
}

const project = (id: string) => getDb().projects.find((p) => p.id === id)!

beforeEach(() => resetMockDb(new Date('2026-10-26T12:00:00Z')))

describe('effective workspace roles for the canvas people', () => {
  it('makes the org owner an admin of every workspace', () => {
    expect(roleIn(as(AMA), P101, SALES)).toBe('admin')
    expect(roleIn(as(AMA), MARKETING, 'ws_marketing_default')).toBe('admin')
  })

  it('makes a project admin an admin of every workspace in that project only', () => {
    expect(roleIn(as(TOM), P101, SUPPORT)).toBe('admin')
    expect(roleIn(as(TOM), MARKETING, 'ws_marketing_default')).toBeNull()
  })

  it('opens every workspace to a project member as an Editor', () => {
    expect(roleIn(as(TOM), INTERNAL, 'ws_internal_default')).toBe('editor')
    expect(roleIn(as(LENA), MARKETING, 'ws_marketing_default')).toBe('editor')
  })

  it('opens only the granted workspaces to everyone else', () => {
    expect(roleIn(as(DANIEL), P101, SALES)).toBe('editor')
    expect(roleIn(as(PRIYA), P101, SALES)).toBe('viewer')
    expect(roleIn(as(LENA), P101, IT)).toBe('admin')
    expect(roleIn(as(DANIEL), P101, IT)).toBeNull()
    expect(roleIn(as(LENA), P101, SALES)).toBeNull()
  })

  it('hides projects in which the person can open nothing', () => {
    const db = getDb()
    expect(canSeeProject(db, as(DANIEL), project(P101))).toBe(true)
    expect(canSeeProject(db, as(DANIEL), project(MARKETING))).toBe(false)
    expect(canSeeProject(db, as(JONAS), project(P101))).toBe(false)
  })

  it('under the viewer scenario, turns every visible workspace read-only and hides nothing new', () => {
    expect(roleIn(as(AMA, 'viewer'), P101, SALES)).toBe('viewer')
    expect(roleIn(as(DANIEL, 'viewer'), P101, SALES)).toBe('viewer')
    expect(roleIn(as(DANIEL, 'viewer'), P101, IT)).toBeNull()
  })
})

describe('capabilities', () => {
  const unlocked = { ownLock: false, lockedByProject: null, isLastWorkspace: false }

  it('lets a Viewer read and run, with the canvas reason on everything else they see', () => {
    const can = workspaceCapabilities('viewer', unlocked)
    expect(can.run).toEqual({ allowed: true })
    for (const key of ['edit', 'deploy', 'share'] as const) {
      expect(can[key]).toEqual({ allowed: false, reason: REASONS.needsEditor })
    }
    expect(can.toggleLock.allowed).toBe(false)
  })

  it('lets Editors toggle the workspace lock but not delete or manage the workspace', () => {
    const can = workspaceCapabilities('editor', unlocked)
    expect(can.toggleLock.allowed).toBe(true)
    expect(can.delete).toEqual({ allowed: false, reason: REASONS.workspaceAdmins })
    expect(can.manageMembers.allowed).toBe(false)
  })

  it('blocks deleting a workspace under its own lock, the project lock, or as the last one', () => {
    expect(workspaceCapabilities('admin', { ...unlocked, ownLock: true }).delete).toEqual({
      allowed: false,
      reason: 'Turn off the deletion lock first',
    })
    const byProject = workspaceCapabilities('admin', {
      ...unlocked,
      lockedByProject: 'Project 101',
    })
    expect(byProject.delete.reason).toBe('Locked by Project 101')
    expect(byProject.toggleLock.reason).toBe('Locked by Project 101')
    expect(
      workspaceCapabilities('admin', { ...unlocked, isLastWorkspace: true }).delete.reason,
    ).toBe(REASONS.lastWorkspace)
    expect(workspaceCapabilities('admin', unlocked).delete).toEqual({ allowed: true })
  })

  it('keeps project settings to project admins and blocks delete while locked', () => {
    expect(projectCapabilities('member', false).manageSettings).toEqual({
      allowed: false,
      reason: REASONS.projectAdmins,
    })
    expect(projectCapabilities('admin', true).delete.reason).toBe(REASONS.lockFirst)
    expect(projectCapabilities('admin', false).delete.allowed).toBe(true)
  })
})
