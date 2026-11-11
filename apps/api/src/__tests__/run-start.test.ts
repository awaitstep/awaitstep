import { beforeEach, describe, expect, it } from 'vitest'
import type { Workflow } from '@awaitstep/db'
import { callBody, callFunctionRun, startWorkflowRun, type RunStartDeps } from '../lib/run-start.js'
import { mockDb, resetStore, TEST_ORG_ID, TEST_PROJECT_ID, TEST_USER_ID } from './helpers.js'

// The shared start/call module: what it refuses before anything leaves the
// machine. Starting and calling for real are covered through the routes
// (trigger-version, function-call, external-run).

const deps: RunStartDeps = { db: mockDb, organizationId: TEST_ORG_ID, trigger: 'api' }

async function workflow(kind?: 'script'): Promise<Workflow> {
  const created = await mockDb.createWorkflow({
    id: kind ? 'fn-1' : 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Item',
    ...(kind && { kind }),
  })
  if (!created) throw new Error('workflow not created')
  return created
}

describe('startWorkflowRun', () => {
  beforeEach(() => resetStore())

  it('refuses a function: it is called, not started', async () => {
    const fn = await workflow('script')
    const started = await startWorkflowRun(
      deps,
      { workflow: fn, connectionId: null },
      async () => ({
        params: {},
      }),
    )
    expect(started).toMatchObject({ ok: false, status: 400 })
  })

  it('says the run to repeat isn’t there before the account', async () => {
    const wf = await workflow()
    const started = await startWorkflowRun(
      deps,
      { workflow: wf, connectionId: 'conn-x' },
      async () => null,
    )
    expect(started).toEqual({ ok: false, status: 404, error: 'Run not found' })
  })

  it('names the missing account by whether one was asked for', async () => {
    const wf = await workflow()
    const read = async () => ({ params: undefined })
    expect(await startWorkflowRun(deps, { workflow: wf, connectionId: 'conn-x' }, read)).toEqual({
      ok: false,
      status: 404,
      error: 'This workflow isn’t deployed with that connection',
    })
    expect(await startWorkflowRun(deps, { workflow: wf, connectionId: null }, read)).toEqual({
      ok: false,
      status: 404,
      error: 'This workflow isn’t live on any account',
    })
    expect((await mockDb.listRunsByWorkflow('wf-1')).data).toEqual([])
  })
})

describe('callFunctionRun', () => {
  beforeEach(() => resetStore())

  it('refuses a function live nowhere, recording nothing', async () => {
    const fn = await workflow('script')
    const called = await callFunctionRun(deps, { workflow: fn, connectionId: null }, async () => ({
      body: '',
    }))
    expect(called).toEqual({
      ok: false,
      status: 404,
      error: 'This function isn’t live on any account',
    })
    expect((await mockDb.listRunsByWorkflow('fn-1')).data).toEqual([])
  })
})

describe('callBody', () => {
  it('sends kept JSON as kept, and a kept string as itself', () => {
    expect(callBody('{"a":1}')).toBe('{"a":1}')
    expect(callBody('"plain text"')).toBe('plain text')
    expect(callBody(null)).toBe('')
  })
})
