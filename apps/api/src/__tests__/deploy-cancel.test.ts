import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DeployRunOptions } from '@awaitstep/codegen'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import {
  CANCEL_FINISHED,
  CANCEL_INTERRUPTED,
  CANCEL_TOO_LATE,
  DEPLOY_CANCELLED,
} from '../routes/deploy.js'
import {
  createTestApp,
  mockDb,
  recordedAuditEvents,
  resetStore,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

// Cancelling a deploy (plan/deploy-cancel.md): the deploy's row is written
// as it starts, a cancel turns it to `cancelling`, and the running deploy
// stops before it uploads. Once the upload starts the cancel is refused.

vi.setConfig({ testTimeout: 20_000 })

/**
 * The provider as the tests drive it: it "installs" until released or
 * cancelled, asks before uploading, and can be held mid-upload.
 */
const provider = vi.hoisted(() => ({
  holdBeforeUpload: false,
  holdDuringUpload: false,
  throws: false,
  uploaded: false,
  releaseInstall: null as null | (() => void),
  releaseUpload: null as null | (() => void),
}))

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'verifyCredentials') return () => Promise.resolve({ valid: true })
          if (property === 'deploy') {
            return async (_bundle: unknown, _config: unknown, run?: DeployRunOptions) => {
              if (provider.throws) throw new Error('wrangler failed in /srv/build')
              const cancelled = () => {
                run?.onProgress?.({ stage: 'CANCELLED', message: 'Deploy cancelled', progress: 0 })
                return { success: false, deploymentId: '', cancelled: true }
              }
              run?.onProgress?.({ stage: 'INITIALIZING', message: 'Preparing', progress: 5 })
              const installed = await new Promise<boolean>((resolve) => {
                provider.releaseInstall = () => resolve(true)
                run?.signal?.addEventListener('abort', () => resolve(false))
                if (!provider.holdBeforeUpload) resolve(true)
              })
              if (!installed) return cancelled()
              if (run?.beforeUpload && !(await run.beforeUpload())) return cancelled()
              run?.onProgress?.({ stage: 'UPLOADING', message: 'Uploading', progress: 70 })
              if (provider.holdDuringUpload) {
                await new Promise<void>((resolve) => {
                  provider.releaseUpload = resolve
                })
              }
              provider.uploaded = true
              return { success: true, deploymentId: 'awaitstep-wf-1' }
            }
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

const url = (path: string, workflowId = 'wf-1') =>
  `/api/workflows/${workflowId}${path}?projectId=${TEST_PROJECT_ID}`
const post = (app: ReturnType<typeof createTestApp>, path: string, body?: unknown) =>
  app.request(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
const cancel = (app: ReturnType<typeof createTestApp>, deploymentId: string) =>
  post(app, `/deployments/${deploymentId}/cancel`)

interface SseEvent {
  event: string
  data: Record<string, unknown>
}

/** Reads a deploy stream event by event. */
function sseReader(res: Response) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const queued: SseEvent[] = []
  async function next(): Promise<SseEvent | null> {
    while (queued.length === 0) {
      const at = buffer.indexOf('\n\n')
      if (at >= 0) {
        const block = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
        const data = /^data: (.*)$/m.exec(block)?.[1]
        if (data) queued.push({ event, data: JSON.parse(data) as Record<string, unknown> })
        continue
      }
      const { value, done } = await reader.read()
      if (done) return null
      buffer += decoder.decode(value, { stream: true })
    }
    return queued.shift()!
  }
  async function rest(): Promise<SseEvent[]> {
    const all: SseEvent[] = []
    for (let e = await next(); e; e = await next()) all.push(e)
    return all
  }
  return { next, rest }
}

async function deployment(id: string) {
  const { data } = await mockDb.listDeploymentsByWorkflow('wf-1')
  return data.find((d) => d.id === id)
}

describe('cancelling a deploy', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    Object.assign(provider, {
      holdBeforeUpload: false,
      holdDuringUpload: false,
      throws: false,
      uploaded: false,
      releaseInstall: null,
      releaseUpload: null,
    })
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

  it('names the deployment first on the stream, with its row already running', async () => {
    provider.holdBeforeUpload = true
    const stream = sseReader(await post(app, '/deploy-stream', { connectionId: 'conn-1' }))
    const started = await stream.next()
    expect(started?.event).toBe('started')
    const id = started!.data['deploymentId'] as string
    expect((await deployment(id))?.status).toBe('deploying')
    provider.releaseInstall?.()
    const events = await stream.rest()
    expect(events.at(-1)).toMatchObject({ event: 'result', data: { success: true } })
    expect((await deployment(id))?.status).toBe('success')
  })

  it('stops a deploy before its upload, and records it as cancelled by who asked', async () => {
    provider.holdBeforeUpload = true
    const stream = sseReader(await post(app, '/deploy-stream', { connectionId: 'conn-1' }))
    const id = (await stream.next())!.data['deploymentId'] as string

    const asked = await cancel(app, id)
    expect(asked.status).toBe(202)
    expect(await asked.json()).toEqual({ status: 'cancelling' })

    // The running deploy reads its row and stops; nothing waits on a release.
    const events = await stream.rest()
    expect(events.map((e) => e.data['stage']).filter(Boolean)).toContain('CANCELLED')
    expect(events.at(-1)).toEqual({
      event: 'result',
      data: { success: false, deploymentId: '', cancelled: true },
    })
    expect(provider.uploaded).toBe(false)
    expect(await deployment(id)).toMatchObject({ status: 'cancelled', cancelledBy: TEST_USER_ID })
    expect(recordedAuditEvents().map((e) => [e.event, e.target])).toEqual([
      ['workflow.deploy_cancel', 'Lead enrichment v1'],
    ])
    expect(await mockDb.listDeploymentConfigsByWorkflow('wf-1')).toEqual([])
  })

  it('wins the race with the upload: a cancel asked first means no upload', async () => {
    provider.holdBeforeUpload = true
    const stream = sseReader(await post(app, '/deploy-stream', { connectionId: 'conn-1' }))
    const id = (await stream.next())!.data['deploymentId'] as string
    expect((await cancel(app, id)).status).toBe(202)
    // The deploy reaches its upload before its next read of the row.
    provider.releaseInstall?.()
    const events = await stream.rest()
    expect(events.at(-1)?.data).toMatchObject({ cancelled: true })
    expect(provider.uploaded).toBe(false)
    expect((await deployment(id))?.status).toBe('cancelled')
  })

  it('refuses once the upload started, and the deploy finishes', async () => {
    provider.holdDuringUpload = true
    const stream = sseReader(await post(app, '/deploy-stream', { connectionId: 'conn-1' }))
    const id = (await stream.next())!.data['deploymentId'] as string
    await vi.waitFor(() => expect(provider.releaseUpload).not.toBeNull())

    const refused = await cancel(app, id)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({ error: CANCEL_TOO_LATE })

    provider.releaseUpload?.()
    const events = await stream.rest()
    expect(events.at(-1)?.data).toMatchObject({ success: true })
    expect((await deployment(id))?.status).toBe('success')
  })

  it('refuses a deploy that already finished', async () => {
    const events = await sseReader(
      await post(app, '/deploy-stream', { connectionId: 'conn-1' }),
    ).rest()
    const id = events[0]!.data['deploymentId'] as string
    const refused = await cancel(app, id)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({ error: CANCEL_FINISHED })
  })

  it('finds no deployment of another workflow, nor one that does not exist', async () => {
    await mockDb.createWorkflow({
      id: 'wf-2',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Other',
    })
    await mockDb.startDeployment(
      {
        id: 'd-other',
        workflowId: 'wf-2',
        versionId: 'v-x',
        versionNumber: 1,
        connectionId: 'conn-1',
      },
      '2000-01-01T00:00:00.000Z',
    )
    expect((await cancel(app, 'd-other')).status).toBe(404)
    expect((await cancel(app, 'd-none')).status).toBe(404)
    expect(await mockDb.readDeploymentStatus('d-other')).toBe('deploying')
  })

  it('answers the JSON deploy with 409 and its id when it was cancelled', async () => {
    provider.holdBeforeUpload = true
    const answer = post(app, '/deploy', { connectionId: 'conn-1' })
    await vi.waitFor(() => expect(provider.releaseInstall).not.toBeNull())
    const { data } = await mockDb.listDeploymentsByWorkflow('wf-1')
    expect((await cancel(app, data[0]!.id)).status).toBe(202)
    provider.releaseInstall?.()
    const res = await answer
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      success: false,
      deploymentId: '',
      cancelled: true,
      id: data[0]!.id,
      error: DEPLOY_CANCELLED,
    })
  })

  it('deploys when the page is gone before it hears the deployment’s id', async () => {
    const res = await post(app, '/deploy-stream', { connectionId: 'conn-1' })
    // The browser leaves before reading anything.
    await res.body!.cancel()
    await vi.waitFor(async () => {
      const { data } = await mockDb.listDeploymentsByWorkflow('wf-1')
      expect(data.map((d) => d.status)).toEqual(['success'])
    })
    expect(provider.uploaded).toBe(true)
  })

  it('settles the row as failed when the provider crashes', async () => {
    provider.throws = true
    const events = await sseReader(
      await post(app, '/deploy-stream', { connectionId: 'conn-1' }),
    ).rest()
    const id = events[0]!.data['deploymentId'] as string
    expect(await deployment(id)).toMatchObject({ status: 'failed' })
    expect((await deployment(id))?.error).toContain('The deploy failed unexpectedly.')
  })

  it('finds nothing to cancel in a deploy left running by a stopped server', async () => {
    await mockDb.startDeployment(
      {
        id: 'd-left',
        workflowId: 'wf-1',
        versionId: 'v-1',
        versionNumber: 1,
        connectionId: 'conn-1',
      },
      '2000-01-01T00:00:00.000Z',
    )
    vi.setSystemTime(new Date(Date.now() + 20 * 60_000))
    try {
      const refused = await cancel(app, 'd-left')
      expect(refused.status).toBe(409)
      expect(await refused.json()).toEqual({ error: CANCEL_INTERRUPTED })
    } finally {
      vi.useRealTimers()
    }
    expect(await mockDb.readDeploymentStatus('d-left')).toBe('deploying')
    expect(recordedAuditEvents()).toEqual([])
  })

  it('lists when a deploy started, apart from when it settled', async () => {
    const events = await sseReader(
      await post(app, '/deploy-stream', { connectionId: 'conn-1' }),
    ).rest()
    const id = events[0]!.data['deploymentId'] as string
    const listed = await app.request(url('/deployments'))
    const { data } = (await listed.json()) as {
      data: Array<{ id: string; startedAt: string | null; cancelledByName: string | null }>
    }
    const row = data.find((d) => d.id === id)
    expect(row?.startedAt).toBeTruthy()
    expect(row).toHaveProperty('cancelledByName', null)
  })

  it('settles deploys left running by a stopped server when the next one starts', async () => {
    await mockDb.startDeployment(
      {
        id: 'd-stale',
        workflowId: 'wf-1',
        versionId: 'v-1',
        versionNumber: 1,
        connectionId: 'conn-1',
      },
      '2000-01-01T00:00:00.000Z',
    )
    const stale = await deployment('d-stale')
    // Started 20 minutes ago.
    vi.setSystemTime(new Date(new Date(stale!.startedAt!).getTime() + 20 * 60_000))
    try {
      await sseReader(await post(app, '/deploy-stream', { connectionId: 'conn-1' })).rest()
    } finally {
      vi.useRealTimers()
    }
    expect(await deployment('d-stale')).toMatchObject({
      status: 'failed',
      error: 'Interrupted — the server stopped during this deploy.',
    })
  })
})

