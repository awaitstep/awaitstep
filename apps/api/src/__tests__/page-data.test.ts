import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The page summaries answer one section, not a list: their key sets are the
// contract a page renders against. A new field is a deliberate change.

const keys = (value: unknown) => Object.keys(value as Record<string, unknown>).sort()

describe('page summaries', () => {
  let h: SqliteApp

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('answers the workspaces page in one project summary', async () => {
    const res = await h.app.request('/api/projects/p-101/summary?org=acme', h.as('u-ama'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(keys(body)).toEqual(['admins', 'projectKeys', 'shared', 'variables'])
    expect(keys(body.admins)).toEqual(['count', 'people'])
    expect(keys(body.variables)).toEqual(['first', 'inherited', 'own', 'total'])
    expect(keys(body.shared)).toEqual(['count', 'first'])
    expect(body.admins.people.length).toBeLessThanOrEqual(5)
    expect(body.variables.first.length).toBeLessThanOrEqual(2)
    expect(body.shared.first.length).toBeLessThanOrEqual(2)
  })

  it('answers the org home with a failing count and one row', async () => {
    const res = await h.app.request('/api/orgs/acme/home-summary', h.as('u-ama'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(keys(body)).toEqual(['failing'])
    expect(keys(body.failing)).toEqual(['count', 'first'])
  })

  it('answers a workspace overview with counts, attention, recent runs and shares', async () => {
    const res = await h.app.request('/api/workspaces/ws-sales/overview', h.as('u-ama'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(keys(body)).toEqual(['counts', 'needsAttention', 'recent', 'shared'])
    expect(keys(body.counts)).toEqual([
      'deployed',
      'failing',
      'functions',
      'lastRunAt',
      'runs24h',
      'sharedOut',
      'workflows',
    ])
    expect(body.recent.length).toBeLessThanOrEqual(4)
    expect(keys(body.shared)).toEqual(['in', 'out'])
  })

  it('answers a workspace settings tab pill count', async () => {
    const res = await h.app.request('/api/workspaces/ws-sales/settings-counts', h.as('u-ama'))
    expect(res.status).toBe(200)
    expect(keys(await res.json())).toEqual(['keys', 'members', 'variables'])
  })

  it('answers a workflow page summary', async () => {
    const res = await h.app.request(
      '/api/workflows/wf-sales/summary?org=acme&projectId=p-101',
      h.as('u-ama'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(keys(body)).toEqual([
      'currentVersion',
      'deployCount',
      'lastSuccessfulDeploy',
      'latestDeploy',
      'runs',
      'versionCount',
    ])
    expect(keys(body.runs)).toEqual(['byHour', 'counts', 'total'])
    expect(keys(body.runs.counts)).toEqual(['all', 'failed', 'running', 'succeeded'])
  })

  it('answers resources’ two tab pills', async () => {
    const res = await h.app.request('/api/resources/counts?org=acme', h.as('u-ama'))
    expect(res.status).toBe(200)
    expect(keys(await res.json())).toEqual(['installedNodes', 'variables'])
  })
})
