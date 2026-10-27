import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, PRIYA } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { activity, items, projects, workspaces } = mockServer
const as = (userId: string): MockContext => ({ userId, scenario: 'none' })
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => resetMockDb(new Date('2026-10-26T12:00:00Z')))

describe('recent activity', () => {
  it('lists failures, deploys and shares across the org, newest first', async () => {
    const feed = await activity.listActivity(as(AMA), 'acme')
    expect(feed.length).toBeGreaterThan(3)
    expect(feed.length).toBeLessThanOrEqual(5)
    const times = feed.map((a) => a.at)
    expect(times).toEqual([...times].sort().reverse())
    expect(feed[0]).toMatchObject({
      kind: 'failed',
      title: 'Lead enrichment failed at step "Fetch company"',
      project: { name: 'Project 101' },
      workspace: { name: 'Sales', colour: 'green' },
    })
    const kinds = new Set(feed.map((a) => a.kind))
    expect(kinds).toEqual(new Set(['failed', 'deployed', 'shared']))
  })

  it('shows only what the viewer can open', async () => {
    const mine = await activity.listActivity(as(PRIYA), 'acme')
    const open = await projects.listProjects(as(PRIYA), 'acme')
    const openWorkspaces = new Set(
      open.flatMap((p) => p.workspaces.map((w) => `${p.slug}/${w.slug}`)),
    )
    expect(mine.length).toBeGreaterThan(0)
    for (const row of mine) {
      expect(openWorkspaces.has(`${row.project.slug}/${row.workspace.slug}`)).toBe(true)
    }
  })

  it('moves with the data: sharing an item puts it in the feed', async () => {
    const db = getDb()
    const salesWorkspace = db.workspaces.find((w) => w.slug === 'sales')!
    const item = db.items.find((i) => i.workspaceId === salesWorkspace.id && !i.sharing)!
    const before = await activity.listActivity(as(AMA), 'acme')
    expect(before.some((a) => a.id === `shared:${item.id}`)).toBe(false)
    await items.setShared(as(AMA), sales, item.id, true)
    const after = await activity.listActivity(as(AMA), 'acme')
    expect(after[0]).toMatchObject({
      id: `shared:${item.id}`,
      kind: 'shared',
      title: `${item.name} shared to Project 101`,
    })
  })
})

describe('deployed counts', () => {
  it('counts deployed workflows per workspace and per project', async () => {
    const ws = await workspaces.listWorkspaces(as(AMA), 'acme', 'project-101')
    for (const w of ws) {
      expect(w.counts.deployed).toBeLessThanOrEqual(w.counts.workflows)
    }
    const [p101] = await projects.listProjects(as(AMA), 'acme')
    expect(p101!.health.deployed).toBe(ws.reduce((sum, w) => sum + w.counts.deployed, 0))
    expect(p101!.health.deployed).toBeGreaterThan(0)
  })
})