describe('cancelling with an API key', () => {
  const KEY = 'ask_cancel-key'

  beforeEach(async () => {
    resetStore()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    await mockDb.startDeployment(
      { id: 'd-run', workflowId: 'wf-1', versionId: 'v-1', versionNumber: 1, connectionId: 'c' },
      '2000-01-01T00:00:00.000Z',
    )
  })

  async function seedKey(permissions: Record<string, string[]>) {
    await mockDb.createApiKey({
      id: 'key-1',
      level: 'project',
      organizationId: TEST_ORG_ID,
      projectIds: [TEST_PROJECT_ID],
      createdBy: TEST_USER_ID,
      name: 'key',
      keyHash: await hashApiKey(KEY),
      keyPrefix: KEY.slice(0, 8),
      scopes: '[]',
      permissions: JSON.stringify(permissions),
      expiresAt: null,
    })
  }

  const asKey = (app: ReturnType<typeof createTestApp>) =>
    app.request(`/api/workflows/wf-1/deployments/d-run/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
    })

  it('needs the deploy permission', async () => {
    await seedKey({ workflows: ['read'] })
    const app = createTestApp()
    expect((await asKey(app)).status).toBe(403)
    expect(await mockDb.readDeploymentStatus('d-run')).toBe('deploying')
  })

  it('cancels with it, and the audit names the key, not who started the deploy', async () => {
    await seedKey({ workflows: ['read', 'deploy'] })
    const app = createTestApp()
    expect((await asKey(app)).status).toBe(202)
    expect(await mockDb.readDeploymentStatus('d-run')).toBe('cancelling')
    expect(recordedAuditEvents().map((e) => [e.event, e.actorType, e.actorName])).toEqual([
      ['workflow.deploy_cancel', 'key', 'key'],
    ])
    // Asking again records nothing more.
    expect((await asKey(app)).status).toBe(202)
    expect(recordedAuditEvents()).toHaveLength(1)
  })
})
