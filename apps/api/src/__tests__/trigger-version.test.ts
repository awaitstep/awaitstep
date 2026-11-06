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

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'trigger') return () => Promise.resolve({ instanceId: 'inst-1' })
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

const trigger = (app: ReturnType<typeof createTestApp>, connectionId: string) =>
  app.request(`/api/workflows/wf-1/trigger?projectId=${TEST_PROJECT_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, params: {} }),
  })

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
