import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, LENA, PRIYA, TOM } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { keys, variables, members, items, projects, setup, workspaces } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const daniel = as(DANIEL)
const p101 = ['acme', 'project-101'] as const
const p101Slugs = { org: 'acme', project: 'project-101' }

beforeEach(() => resetMockDb(new Date()))

describe('project keys', () => {
  it('lists the board’s three project keys and a count per workspace', async () => {
    const { keys: list, workspaceKeys } = await keys.listProjectKeys(ama, ...p101)
    expect(list.map((k) => k.name)).toEqual(['CI deploys', 'Agent (Claude)', 'Read-only dashboard'])
    expect(list[0]).toMatchObject({ prefix: 'ask_p1…a71d', createdBy: { name: 'Tom Becker' } })
    expect(workspaceKeys.map((w) => [w.workspace.name, w.count])).toEqual([
      ['Sales', 1],
      ['IT', 2],
    ])
  })

  it('counts only the workspaces the viewer can open', async () => {
    const { workspaceKeys } = await keys.listProjectKeys(daniel, ...p101)
    expect(workspaceKeys.map((w) => w.workspace.name)).toEqual(['Sales'])
  })

  it('revokes a key, and the setup count follows the list', async () => {
    await keys.revokeProjectKey(ama, ...p101, 'key_ci')
    const { keys: list } = await keys.listProjectKeys(ama, ...p101)
    expect(list.map((k) => k.id)).not.toContain('key_ci')
    expect((await setup.getProjectSetup(ama, ...p101)).projectKeys).toBe(2)
  })

  it('refuses revoking for someone who isn’t a project admin', async () => {
    await expect(keys.revokeProjectKey(daniel, ...p101, 'key_ci')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('won’t revoke a workspace or org key through the project', async () => {
    await expect(keys.revokeProjectKey(ama, ...p101, 'key_terraform')).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('project variables', () => {
  it('resolves each name once, the project’s own first, secrets without a value', async () => {
    const list = await variables.listProjectVariables(ama, ...p101)
    expect(list.map((v) => [v.name, v.setAt.name])).toEqual([
      ['SLACK_TOKEN', 'Project 101'],
      ['CRM_BASE_URL', 'Project 101'],
      ['REGION', 'Acme Inc'],
      ['SUPPORT_EMAIL', 'Acme Inc'],
      ['SENTRY_DSN', 'Acme Inc'],
    ])
    const byName = Object.fromEntries(list.map((v) => [v.name, v]))
    expect(byName.SLACK_TOKEN).toMatchObject({ isSecret: true, value: null })
    expect(byName.CRM_BASE_URL!.overriddenIn.map((w) => w.name)).toEqual(['Sales'])
  })

  it('lets the project’s value win over the org’s', async () => {
    getDb().variables.push({
      level: 'project',
      scopeId: 'prj_101',
      name: 'REGION',
      value: 'us',
      isSecret: false,
    })
    const region = (await variables.listProjectVariables(ama, ...p101)).find(
      (v) => v.name === 'REGION',
    )
    expect(region).toMatchObject({ value: 'us', setAt: { level: 'project' } })
  })

  it('drops a deleted workspace’s overrides and keys', async () => {
    const db = getDb()
    db.projects.find((p) => p.id === 'prj_101')!.lock = null
    db.variables.find((v) => v.scopeId === 'ws_sales')!.scopeId = 'ws_support'
    db.keys.find((k) => k.id === 'key_sales_crm')!.workspaceId = 'ws_support'
    await workspaces.deleteWorkspace(ama, {
      org: 'acme',
      project: 'project-101',
      workspace: 'support',
    })
    const crm = (await variables.listProjectVariables(ama, ...p101)).find(
      (v) => v.name === 'CRM_BASE_URL',
    )
    expect(crm!.overriddenIn).toEqual([])
    expect(getDb().keys.some((k) => k.id === 'key_sales_crm')).toBe(false)
  })
})

describe('project members', () => {
  it('groups people as the board does', async () => {
    const list = await members.listProjectMembers(ama, ...p101)
    expect(list.wholeProject.map((m) => [m.person.id, m.role])).toEqual([
      [AMA, 'owner'],
      [TOM, 'project-admin'],
    ])
    expect(
      list.workspacesOnly.map((m) => [
        m.person.id,
        m.workspaces.map((w) => `${w.workspace.name} ${w.role}`),
      ]),
    ).toEqual([
      [DANIEL, ['Sales editor']],
      [PRIYA, ['Sales viewer']],
      [LENA, ['IT admin']],
    ])
  })

  it('leaves out grants in workspaces the viewer can’t open', async () => {
    const list = await members.listProjectMembers(daniel, ...p101)
    expect(list.workspacesOnly.map((m) => m.person.id)).toEqual([DANIEL, PRIYA])
  })
})

describe('unshare from the project', () => {
  it('blocks unsharing an item others call, and allows one nobody calls', async () => {
    getDb().calls = getDb().calls.filter((c) => c.itemId !== 'itm_slack')
    const shared = await items.listProjectShared(ama, ...p101)
    const byName = Object.fromEntries(shared.map((i) => [i.name, i]))
    expect(byName['Provision account']!.unshare).toMatchObject({ allowed: false })
    expect(byName['Send Slack alert']!.unshare).toEqual({ allowed: true })
  })

  it('tells a viewer outside the item’s workspace who can unshare it', async () => {
    const shared = await items.listProjectShared(daniel, ...p101)
    expect(shared.find((i) => i.name === 'Provision account')!.unshare).toEqual({
      allowed: false,
      reason: 'Only people in IT can unshare it',
    })
  })
})

describe('move project', () => {
  it('moves the project to an org the viewer administers, with its keys', async () => {
    const moved = await projects.moveProject(ama, 'acme', 'internal-tools', 'bolt-labs')
    expect(moved).toEqual({ org: 'bolt-labs', project: 'internal-tools' })
    expect((await projects.listProjects(ama, 'bolt-labs')).map((p) => p.name)).toContain(
      'Internal Tools',
    )
    expect((await projects.listProjects(ama, 'acme')).map((p) => p.name)).not.toContain(
      'Internal Tools',
    )
  })

  it('takes the next free slug when the target org already uses it', async () => {
    getDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    getDb().projects.find((p) => p.slug === 'bolt-api')!.slug = 'project-101'
    const moved = await projects.moveProject(ama, ...p101, 'bolt-labs')
    expect(moved.project).toBe('project-101-2')
    expect(
      getDb()
        .keys.filter((k) => k.projectId === 'prj_101')
        .every((k) => k.orgId === 'org_bolt'),
    ).toBe(true)
  })

  it('refuses an org the viewer only belongs to as a member', async () => {
    getDb().orgMembers.find((m) => m.orgId === 'org_bolt' && m.userId === AMA)!.role = 'member'
    await expect(projects.moveProject(ama, ...p101, 'bolt-labs')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses a project member', async () => {
    await expect(projects.moveProject(daniel, ...p101, 'daniels-sandbox')).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('review round (2026-10-27)', () => {
  it('lets only org owners and admins move a project out of the org', async () => {
    const db = getDb()
    db.orgMembers.push({
      orgId: 'org_bolt',
      userId: TOM,
      role: 'owner',
      joinedAt: new Date().toISOString(),
      lastOpenedAt: null,
    })
    // Tom is project admin of Project 101 but only a member of Acme.
    await expect(projects.moveProject(as(TOM), ...p101, 'bolt-labs')).rejects.toMatchObject({
      status: 403,
      message: 'Only org owners and admins can do this',
    })
  })

  it('drops the grants of people outside the new org when a project moves', async () => {
    getDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    await projects.moveProject(ama, ...p101, 'bolt-labs')
    // Gone from the tables, so joining Bolt later can't bring the old access back.
    expect(getDb().projectMembers.some((m) => m.projectId === 'prj_101')).toBe(false)
    expect(getDb().workspaceMembers.some((m) => m.workspaceId === 'ws_sales')).toBe(false)
    const list = await members.listProjectMembers(ama, 'bolt-labs', 'project-101')
    const ids = [
      ...list.wholeProject.map((m) => m.person.id),
      ...list.workspacesOnly.map((m) => m.person.id),
    ]
    expect(ids).not.toContain(TOM)
    expect(ids).not.toContain(DANIEL)
    expect(ids).toContain(AMA)
  })

  it('leaves unsharing to the item’s own workspace in “Shared with” lists', async () => {
    const shared = await items.listSharedWith(ama, { ...p101Slugs, workspace: 'sales' })
    expect(shared.every((i) => !i.unshare.allowed)).toBe(true)
    expect(shared[0]!.unshare.reason).toBe('Unshare it from its own workspace')
  })

  it('keeps a locked project where it is', async () => {
    await expect(projects.moveProject(ama, ...p101, 'bolt-labs')).rejects.toMatchObject({
      status: 403,
      message: 'Turn off the deletion lock first',
    })
  })

  it('names only the callers the viewer can open when unsharing is blocked', async () => {
    // Daniel opens Sales only; IT calls Lead enrichment.
    const [lead] = (
      await items.listItems(daniel, { ...p101Slugs, workspace: 'sales' }, 'workflow')
    ).filter((i) => i.name === 'Lead enrichment')
    expect(lead!.usedBy).toEqual([])
    expect(lead!.shareToggle.reason).toBe(
      'Called by 1 other workspace. Unshare is blocked while another workspace uses it',
    )
    const shared = await items.listProjectShared(daniel, ...p101)
    expect(shared.find((i) => i.name === 'Provision account')!.usedBy.map((w) => w.name)).toEqual([
      'Sales',
    ])
  })

  it('counts a variable the project overrides once, as the Variables page lists it', async () => {
    getDb().variables.push({
      level: 'project',
      scopeId: 'prj_101',
      name: 'REGION',
      value: 'us',
      isSecret: false,
    })
    const counts = await setup.getProjectSetup(ama, ...p101)
    const listed = await variables.listProjectVariables(ama, ...p101)
    expect(counts).toMatchObject({ projectVariables: 3, orgVariables: 2 })
    expect(counts.projectVariables + counts.orgVariables).toBe(listed.length)
  })

  it('tags name and URL errors with their field', async () => {
    await expect(projects.updateProject(ama, ...p101, { name: '   ' })).rejects.toMatchObject({
      field: 'name',
    })
    await expect(
      projects.updateProject(ama, ...p101, { slug: 'marketing-site' }),
    ).rejects.toMatchObject({ status: 409, field: 'slug' })
    await expect(projects.updateProject(ama, ...p101, { slug: 'settings' })).rejects.toMatchObject({
      field: 'slug',
    })
  })
})

describe('deleting a project', () => {
  it('takes its keys and variables with it', async () => {
    getDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    await projects.deleteProject(ama, ...p101)
    expect(getDb().keys.some((k) => k.projectId === 'prj_101')).toBe(false)
    expect(getDb().variables.some((v) => v.scopeId === 'prj_101' || v.scopeId === 'ws_sales')).toBe(
      false,
    )
  })
})
