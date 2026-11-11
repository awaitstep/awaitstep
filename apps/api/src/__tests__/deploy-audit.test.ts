import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import {
  createTestApp,
  mockDb,
  recordedAuditEvents,
  resetStore,
  sentNotifications,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

// Deploys and takedowns in the audit log (B7). The provider is real except
// for the calls that would reach Cloudflare: credentials, deploy, destroy.

const outcome = { success: true, throws: false }
/** Resolves when a test lets the provider's deploy finish (otherwise it finishes at once). */
let deployGate: Promise<void> | null = null

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'verifyCredentials') return () => Promise.resolve({ valid: true })
          if (property === 'deployWithProgress' && deployGate) {
            const gate = deployGate
            // Like the Cloudflare adapter's `report`: progress is sent without waiting on it.
            return async (_b: unknown, _c: unknown, progress: (p: unknown) => Promise<void>) => {
              void progress({ stage: 'INITIALIZING', message: 'Starting', progress: 0 })
              await gate
              void progress({ stage: 'DEPLOYING', message: 'Uploading', progress: 60 })
              void progress({ stage: 'COMPLETED', message: 'Done', progress: 100 })
              return { success: true, deploymentId: 'awaitstep-wf-1' }
            }
          }
          if (
            property === 'deploy' ||
            property === 'deployWithProgress' ||
            property === 'destroy'
          ) {
            return () =>
              outcome.throws
                ? Promise.reject(new Error('wrangler failed in /srv/build/acct-123/worker.js'))
                : Promise.resolve({
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
    outcome.throws = false
    deployGate = null
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

  it('records who deployed, both ways of deploying', async () => {
    await post(app, '/deploy', { connectionId: 'conn-1' })
    await (await post(app, '/deploy-stream', { connectionId: 'conn-1' })).text()
    const { data } = await mockDb.listDeploymentsByWorkflow('wf-1')
    expect(data.map((d) => d.createdBy)).toEqual([TEST_USER_ID, TEST_USER_ID])
  })

  it('keeps deploying, and records the deploy, after the page leaves mid-stream', async () => {
    let release!: () => void
    deployGate = new Promise((resolve) => (release = resolve))
    const stream = await post(app, '/deploy-stream', { connectionId: 'conn-1' })
    const reader = stream.body!.getReader()
    await reader.read()
    // The browser goes away: later progress writes have no one to reach.
    await reader.cancel()
    release()
    await vi.waitFor(async () => {
      const { data } = await mockDb.listDeploymentsByWorkflow('wf-1')
      expect(data.map((d) => d.status)).toEqual(['success'])
    })
  })

  it('answers a provider crash with a generic reason, never its text', async () => {
    outcome.throws = true
    const stream = await post(app, '/deploy-stream', { connectionId: 'conn-1' })
    const body = await stream.text()
    expect(body).toContain('The deploy failed unexpectedly.')
    expect(body).not.toContain('/srv/build')
    expect(body).not.toContain('wrangler failed')
  })

  it('records nothing for a deploy that failed', async () => {
    outcome.success = false
    expect((await post(app, '/deploy', { connectionId: 'conn-1' })).status).toBe(500)
    expect(recordedAuditEvents()).toEqual([])
  })

  it('records a takedown that succeeded', async () => {
    // Takedown goes only through an account the workflow went out with.
    await mockDb.createDeployment({
      id: 'dep-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      serviceName: 'svc',
      status: 'success',
    })
    expect((await post(app, '/takedown', { connectionId: 'conn-1' })).status).toBe(200)
    expect(
      recordedAuditEvents().map((e) => [e.event, e.kind, e.action, e.target, e.detail]),
    ).toEqual([
      ['workflow.takedown', 'danger', 'took down', 'Lead enrichment', 'Production · Dashboard'],
    ])
    outcome.success = false
    await post(app, '/takedown', { connectionId: 'conn-1' })
    expect(recordedAuditEvents()).toHaveLength(1)
  })

  it('takes down on one account only, keeping its rows as history, the other account live and the saved version', async () => {
    await mockDb.createConnection({
      id: 'conn-2',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Staging',
      credentials: JSON.stringify({ accountId: 'acct2', apiToken: 'token2' }),
    })
    for (const [id, connectionId] of [
      ['dep-1', 'conn-1'],
      ['dep-2', 'conn-2'],
    ]) {
      await mockDb.createDeployment({
        id: id!,
        workflowId: 'wf-1',
        versionId: 'v-1',
        versionNumber: 1,
        connectionId,
        serviceName: 'svc',
        status: 'success',
      })
    }
    expect((await post(app, '/takedown', { connectionId: 'conn-1' })).status).toBe(200)
    const { data } = await mockDb.listDeploymentsByWorkflow('wf-1')
    expect(
      Object.fromEntries(data.map((d) => [d.id, [d.status, d.takenDownBy, d.version]])),
    ).toEqual({ 'dep-1': ['taken_down', TEST_USER_ID, 1], 'dep-2': ['success', null, 1] })
    expect((await mockDb.getWorkflowById('wf-1'))?.currentVersionId).toBe('v-1')
    // Only the other account is live: a trigger on the taken-down one is refused.
    expect((await mockDb.listLiveDeployments('wf-1')).map((l) => l.id)).toEqual(['conn-2'])
    expect((await post(app, '/trigger', { connectionId: 'conn-1', params: {} })).status).toBe(404)
  })

  it('tells the project’s other workspaces of a shared workflow’s deploy, filed at the project', async () => {
    const wf = (await mockDb.getWorkflowById('wf-1'))!
    await mockDb.setWorkflowShared('wf-1', wf.workspaceId!, TEST_USER_ID, true)
    await post(app, '/deploy', { connectionId: 'conn-1' })
    expect(sentNotifications()).toHaveLength(1)
    expect(sentNotifications()[0]).toMatchObject({
      event: 'workflow.deploy.shared',
      kind: 'deploy',
      needsAction: false,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      workspaceId: null,
      meta: { workflow: 'Lead enrichment', version: 1 },
      recipients: {
        otherWorkspaceAdmins: { projectId: TEST_PROJECT_ID, workspaceId: wf.workspaceId },
      },
      excludeUserId: TEST_USER_ID,
      onRepeat: 'fold',
    })
    // One row a workflow an hour: a second deploy folds into it.
    await post(app, '/deploy', { connectionId: 'conn-1' })
    expect(sentNotifications()[1]!.groupKey).toBe(sentNotifications()[0]!.groupKey)
    expect(sentNotifications()[0]!.groupKey).toMatch(
      /^workflow\.deploy\.shared:wf-1:\d{4}-\d{2}-\d{2}T\d{2}$/,
    )
  })

  it('tells nobody of a deploy of an unshared workflow, or one that failed', async () => {
    await post(app, '/deploy', { connectionId: 'conn-1' })
    const wf = (await mockDb.getWorkflowById('wf-1'))!
    await mockDb.setWorkflowShared('wf-1', wf.workspaceId!, TEST_USER_ID, true)
    outcome.success = false
    await post(app, '/deploy', { connectionId: 'conn-1' })
    expect(sentNotifications()).toEqual([])
  })
})
