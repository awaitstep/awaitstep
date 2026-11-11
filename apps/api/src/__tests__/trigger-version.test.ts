import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

// A run records the version deployed on the account it went to. The provider is
// real except for the call that would reach Cloudflare.

const triggeredUnder = vi.hoisted(() => ({ names: [] as string[], params: [] as unknown[] }))

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'trigger') {
            return (
              _id: string,
              params: unknown,
              config: { options?: Record<string, unknown> },
            ) => {
              triggeredUnder.names.push(String(config.options?.['workflowName']))
              triggeredUnder.params.push(params)
              return Promise.resolve({ instanceId: 'inst-1' })
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

const post = (app: ReturnType<typeof createTestApp>, path: string, body: unknown) =>
  app.request(`/api/workflows/wf-1${path}?projectId=${TEST_PROJECT_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const trigger = (
  app: ReturnType<typeof createTestApp>,
  connectionId: string,
  params: unknown = {},
) => post(app, '/trigger', { connectionId, params })

async function account(id: string, name: string) {
  await mockDb.createConnection({
    id,
    organizationId: TEST_ORG_ID,
    createdBy: TEST_USER_ID,
    provider: 'cloudflare',
    name,
    credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
  })
}

async function deployed(id: string, versionId: string, connectionId: string) {
  await mockDb.createDeployment({
    id,
    workflowId: 'wf-1',
    versionId,
    versionNumber: Number(versionId.slice(2)),
    connectionId,
    serviceName: 'svc',
    status: 'success',
  })
}

describe('POST /workflows/:id/trigger records the deployed version', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    triggeredUnder.names = []
    triggeredUnder.params = []
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', ir: '{}' })
    await mockDb.createVersion({ id: 'v-2', workflowId: 'wf-1', ir: '{}' })
    // v-2 is the latest save.
    await mockDb.updateWorkflow('wf-1', { currentVersionId: 'v-2' })
    await account('conn-a', 'Production')
    await account('conn-b', 'Staging')
  })

  it('starts the run under the name the deploy gave it, after a rename', async () => {
    await mockDb.createDeployment({
      id: 'dep-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-a',
      serviceName: 'awaitstep-wf-1',
      deployedName: 'Lead-enrichment',
      status: 'success',
    })
    await mockDb.updateWorkflow('wf-1', { name: 'Leads, renamed' })
    expect((await trigger(app, 'conn-a')).status).toBe(201)
    expect(triggeredUnder.names).toEqual(['Lead-enrichment'])
  })

  it('records the version deployed there, not a later save', async () => {
    await deployed('dep-1', 'v-1', 'conn-a')
    const res = await trigger(app, 'conn-a')
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ versionId: 'v-1', versionNumber: 1 })
  })

  it('records each account’s own version', async () => {
    await deployed('dep-1', 'v-1', 'conn-a')
    await deployed('dep-2', 'v-2', 'conn-b')
    expect((await (await trigger(app, 'conn-a')).json()).versionId).toBe('v-1')
    expect((await (await trigger(app, 'conn-b')).json()).versionId).toBe('v-2')
  })

  it('records the newest deploy on an account deployed twice', async () => {
    await deployed('dep-1', 'v-2', 'conn-a')
    await deployed('dep-2', 'v-1', 'conn-a')
    expect((await (await trigger(app, 'conn-a')).json()).versionId).toBe('v-1')
  })

  it('records the number of a deployed version deleted since', async () => {
    await deployed('dep-1', 'v-1', 'conn-a')
    await mockDb.deleteVersion('v-1')
    const res = await trigger(app, 'conn-a')
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ versionId: null, versionNumber: 1 })
  })

  it('refuses an account the workflow isn’t deployed on, and records no run', async () => {
    await deployed('dep-1', 'v-1', 'conn-a')
    const res = await trigger(app, 'conn-b')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('This workflow isn’t deployed with that connection')
    expect((await mockDb.listRunsByWorkflow('wf-1')).data).toEqual([])
  })
})

describe('a run keeps how it was started and its payload', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    triggeredUnder.names = []
    triggeredUnder.params = []
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', ir: '{}' })
    await account('conn-a', 'Production')
    await account('conn-b', 'Staging')
    await deployed('dep-1', 'v-1', 'conn-a')
    await deployed('dep-2', 'v-1', 'conn-b')
  })

  const read = (path: string) =>
    app.request(`/api/workflows/wf-1${path}?projectId=${TEST_PROJECT_ID}`)

  it('records a dashboard start and serves the payload on its own', async () => {
    const run = (await (await trigger(app, 'conn-a', { email: 'a@b.c' })).json()) as {
      id: string
      trigger: string
      hasParams: boolean
    }
    expect(run).toMatchObject({ trigger: 'dashboard', hasParams: true })
    // The run itself carries only the flag, not the payload.
    expect(await (await read(`/runs/${run.id}`)).json()).not.toHaveProperty('params')
    expect(await (await read(`/runs/${run.id}/params`)).json()).toEqual({
      params: { email: 'a@b.c' },
    })
  })

  it('reads no payload for a run started without one', async () => {
    const run = (await (await post(app, '/trigger', { connectionId: 'conn-a' })).json()) as {
      id: string
      hasParams: boolean
    }
    expect(run.hasParams).toBe(false)
    expect(await (await read(`/runs/${run.id}/params`)).json()).toEqual({ params: null })
  })

  it('runs again with the same payload on the same account', async () => {
    const first = (await (await trigger(app, 'conn-a', { n: 1 })).json()) as { id: string }
    const res = await post(app, `/runs/${first.id}/run-again`, { connectionId: 'conn-a' })
    expect(res.status).toBe(201)
    const again = (await res.json()) as { id: string; connectionId: string }
    expect(again.id).not.toBe(first.id)
    expect(again.connectionId).toBe('conn-a')
    expect(triggeredUnder.params).toEqual([{ n: 1 }, { n: 1 }])
  })

  it('refuses to run again on an account the run wasn’t started on', async () => {
    const first = (await (await trigger(app, 'conn-a', { n: 1 })).json()) as { id: string }
    const res = await post(app, `/runs/${first.id}/run-again`, { connectionId: 'conn-b' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Run not found')
    expect(triggeredUnder.params).toHaveLength(1)
  })

  it('404s the payload of a run outside the workflow', async () => {
    expect((await read('/runs/nope/params')).status).toBe(404)
  })
})
