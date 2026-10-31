import { beforeEach, describe, expect, it } from 'vitest'
import { resetMockDb } from '../db'
import { AMA, DANIEL, LENA, PRIYA, TOM } from '../fixtures/people'
import { type MockContext, MockApiError } from '../scenario'
import { mockServer } from '../server'

const { session, projects, workspaces, locks } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

async function scopeOf(ctx: MockContext, slugs: Parameters<typeof workspaces.getScope>[1]) {
  const lookup = await workspaces.getScope(ctx, slugs)
  if (!lookup.found) throw new Error(`expected ${JSON.stringify(slugs)} to resolve`)
  return lookup
}

beforeEach(() => resetMockDb(new Date('2026-10-26T12:00:00Z')))

describe('seed', () => {
  it('holds the canvas projects and workspaces', async () => {
    const list = await projects.listProjects(ama, 'acme')
    expect(list.map((p) => p.name)).toEqual(['Project 101', 'Marketing Site', 'Internal Tools'])

    const ws = await workspaces.listWorkspaces(ama, 'acme', 'project-101')
    expect(ws.map((w) => [w.name, w.colour])).toEqual([
      ['Sales', 'green'],
      ['IT', 'blue'],
      ['Support', 'amber'],
    ])
    expect(ws[0]!.people.map((p) => p.initials)).toEqual(['AM', 'DK', 'PS', 'TB'])
    expect(ws[1]!.people).toHaveLength(3)
  })

  it('has Project 101 locked by Ama on 12 Oct, inherited by its workspaces', async () => {
    const { project, workspace } = await scopeOf(ama, sales)
    expect(project!.project.lock.own).toEqual({
      setBy: { id: AMA, name: 'Ama Mensah' },
      setAt: '2026-10-12T09:30:00.000Z',
    })
    expect(workspace!.workspace.lock.inherited?.fromName).toBe('Project 101')
  })

  it('lists the viewer’s organizations and the one opened last', async () => {
    const orgs = await session.listOrgs(as(DANIEL))
    expect(orgs.map((o) => [o.name, o.role])).toEqual([
      ['Acme Inc', 'member'],
      ['Daniel’s sandbox', 'owner'],
    ])
    // The /dashboard card: Daniel's own Sales grant in Acme; nothing listed where he owns.
    expect(orgs[0]!.grants.workspaces).toEqual([
      { name: 'Sales', projectName: 'Project 101', role: 'editor' },
    ])
    expect(orgs[1]!.grants).toEqual({ projects: [], workspaces: [] })
    expect(orgs[0]!.health).toEqual({ failing: expect.any(Number), lastRunAt: expect.any(String) })
    expect((await session.getViewer(as(DANIEL))).lastOrgSlug).toBe('acme')
    await session.openOrg(as(DANIEL), 'daniels-sandbox')
    expect((await session.getViewer(as(DANIEL))).lastOrgSlug).toBe('daniels-sandbox')
  })
})

describe('getScope', () => {
  it('resolves org, project and workspace with the viewer’s role and capabilities', async () => {
    const scope = await scopeOf(as(PRIYA), sales)
    expect(scope.org.viewerRole).toBe('member')
    expect(scope.project!.viewerRole).toBeNull()
    expect(scope.workspace!.viewerRole).toBe('viewer')
    expect(scope.workspace!.viewerCan.edit.allowed).toBe(false)
    expect(scope.workspace!.viewerCan.run.allowed).toBe(true)
  })

  it('gives the same not-found for a missing workspace and a hidden one', async () => {
    const missing = await workspaces.getScope(as(DANIEL), { ...sales, workspace: 'nope' })
    const hidden = await workspaces.getScope(as(DANIEL), { ...sales, workspace: 'it' })
    const strip = (lookup: typeof missing) =>
      lookup.found ? lookup : { ...lookup, notFound: { ...lookup.notFound, slug: '*' } }
    expect(missing.found).toBe(false)
    expect(strip(hidden)).toEqual(strip(missing))
    expect(hidden).toEqual({
      found: false,
      notFound: {
        kind: 'workspace',
        slug: 'it',
        parent: { name: 'Project 101', slug: 'project-101' },
      },
    })
  })

  it('reports a hidden project and an unknown org as not found', async () => {
    expect(
      await workspaces.getScope(as(DANIEL), { org: 'acme', project: 'marketing-site' }),
    ).toEqual({
      found: false,
      notFound: {
        kind: 'project',
        slug: 'marketing-site',
        parent: { name: 'Acme Inc', slug: 'acme' },
      },
    })
    expect(await workspaces.getScope(ama, { org: 'globex' })).toEqual({
      found: false,
      notFound: { kind: 'organization', slug: 'globex', parent: null },
    })
  })
})

