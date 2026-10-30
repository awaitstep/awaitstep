import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import {
  createTestApp,
  mockDb,
  recordedAuditEvents,
  resetStore,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

// Deploys and takedowns in the audit log (B7). The provider is real except
// for the calls that would reach Cloudflare: credentials, deploy, destroy.

const outcome = { success: true }

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'verifyCredentials') return () => Promise.resolve({ valid: true })
          if (
            property === 'deploy' ||
            property === 'deployWithProgress' ||
            property === 'destroy'
          ) {
            return () =>
              Promise.resolve({
                success: outcome.success,
                deploymentId: 'awaitstep-wf-1',
                ...(outcome.success ? {} : { error: 'boom' }),
              })
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

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

const url = (path: string) => `/api/workflows/wf-1${path}?projectId=${TEST_PROJECT_ID}`
const post = (app: ReturnType<typeof createTestApp>, path: string, body: unknown) =>
  app.request(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('deploys in the audit log', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    outcome.success = true
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    const version = await mockDb.createVersion({
      id: 'v-1',
      workflowId: 'wf-1',
      ir: JSON.stringify(validIR),
    })
    await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
    await mockDb.createConnection({
      id: 'conn-1',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Production',
      credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
    })
  })

  it('records a deploy with its version and connection, both ways of deploying', async () => {
    expect((await post(app, '/deploy', { connectionId: 'conn-1' })).status).toBe(200)
    const stream = await post(app, '/deploy-stream', { connectionId: 'conn-1' })
    await stream.text()
    expect(recordedAuditEvents().map((e) => [e.event, e.kind, e.target, e.detail])).toEqual([
      ['workflow.deploy', 'deploy', 'Lead enrichment v1', 'Production · Dashboard'],
      ['workflow.deploy', 'deploy', 'Lead enrichment v1', 'Production · Dashboard'],
    ])
    expect(JSON.stringify(recordedAuditEvents())).not.toContain('token')
  })

  it('records nothing for a deploy that failed', async () => {
    outcome.success = false
    expect((await post(app, '/deploy', { connectionId: 'conn-1' })).status).toBe(500)
    expect(recordedAuditEvents()).toEqual([])
  })

  it('records a takedown that succeeded', async () => {
    expect((await post(app, '/takedown', { connectionId: 'conn-1' })).status).toBe(200)
    expect(recordedAuditEvents().map((e) => [e.event, e.kind, e.action, e.target])).toEqual([
      ['workflow.takedown', 'danger', 'took down', 'Lead enrichment'],
    ])
    outcome.success = false
    await post(app, '/takedown', { connectionId: 'conn-1' })
    expect(recordedAuditEvents()).toHaveLength(1)
  })
})
