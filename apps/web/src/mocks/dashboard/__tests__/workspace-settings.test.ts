import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, LENA, PRIYA } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { keys, variables, members, workspaces } = mockServer
const as = (userId: string): MockContext => ({ userId, scenario: 'none' })
const ama = as(AMA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => resetMockDb(new Date()))

describe('workspace keys', () => {
  it('lists the workspace’s own keys apart from the project keys that reach it', async () => {
    const list = await keys.listWorkspaceKeys(ama, sales)
    expect(list.own.map((k) => k.name)).toEqual(['CRM webhook'])
    expect(list.inherited.map((k) => k.name)).toEqual([
      'CI deploys',
      'Agent (Claude)',
      'Read-only dashboard',
    ])
  })

  it('revokes an own key, never a project key, and only for workspace admins', async () => {
    await expect(keys.revokeWorkspaceKey(ama, sales, 'key_ci')).rejects.toMatchObject({
      status: 404,
    })
    await expect(keys.revokeWorkspaceKey(as(DANIEL), sales, 'key_sales_crm')).rejects.toMatchObject(
      { status: 403 },
    )
    await keys.revokeWorkspaceKey(ama, sales, 'key_sales_crm')
    expect((await keys.listWorkspaceKeys(ama, sales)).own).toEqual([])
  })
})

describe('workspace variables', () => {
  it('lets the closest level win and says what it replaces', async () => {
    const list = await variables.listWorkspaceVariables(ama, sales)
    expect(list.map((v) => [v.name, v.source.name, v.overrides])).toEqual([
      ['CRM_BASE_URL', 'Sales', 'project'],
      ['SLACK_TOKEN', 'Project 101', null],
      ['REGION', 'Acme Inc', null],
      ['SUPPORT_EMAIL', 'Acme Inc', null],
      ['SENTRY_DSN', 'Acme Inc', null],
    ])
    expect(list[0]!.value).toBe('https://crm.acme.test')
    expect(list[1]).toMatchObject({ isSecret: true, value: null })
  })

  it('says a workspace value replaces the org’s when the project doesn’t set it', async () => {
    getDb().variables.push({
      level: 'workspace',
      scopeId: 'ws_sales',
      name: 'REGION',
      value: 'us',
      isSecret: false,
    })
    const region = (await variables.listWorkspaceVariables(ama, sales)).find(
      (v) => v.name === 'REGION',
    )
    expect(region).toMatchObject({
      value: 'us',
      source: { level: 'workspace' },
      overrides: 'organization',
    })
  })
})

describe('workspace members', () => {
  it('adds an org member with a role, changes it and removes it', async () => {
    await members.addWorkspaceMember(ama, sales, LENA, 'editor')
    let people = await workspaces.listWorkspacePeople(ama, sales)
    expect(people.find((p) => p.person.id === LENA)).toMatchObject({
      role: 'editor',
      inherited: false,
    })
    await members.setWorkspaceRole(ama, sales, LENA, 'viewer')
    people = await workspaces.listWorkspacePeople(ama, sales)
    expect(people.find((p) => p.person.id === LENA)!.role).toBe('viewer')
    await members.removeWorkspaceMember(ama, sales, LENA)
    people = await workspaces.listWorkspacePeople(ama, sales)
    expect(people.some((p) => p.person.id === LENA)).toBe(false)
  })

  it('carries when each person last opened the org', async () => {
    const people = await workspaces.listWorkspacePeople(ama, sales)
    expect(people.find((p) => p.person.id === DANIEL)!.lastActiveAt).not.toBeNull()
  })

  it('refuses people outside the org, duplicates and non-admins', async () => {
    await expect(
      members.addWorkspaceMember(ama, sales, 'usr_tomas', 'editor'),
    ).rejects.toMatchObject({ status: 409 })
    await expect(members.addWorkspaceMember(ama, sales, DANIEL, 'editor')).rejects.toMatchObject({
      status: 409,
    })
    await expect(
      members.setWorkspaceRole(as(PRIYA), sales, DANIEL, 'viewer'),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('won’t change an inherited role from the workspace', async () => {
    await expect(members.setWorkspaceRole(ama, sales, 'usr_tom', 'viewer')).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('review round (2026-10-27)', () => {
  const projectMember = () =>
    getDb().projectMembers.push({ projectId: 'prj_101', userId: LENA, role: 'member' })

  it('refuses a workspace grant at or below what the project already gives', async () => {
    projectMember()
    // Lena is now an Editor in every workspace through the project.
    await expect(members.addWorkspaceMember(ama, sales, LENA, 'editor')).rejects.toMatchObject({
      status: 409,
    })
    await members.addWorkspaceMember(ama, sales, LENA, 'admin')
    await expect(members.setWorkspaceRole(ama, sales, LENA, 'viewer')).rejects.toMatchObject({
      status: 409,
    })
    const lena = (await workspaces.listWorkspacePeople(ama, sales)).find(
      (p) => p.person.id === LENA,
    )
    expect(lena).toMatchObject({ role: 'admin', inherited: false, projectRole: 'editor' })
  })

  it('leaves expired project keys out of what reaches the workspace', async () => {
    getDb().keys.find((k) => k.id === 'key_ci')!.expiresAt = new Date(
      Date.now() - 1000,
    ).toISOString()
    const list = await keys.listWorkspaceKeys(ama, sales)
    expect(list.inherited.map((k) => k.id)).not.toContain('key_ci')
  })
})
