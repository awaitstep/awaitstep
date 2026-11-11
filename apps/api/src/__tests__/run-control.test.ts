import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
  storedRun,
} from './helpers.js'

// Pause, resume and terminate reach a run under the name the provider knows
// its workflow by — never the worker's, nor the workflow's name since a rename.

const controlled = vi.hoisted(() => ({
  calls: [] as Array<[string, string]>,
  gone: false,
}))

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'controlRun') {
            return async (action: string, input: { workflowName: string }) => {
              controlled.calls.push([action, input.workflowName])
              if (controlled.gone) {
                const { RunGoneError } = await import('@awaitstep/codegen')
                throw new RunGoneError('workflow')
              }
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

const post = (app: ReturnType<typeof createTestApp>, action: string) =>
  app.request(`/api/workflows/wf-1/runs/run-1/${action}?projectId=${TEST_PROJECT_ID}`, {
    method: 'POST',
  })

describe('run control', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    controlled.calls = []
    controlled.gone = false
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    await mockDb.createConnection({
      id: 'conn-1',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Production',
      credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
    })
    await mockDb.createDeployment({
      id: 'dep-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      serviceName: 'awaitstep-wf-1',
      deployedName: 'Lead enrichment',
      status: 'success',
    })
  })

  it('pauses, resumes and terminates under the name the run was started under', async () => {
    await mockDb.createRun({
      id: 'run-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-1',
      deployedName: 'Lead enrichment',
      status: 'running',
    })
    await mockDb.updateWorkflow('wf-1', { name: 'Renamed since' })
    for (const action of ['pause', 'resume', 'terminate']) {
      expect((await post(app, action)).status).toBe(200)
    }
    expect(controlled.calls).toEqual([
      ['pause', 'Lead enrichment'],
      ['resume', 'Lead enrichment'],
      ['terminate', 'Lead enrichment'],
    ])
  })

  it('falls back to its deploy’s name for a run from before names were kept, not the worker’s', async () => {
    await mockDb.createRun({
      id: 'run-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-1',
      status: 'running',
    })
    expect((await post(app, 'pause')).status).toBe(200)
    expect(controlled.calls).toEqual([['pause', 'Lead enrichment']])
  })

  it('says a gone run can’t be paused, and records a terminate of one as asked', async () => {
    await mockDb.createRun({
      id: 'run-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-1',
      status: 'running',
    })
    controlled.gone = true
    const paused = await post(app, 'pause')
    expect(paused.status).toBe(409)
    expect((await paused.json()).error).toBe('The workflow is no longer on the account.')
    expect((await storedRun('run-1'))!.status).toBe('running')
    expect((await post(app, 'terminate')).status).toBe(200)
    expect((await storedRun('run-1'))!.status).toBe('terminated')
  })

  it('refuses an account that isn’t the organization’s', async () => {
    await mockDb.createConnection({
      id: 'conn-other',
      organizationId: 'org-other',
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Elsewhere',
      credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
    })
    await mockDb.createRun({
      id: 'run-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-other',
      instanceId: 'inst-1',
      status: 'running',
    })
    const other = await post(app, 'pause')
    expect(other.status).toBe(404)
    expect((await other.json()).error).toBe('Connection not found')
    expect(controlled.calls).toEqual([])
  })

  it('shows a run in the documented columns, and no other workflow’s run', async () => {
    await mockDb.createRun({
      id: 'run-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-1',
      deployedName: 'Internal',
      status: 'running',
    })
    const res = await app.request(`/api/workflows/wf-1/runs/run-1?projectId=${TEST_PROJECT_ID}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).not.toHaveProperty('deployedName')
    expect(body).toMatchObject({ id: 'run-1', instanceId: 'inst-1', status: 'running' })
    await mockDb.createWorkflow({
      id: 'wf-2',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Another',
    })
    expect(
      (await app.request(`/api/workflows/wf-2/runs/run-1?projectId=${TEST_PROJECT_ID}`)).status,
    ).toBe(404)
  })

  it('answers a missing run, and a run with no account, without calling the provider', async () => {
    expect((await post(app, 'pause')).status).toBe(404)
    await mockDb.createRun({
      id: 'run-1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-1',
      status: 'running',
    })
    Object.assign(storedRun('run-1')!, { connectionId: null })
    const none = await post(app, 'pause')
    expect(none.status).toBe(400)
    expect((await none.json()).error).toBe('No connection')
    expect(controlled.calls).toEqual([])
  })
})