describe('projects', () => {
  it('creates a project with a Default workspace and the creator as project admin', async () => {
    const { project, workspace } = await projects.createProject(as(DANIEL), 'acme', {
      name: 'Billing',
      description: '  Invoices  ',
    })
    expect(project).toMatchObject({ slug: 'billing', name: 'Billing', description: 'Invoices' })
    expect(workspace).toMatchObject({ slug: 'default', name: 'Default' })
    const scope = await scopeOf(as(DANIEL), {
      org: 'acme',
      project: 'billing',
      workspace: 'default',
    })
    expect(scope.project!.viewerRole).toBe('admin')
    expect(scope.workspace!.viewerRole).toBe('admin')
    expect((await projects.listProjects(as(DANIEL), 'acme')).map((p) => p.slug)).toContain(
      'billing',
    )
  })

  it('suffixes a taken slug and refuses an empty name', async () => {
    const { project } = await projects.createProject(ama, 'acme', { name: 'Project 101' })
    expect(project.slug).toBe('project-101-2')
    await expect(projects.createProject(ama, 'acme', { name: '  ' })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('refuses a name or URL with no letters or numbers instead of falling back to /default', async () => {
    await expect(projects.createProject(ama, 'acme', { name: '###' })).rejects.toMatchObject({
      status: 422,
      message: 'The project name needs at least one letter or number',
    })
    for (const slug of ['', '!!!']) {
      await expect(
        projects.updateProject(ama, 'acme', 'project-101', { slug }),
      ).rejects.toMatchObject({
        status: 422,
        message: 'The URL needs at least one letter or number',
      })
      await expect(workspaces.updateWorkspace(ama, sales, { slug })).rejects.toMatchObject({
        status: 422,
      })
    }
    await expect(
      workspaces.createWorkspace(ama, 'acme', 'project-101', {
        name: '***',
        colour: 'blue',
        access: { kind: 'admins' },
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect((await scopeOf(ama, sales)).project!.project.slug).toBe('project-101')
  })

  it('keeps projects and workspaces off the URLs dashboard pages own', async () => {
    const { project } = await projects.createProject(ama, 'acme', { name: 'Settings' })
    expect(project.slug).toBe('settings-2')
    const inbox = await projects.createProject(ama, 'acme', { name: 'Inbox' })
    expect(inbox.project.slug).toBe('inbox-2')
    const workspace = await workspaces.createWorkspace(ama, 'acme', 'project-101', {
      name: 'Settings',
      colour: 'blue',
      access: { kind: 'admins' },
    })
    expect(workspace.slug).toBe('settings-2')
    await expect(
      projects.updateProject(ama, 'acme', 'project-101', { slug: 'audit' }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/dashboard page/) })
    await expect(
      workspaces.updateWorkspace(ama, sales, { slug: 'settings' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('counts and shows only what the viewer can open', async () => {
    const acme = (await session.listOrgs(as(PRIYA))).find((o) => o.slug === 'acme')!
    expect(acme.projectCount).toBe(1)
    expect((await session.listOrgs(ama)).find((o) => o.slug === 'acme')!.projectCount).toBe(3)

    const [p101] = await projects.listProjects(as(DANIEL), 'acme')
    expect(p101!.workspaces.map((w) => w.slug)).toEqual(['sales'])
    expect(p101!.people.map((p) => p.id)).not.toContain(LENA)
    const [ownView] = await projects.listProjects(ama, 'acme')
    expect(ownView!.people.map((p) => p.id)).toContain(LENA)
  })

  it('renames a project and refuses a URL another project uses, changing nothing', async () => {
    await expect(
      projects.updateProject(ama, 'acme', 'project-101', { name: 'P1', slug: 'marketing-site' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(
      (await scopeOf(ama, { org: 'acme', project: 'project-101' })).project!.project.name,
    ).toBe('Project 101')
    const renamed = await projects.updateProject(ama, 'acme', 'project-101', {
      slug: 'Project One',
    })
    expect(renamed.slug).toBe('project-one')
  })

  it('keeps project settings from people who aren’t project admins', async () => {
    await expect(
      projects.updateProject(as(DANIEL), 'acme', 'project-101', { name: 'Mine' }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Only project admins and org owners can do this',
    })
  })

  it('refuses to delete a locked project, and deletes it once unlocked', async () => {
    await expect(projects.deleteProject(ama, 'acme', 'project-101')).rejects.toMatchObject({
      status: 403,
      message: 'Turn off the deletion lock first',
    })
    await locks.setLock(ama, { level: 'project', org: 'acme', project: 'project-101' }, false)
    await projects.deleteProject(ama, 'acme', 'project-101')
    expect((await workspaces.getScope(ama, sales)).found).toBe(false)
  })
})

describe('workspaces', () => {
  it('creates a workspace that admits only the chosen people', async () => {
    const created = await workspaces.createWorkspace(as(TOM), 'acme', 'project-101', {
      name: 'Finance',
      colour: 'rose',
      access: { kind: 'pick', people: [{ userId: PRIYA, role: 'editor' }] },
    })
    expect(created).toMatchObject({ slug: 'finance', colour: 'rose' })
    const finance = { ...sales, workspace: 'finance' }
    expect((await scopeOf(as(PRIYA), finance)).workspace!.viewerRole).toBe('editor')
    expect((await workspaces.getScope(as(DANIEL), finance)).found).toBe(false)
    const names = (await workspaces.listWorkspaces(as(TOM), 'acme', 'project-101')).map(
      (w) => w.name,
    )
    expect(names).toEqual(['Sales', 'IT', 'Support', 'Finance'])
  })

  it('lets only project admins create workspaces', async () => {
    await expect(
      workspaces.createWorkspace(as(LENA), 'acme', 'project-101', {
        name: 'Ops',
        colour: 'blue',
        access: { kind: 'admins' },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('updates name, URL and colour, refusing a URL a sibling uses', async () => {
    const it = { ...sales, workspace: 'it' }
    await expect(workspaces.updateWorkspace(as(LENA), it, { slug: 'sales' })).rejects.toMatchObject(
      {
        status: 409,
      },
    )
    const updated = await workspaces.updateWorkspace(as(LENA), it, {
      name: 'IT Ops',
      colour: 'purple',
    })
    expect(updated).toMatchObject({ name: 'IT Ops', colour: 'purple', slug: 'it' })
  })

  it('refuses to delete a workspace while the project is locked, or the last one', async () => {
    await expect(
      workspaces.deleteWorkspace(ama, { ...sales, workspace: 'support' }),
    ).rejects.toMatchObject({
      message: 'Locked by Project 101',
    })
    await expect(
      workspaces.deleteWorkspace(ama, {
        org: 'acme',
        project: 'marketing-site',
        workspace: 'default',
      }),
    ).rejects.toMatchObject({ message: 'A project’s last workspace can’t be deleted' })
    await locks.setLock(ama, { level: 'project', org: 'acme', project: 'project-101' }, false)
    await workspaces.deleteWorkspace(ama, { ...sales, workspace: 'support' })
    expect(
      (await workspaces.listWorkspaces(ama, 'acme', 'project-101')).map((w) => w.slug),
    ).toEqual(['sales', 'it'])
  })
})

describe('deletion lock', () => {
  it('records who set a workspace lock, and an Editor may set it', async () => {
    await locks.setLock(ama, { level: 'project', org: 'acme', project: 'project-101' }, false)
    const state = await locks.setLock(as(DANIEL), { level: 'workspace', ...sales }, true)
    expect(state.own?.setBy).toEqual({ id: DANIEL, name: 'Daniel Kim' })
    const scope = await scopeOf(ama, sales)
    expect(scope.workspace!.viewerCan.delete).toEqual({
      allowed: false,
      reason: 'Turn off the deletion lock first',
    })
  })

  it('keeps who set a lock when it is turned on again', async () => {
    const state = await locks.setLock(
      as(TOM),
      { level: 'project', org: 'acme', project: 'project-101' },
      true,
    )
    expect(state.own).toEqual({
      setBy: { id: AMA, name: 'Ama Mensah' },
      setAt: '2026-10-12T09:30:00.000Z',
    })
  })

  it('locks every workspace when the project is locked, and Viewers can’t toggle', async () => {
    await locks.setLock(ama, { level: 'project', org: 'acme', project: 'project-101' }, false)
    const support = { ...sales, workspace: 'support' }
    expect((await scopeOf(ama, support)).workspace!.viewerCan.delete.allowed).toBe(true)
    await locks.setLock(as(TOM), { level: 'project', org: 'acme', project: 'project-101' }, true)
    const { project, workspace } = await scopeOf(ama, sales)
    expect(project!.viewerCan.delete.reason).toBe('Turn off the deletion lock first')
    expect(workspace!.viewerCan.delete.reason).toBe('Locked by Project 101')
    await expect(
      locks.setLock(as(PRIYA), { level: 'workspace', ...sales }, true),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('scenarios', () => {
  it('never answers a list under loading', async () => {
    const outcome = await Promise.race([
      projects.listProjects(as(AMA, 'loading'), 'acme').then(() => 'answered'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
    ])
    expect(outcome).toBe('pending')
  })

  it('fails a list under error with a request id', async () => {
    const failure = await projects.listProjects(as(AMA, 'error'), 'acme').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(MockApiError)
    expect((failure as MockApiError).errorId).toMatch(/^req_[0-9a-f]{8}$/)
  })

  it('empties lists under empty but still resolves the scope', async () => {
    expect(await projects.listProjects(as(AMA, 'empty'), 'acme')).toEqual([])
    expect((await workspaces.getScope(as(AMA, 'empty'), sales)).found).toBe(true)
  })

  it('keeps the frame (viewer, orgs, scope, workspace switcher) under loading and error', async () => {
    for (const scenario of ['loading', 'error'] as const) {
      const ctx = as(AMA, scenario)
      expect((await session.getViewer(ctx)).id).toBe(AMA)
      expect(await session.listOrgs(ctx)).toHaveLength(2)
      expect((await workspaces.getScope(ctx, sales)).found).toBe(true)
      expect(await workspaces.listWorkspaces(ctx, 'acme', 'project-101')).toHaveLength(3)
    }
  })

  it('treats the viewer as a Viewer under viewer', async () => {
    const scope = await scopeOf(as(AMA, 'viewer'), sales)
    expect(scope.workspace!.viewerRole).toBe('viewer')
    expect(scope.workspace!.viewerCan.edit.allowed).toBe(false)
    expect(scope.workspace!.viewerCan.deploy.allowed).toBe(false)
    expect(scope.workspace!.viewerCan.run.allowed).toBe(true)
  })
})
