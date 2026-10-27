import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, PRIYA } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'
import { NOT_AN_EXPORT } from '../server/items'

const { items, requests, setup, projects, workspaces, locks } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const priya = as(PRIYA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const support = { ...sales, workspace: 'support' }
const exportFile = (body: unknown, fileName = 'lead-scoring.json') => ({
  fileName,
  content: JSON.stringify(body),
})

beforeEach(() => resetMockDb(new Date()))

describe('new workflow and new function', () => {
  it('adds an untitled draft at the top of its list, numbering repeats', async () => {
    const first = await items.createItem(ama, sales, { kind: 'workflow' })
    const second = await items.createItem(ama, sales, { kind: 'workflow' })
    expect(first).toMatchObject({
      name: 'Untitled workflow',
      status: 'draft',
      version: null,
      lastRun: null,
      sharing: null,
    })
    expect(second.name).toBe('Untitled workflow 2')

    const list = await items.listItems(ama, sales, 'workflow')
    expect(list.slice(0, 2).map((w) => w.name)).toEqual([
      'Untitled workflow 2',
      'Untitled workflow',
    ])
    const [salesWs] = await workspaces.listWorkspaces(ama, 'acme', 'project-101')
    expect(salesWs!.counts.workflows).toBe(6)
  })

  it('names a new function "Untitled function" and keeps it off the workflow list', async () => {
    await items.createItem(ama, sales, { kind: 'script' })
    expect((await items.listItems(ama, sales, 'script'))[0]!.name).toBe('Untitled function')
    expect((await items.listItems(ama, sales, 'workflow')).map((w) => w.name)).not.toContain(
      'Untitled function',
    )
  })

  it('refuses a Viewer', async () => {
    await expect(items.createItem(priya, sales, { kind: 'workflow' })).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('import', () => {
  it('turns an export into a draft named from its metadata, as real exports carry it', async () => {
    const item = await items.importItem(
      ama,
      sales,
      exportFile({
        metadata: { name: 'Lead scoring', description: 'Score leads', version: 1 },
        nodes: [],
      }),
    )
    expect(item).toMatchObject({
      kind: 'workflow',
      name: 'Lead scoring',
      description: 'Score leads',
      status: 'draft',
    })
  })

  it('falls back to the file name, and imports a function export as a function', async () => {
    const item = await items.importItem(ama, sales, exportFile({ kind: 'script', nodes: [] }))
    expect(item).toMatchObject({ kind: 'script', name: 'lead-scoring' })
  })

  it('drops the .ir.json the export menu names files with', async () => {
    const item = await items.importItem(
      ama,
      sales,
      exportFile({ nodes: [] }, 'lead-enrichment.ir.json'),
    )
    expect(item.name).toBe('lead-enrichment')
  })

  it('ignores a top-level name, which real exports don’t have', async () => {
    const item = await items.importItem(ama, sales, exportFile({ name: 'Stray', nodes: [] }))
    expect(item.name).toBe('lead-scoring')
  })

  it('rejects files that aren’t JSON or have no nodes list', async () => {
    for (const content of ['not json', '[]', '{"name":"x"}', '{"nodes":{}}']) {
      await expect(
        items.importItem(ama, sales, { fileName: 'x.json', content }),
      ).rejects.toMatchObject({ status: 422, message: NOT_AN_EXPORT })
    }
  })
})

describe('ask for edit access', () => {
  it('sends a Viewer’s request to the workspace’s first admin, once, and keeps it', async () => {
    // Start without the Inbox board's request from her.
    getDb().editRequests = []
    expect(await requests.getEditRequest(priya, sales)).toBeNull()
    const request = await requests.requestEditAccess(priya, sales)
    expect(request).toMatchObject({
      from: { id: PRIYA, name: 'Priya Shah' },
      to: { id: AMA, name: 'Ama Mensah' },
    })
    const again = await requests.requestEditAccess(priya, sales)
    expect(again.id).toBe(request.id)
    expect(getDb().editRequests).toHaveLength(1)
    expect(await requests.getEditRequest(priya, sales)).toEqual(request)
  })

  it('still shows "Asked …" while the lists load', async () => {
    await requests.requestEditAccess(priya, sales)
    expect(await requests.getEditRequest(as(PRIYA, 'loading'), sales)).not.toBeNull()
  })

  it('asks someone else when the viewer is the first admin (?mock=viewer as Ama)', async () => {
    const request = await requests.requestEditAccess(as(AMA, 'viewer'), sales)
    expect(request.to.id).not.toBe(AMA)
  })

  it('refuses someone who can already edit', async () => {
    await expect(requests.requestEditAccess(as(DANIEL), sales)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('goes with its workspace when that is deleted', async () => {
    await requests.requestEditAccess(as(AMA, 'viewer'), support)
    await locks.setLock(ama, { level: 'project', org: 'acme', project: 'project-101' }, false)
    await workspaces.deleteWorkspace(ama, support)
    expect(getDb().editRequests.map((r) => r.workspaceId)).toEqual(['ws_sales'])
  })
})

describe('workspace people', () => {
  it('labels a project admin’s role inherited, and a workspace grant above Editor its own', async () => {
    // Daniel becomes a project member, then the Sales workspace makes him Admin.
    const db = getDb()
    db.projectMembers.push({ projectId: 'prj_101', userId: DANIEL, role: 'member' })
    const grant = db.workspaceMembers.find(
      (m) => m.workspaceId === 'ws_sales' && m.userId === DANIEL,
    )
    if (grant) grant.role = 'admin'
    else db.workspaceMembers.push({ workspaceId: 'ws_sales', userId: DANIEL, role: 'admin' })

    const people = await workspaces.listWorkspacePeople(ama, sales)
    const byName = Object.fromEntries(people.map((p) => [p.person.name, p]))
    expect(byName['Ama Mensah']).toMatchObject({ role: 'admin', inherited: true })
    expect(byName['Daniel Kim']).toMatchObject({ role: 'admin', inherited: false })
    expect(byName['Priya Shah']).toMatchObject({ role: 'viewer', inherited: false })
  })
})

describe('project setup counts', () => {
  it('counts Project 101’s lists: Cloudflare connected, 3 org + 2 project variables, 3 keys', async () => {
    expect(await setup.getProjectSetup(ama, 'acme', 'project-101')).toEqual({
      cloudflareConnected: true,
      orgVariables: 3,
      projectVariables: 2,
      projectKeys: 3,
    })
  })

  it('starts a new project with nothing of its own', async () => {
    const { project } = await projects.createProject(ama, 'acme', { name: 'Billing' })
    // Acme's accounts list their projects; none lists the new one yet.
    expect(await setup.getProjectSetup(ama, 'acme', project.slug)).toEqual({
      cloudflareConnected: false,
      orgVariables: 3,
      projectVariables: 0,
      projectKeys: 0,
    })
  })
})
