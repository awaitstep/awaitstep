import { beforeEach, describe, expect, it } from 'vitest'
import { resetMockDb } from '../db'
import { AMA, DANIEL, LENA, PRIYA } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { items, workspaces, projects, locks, runs } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const it_ = { ...sales, workspace: 'it' }
const support = { ...sales, workspace: 'support' }
const unlockProject = () =>
  locks.setLock(ama, { level: 'project', org: 'acme', project: 'project-101' }, false)

const bars = (results: string[]) =>
  results.map((r) => (r === 'succeeded' ? 'p' : r === 'failed' ? 'f' : 'r')).join('')

// Seeded at the real now: the 24-hour counts read the clock.
beforeEach(() => resetMockDb(new Date()))

describe('workspace items', () => {
  it('lists Sales’s four workflows and two functions with the board’s run bars', async () => {
    const workflows = await items.listItems(ama, sales, 'workflow')
    expect(workflows.map((w) => w.name)).toEqual([
      'Lead enrichment',
      'Quote follow-up',
      'Inbound webhook triage',
      'Weekly pipeline report',
    ])
    const byName = Object.fromEntries(workflows.map((w) => [w.name, w]))
    expect(bars(byName['Lead enrichment']!.recentRuns)).toBe('ppppfpppff')
    expect(bars(byName['Inbound webhook triage']!.recentRuns)).toBe('ppppppfppp')
    expect(byName['Weekly pipeline report']).toMatchObject({ status: 'draft', lastRun: null })
    // The waiting run doesn't count: "Succeeded 22m ago".
    expect(byName['Quote follow-up']!.lastRun?.result).toBe('succeeded')

    const functions = await items.listItems(ama, sales, 'script')
    expect(functions.map((f) => [f.name, f.route])).toEqual([
      ['CRM sync', 'POST /crm/sync'],
      ['Pricing webhook', 'POST /pricing'],
    ])
    expect(functions[0]!.traffic).toMatchObject({ requests: 2140, errorRate: 0.002 })
  })

  it('counts each workspace and rolls them up into project health', async () => {
    const [salesWs, itWs, supportWs] = await workspaces.listWorkspaces(ama, 'acme', 'project-101')
    expect(salesWs!.counts).toMatchObject({
      workflows: 4,
      functions: 2,
      sharedOut: 1,
      runs24h: 128,
      failing: 1,
    })
    expect(itWs!.counts).toMatchObject({ workflows: 4, functions: 1, sharedOut: 2, failing: 0 })
    expect(supportWs!.counts).toMatchObject({ workflows: 0, lastRunAt: null })

    const [p101, marketing] = await projects.listProjects(ama, 'acme')
    expect(p101!.health).toMatchObject({ workflows: 8, failing: 1 })
    expect(marketing!.health.failing).toBe(0)
  })

  it('keeps a hidden workspace’s items out of reach, and its health off the card', async () => {
    await expect(items.listItems(as(DANIEL), it_, 'workflow')).rejects.toMatchObject({
      status: 404,
    })
    const [p101] = await projects.listProjects(as(LENA), 'acme')
    expect(p101!.health.failing).toBe(0)
  })

  it('lets the owner flip a free share switch, blocks one in use, and Viewers flip none', async () => {
    const byName = async (ctx: MockContext) =>
      Object.fromEntries(
        (await items.listItems(ctx, sales, 'workflow')).map((w) => [w.name, w.shareToggle]),
      )
    const owner = await byName(ama)
    expect(owner['Quote follow-up']).toEqual({ allowed: true })
    expect(owner['Lead enrichment']).toEqual({
      allowed: false,
      reason: 'Called by IT. Unshare is blocked while another workspace uses it',
    })
    expect((await byName(as(PRIYA)))['Quote follow-up']).toEqual({
      allowed: false,
      reason: 'Building, deploying and sharing need an Editor',
    })
  })
})

