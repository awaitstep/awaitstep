import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { resolveWorkflowEnvVars, unresolvableEnvRefs } from '../lib/env-resolve.js'

// A workflow's `{{global.env.X}}` references resolve against its place —
// its workspace, then its project, then the organization (B4) — through
// the real adapter, and a read of its source reports what does not resolve.

const validIR = {
  metadata: {
    name: 'test',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

describe('resolving a workflow’s variables at its place', () => {
  let h: SqliteApp
  const ORG = 'org=acme'
  const P101 = 'org=acme&project=project-101'
  const SALES = 'org=acme&project=project-101&workspace=sales'

  const set = async (at: string, name: string, value: string) => {
    const res = await h.app.request(
      `/api/env-vars?${at}`,
      h.as('u-ama', h.json({ name, value, isSecret: false })),
    )
    expect(res.status, `${name} at ${at}`).toBe(201)
    return (await res.json()) as { id: string }
  }

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
    await h.adapter.setWorkflowEnvVars('wf-sales', [
      { name: 'REGION', value: '{{global.env.REGION}}', isSecret: false },
      { name: 'PLAIN', value: 'literal', isSecret: false },
    ])
    await h.adapter.setWorkflowEnvVars('wf-ops', [
      { name: 'REGION', value: '{{global.env.REGION}}', isSecret: false },
    ])
  })

  it('takes the closest level’s value: the workspace’s, then the project’s, then the org’s', async () => {
    await set(ORG, 'REGION', 'eu')
    const inSales = { organizationId: 'org-acme', projectId: 'p-101', workspaceId: 'ws-sales' }
    const inOps = { organizationId: 'org-acme', projectId: 'p-101', workspaceId: 'ws-ops' }
    const sales = (await h.adapter.getWorkflowById('wf-sales'))!
    const ops = (await h.adapter.getWorkflowById('wf-ops'))!
    expect(await resolveWorkflowEnvVars(h.adapter, inSales, sales)).toEqual({
      REGION: { value: 'eu', isSecret: false },
      PLAIN: { value: 'literal', isSecret: false },
    })
    await set(P101, 'REGION', 'us')
    expect((await resolveWorkflowEnvVars(h.adapter, inSales, sales)).REGION!.value).toBe('us')
    await set(SALES, 'REGION', 'apac')
    expect((await resolveWorkflowEnvVars(h.adapter, inSales, sales)).REGION!.value).toBe('apac')
    // Ops has no value of its own: the project's.
    expect((await resolveWorkflowEnvVars(h.adapter, inOps, ops)).REGION!.value).toBe('us')
  })

  it('a source read resolves the same way, and names what does not resolve', async () => {
    const saved = await h.app.request(
      '/api/workflows/wf-sales/versions?projectId=p-101',
      h.as('u-ama', h.json({ ir: validIR })),
    )
    expect(saved.status).toBe(201)
    const read = () =>
      h.app.request('/api/workflows/wf-sales/source?projectId=p-101', h.as('u-ama'))
    const missing = (await (await read()).json()) as { diagnostics?: { source: string }[] }
    expect(missing.diagnostics?.filter((d) => d.source === 'env')).toHaveLength(1)
    expect(JSON.stringify(missing.diagnostics)).toContain('REGION')
    // A value set only in the workflow's workspace is enough.
    await set(SALES, 'REGION', 'apac')
    const resolved = (await (await read()).json()) as { diagnostics?: { source: string }[] }
    expect(resolved.diagnostics?.filter((d) => d.source === 'env') ?? []).toEqual([])
  })

  it('judges a move into another project by that project and the org, never a workspace there', async () => {
    await set(SALES, 'REGION', 'apac')
    const sales = (await h.adapter.getWorkflowById('wf-sales'))!
    // Project 202 cannot supply REGION: the org does not set it, nor does the project.
    expect(await unresolvableEnvRefs(h.adapter, 'org-acme', 'p-202', sales)).toEqual(['REGION'])
    await set(ORG, 'REGION', 'eu')
    expect(await unresolvableEnvRefs(h.adapter, 'org-acme', 'p-202', sales)).toEqual([])
  })
})
