import { eq } from 'drizzle-orm'
import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { deployAnswer } from '../routes/deploy.js'

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

  it('answers the org home with a failing count, one row and recent activity', async () => {
    const res = await h.app.request('/api/orgs/acme/home-summary', h.as('u-ama'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(keys(body)).toEqual(['activity', 'failing'])
    expect(body.activity).toEqual([])
    expect(keys(body.failing)).toEqual(['count', 'first'])
  })

  it('answers the org home’s activity rows with names, never a worker URL or an account', async () => {
    const now = '2026-11-01T00:00:00.000Z'
    await h.db.insert(h.schema.connections).values({
      id: 'c-acme',
      organizationId: 'org-acme',
      createdBy: 'u-ama',
      provider: 'cloudflare',
      name: 'Acme production',
      credentials: '{"accountId":"a","apiToken":"t"}',
      createdAt: now,
      updatedAt: now,
    })
    await h.db.insert(h.schema.deployments).values({
      id: 'd-sales',
      workflowId: 'wf-sales',
      connectionId: 'c-acme',
      versionNumber: 3,
      serviceName: 'svc',
      serviceUrl: 'https://in-sales.acme.workers.dev',
      status: 'success',
      createdAt: now,
    })
    const res = await h.app.request('/api/orgs/acme/home-summary', h.as('u-ama'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('workers.dev')
    expect(text).not.toContain('Acme production')
    expect(JSON.parse(text).activity).toEqual([
      {
        id: 'deployed:d-sales',
        kind: 'deployed',
        workflow: { name: 'In sales', kind: 'workflow' },
        version: 3,
        project: { slug: 'project-101', name: 'Project 101' },
        workspace: { slug: 'sales', name: 'Sales', colour: expect.any(String) },
        at: now,
      },
    ])

    // Gus can open Ops only: Sales's deploy is not his to see.
    const gus = await h.app.request('/api/orgs/acme/home-summary', h.as('u-gus'))
    expect((await gus.json()).activity).toEqual([])
  })

  it('answers Not found to someone outside the org', async () => {
    const res = await h.app.request('/api/orgs/acme/home-summary', h.as('u-hal'))
    expect(res.status).toBe(404)
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

describe('the worker’s URL', () => {
  // D-8: the API runs a workflow (POST /api/run/:id); the worker's own URL
  // stays on the server, so no page can send anyone to it unrecorded.
  it('is in no page response', async () => {
    const h = createSqliteApp()
    await seedAcme(h)
    const now = '2026-11-01T00:00:00.000Z'
    await h.db.insert(h.schema.connections).values({
      id: 'c-acme',
      organizationId: 'org-acme',
      createdBy: 'u-ama',
      provider: 'cloudflare',
      name: 'Acme production',
      credentials: '{"accountId":"a","apiToken":"t"}',
      createdAt: now,
      updatedAt: now,
    })
    await h.db.insert(h.schema.deployments).values({
      id: 'd-sales',
      workflowId: 'wf-sales',
      connectionId: 'c-acme',
      serviceName: 'svc',
      serviceUrl: 'https://in-sales.acme.workers.dev',
      status: 'success',
      createdAt: now,
    })
    for (const path of [
      '/api/workflows/wf-sales/full?projectId=p-101',
      '/api/workflows/wf-sales/summary?projectId=p-101',
      '/api/workflows/wf-sales/deploy-connections?projectId=p-101',
      '/api/workflows/wf-sales/deployments?projectId=p-101',
      '/api/deployments?projectId=p-101',
    ]) {
      const res = await h.app.request(path, h.as('u-ama'))
      expect(res.status, path).toBe(200)
      expect(await res.text(), path).not.toContain('workers.dev')
    }
    // What a call needs to know is whether it can be made there.
    const offered = await h.app.request(
      '/api/workflows/wf-sales/deploy-connections?projectId=p-101',
      h.as('u-ama'),
    )
    expect(
      ((await offered.json()) as { deployedWith: { callable: boolean }[] }).deployedWith,
    ).toEqual([expect.objectContaining({ id: 'c-acme', callable: true })])

    // A route's address is not one the server calls: not callable, and still not sent.
    await h.db
      .update(h.schema.deployments)
      .set({ serviceUrl: 'https://api.acme.com' })
      .where(eq(h.schema.deployments.id, 'd-sales'))
    const routed = await h.app.request(
      '/api/workflows/wf-sales/deploy-connections?projectId=p-101',
      h.as('u-ama'),
    )
    const text = await routed.text()
    expect(text).not.toContain('api.acme.com')
    expect((JSON.parse(text) as { deployedWith: { callable: boolean }[] }).deployedWith).toEqual([
      expect.objectContaining({ callable: false }),
    ])
  })

  it('is not in a deploy’s answer', () => {
    expect(
      deployAnswer({
        success: true,
        deploymentId: 'svc',
        deployedName: 'in-sales',
        url: 'https://in-sales.acme.workers.dev',
        dashboardUrl: 'https://dash.cloudflare.com/a/workers/services/view/svc',
      }),
    ).toEqual({
      success: true,
      deploymentId: 'svc',
      dashboardUrl: 'https://dash.cloudflare.com/a/workers/services/view/svc',
    })
  })
})