describe('sharing', () => {
  it('shows what the other workspaces shared, read-only, with where it came from', async () => {
    const shared = await items.listSharedWith(as(DANIEL), sales)
    expect(shared.map((s) => [s.name, s.kind, s.from.name, s.version])).toEqual([
      ['Provision account', 'workflow', 'IT', 7],
      ['Send Slack alert', 'script', 'IT', 3],
    ])
    expect((await items.listSharedWith(as(DANIEL), sales, 'script')).map((s) => s.name)).toEqual([
      'Send Slack alert',
    ])
  })

  it('lists the project’s shared library with who uses each item', async () => {
    const shared = await items.listProjectShared(ama, 'acme', 'project-101')
    expect(shared.map((s) => [s.name, s.from.name, s.usedBy.map((w) => w.name)])).toEqual([
      ['Lead enrichment', 'Sales', ['IT']],
      ['Provision account', 'IT', ['Sales', 'Support']],
      ['Send Slack alert', 'IT', ['Sales']],
    ])
    expect(shared[0]).toMatchObject({ sharedBy: { id: AMA, name: 'Ama Mensah' } })
  })

  it('shares a workflow so the other workspaces see it, and unshares it again', async () => {
    const quote = (await items.listItems(as(DANIEL), sales, 'workflow')).find(
      (w) => w.name === 'Quote follow-up',
    )!
    const shared = await items.setShared(as(DANIEL), sales, quote.id, true)
    expect(shared.sharing?.sharedBy).toEqual({ id: DANIEL, name: 'Daniel Kim' })
    expect((await items.listSharedWith(ama, it_)).map((s) => s.name)).toContain('Quote follow-up')

    await items.setShared(as(DANIEL), sales, quote.id, false)
    expect((await items.listSharedWith(ama, it_)).map((s) => s.name)).not.toContain(
      'Quote follow-up',
    )
  })

  it('refuses to unshare an item another workspace calls, and Viewers can’t share', async () => {
    await expect(items.setShared(ama, sales, 'itm_lead', false)).rejects.toMatchObject({
      status: 409,
    })
    await expect(items.setShared(as(PRIYA), sales, 'itm_quote', true)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('blocks deleting a workspace whose shared items others call', async () => {
    await unlockProject()
    await expect(workspaces.deleteWorkspace(ama, sales)).rejects.toMatchObject({
      message: 'Other workspaces call its shared workflows. Unshare them first',
    })
  })

  it('deletes a workspace with its calls, so what it called is no longer “used by” it', async () => {
    await unlockProject()
    await workspaces.deleteWorkspace(ama, support)
    const provision = (await items.listProjectShared(ama, 'acme', 'project-101')).find(
      (s) => s.name === 'Provision account',
    )!
    expect(provision.usedBy.map((w) => w.name)).toEqual(['Sales'])
  })
})

describe('moving workflows', () => {
  it('moves workflows with their runs to another workspace in the project', async () => {
    await items.moveItems(ama, sales, { itemIds: ['itm_triage', 'itm_report'], to: 'support' })
    expect((await items.listItems(ama, sales, 'workflow')).map((w) => w.name)).toEqual([
      'Lead enrichment',
      'Quote follow-up',
    ])
    expect((await items.listItems(ama, support, 'workflow')).map((w) => w.name)).toEqual([
      'Inbound webhook triage',
      'Weekly pipeline report',
    ])
    const supportRuns = await runs.listRuns(ama, support, { search: 'run_8f03' })
    expect(supportRuns.data.map((r) => r.id)).toEqual(['run_8f03'])
  })

  it('drops the call when the caller becomes the owner', async () => {
    await items.moveItems(ama, sales, { itemIds: ['itm_lead'], to: 'it' })
    const lead = (await items.listItems(ama, it_, 'workflow')).find(
      (w) => w.name === 'Lead enrichment',
    )!
    expect(lead.usedBy).toEqual([])
    expect(lead.shareToggle.allowed).toBe(true)
  })

  it('needs workspace admin rights here, a real target, and something to move', async () => {
    await expect(
      items.moveItems(as(DANIEL), sales, { itemIds: ['itm_quote'], to: 'support' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      items.moveItems(ama, sales, { itemIds: ['itm_quote'], to: 'nope' }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(items.moveItems(ama, sales, { itemIds: [], to: 'it' })).rejects.toMatchObject({
      status: 422,
    })
    await expect(
      items.moveItems(ama, sales, { itemIds: ['itm_provision'], to: 'support' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('library', () => {
  it('is empty until modules land (W2)', async () => {
    expect(await items.listLibrary(ama, sales)).toEqual([])
  })
})
