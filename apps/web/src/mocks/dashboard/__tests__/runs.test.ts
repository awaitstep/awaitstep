import { beforeEach, describe, expect, it } from 'vitest'
import { resetMockDb } from '../db'
import { AMA, LENA } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { runs } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => resetMockDb(new Date()))

describe('workspace runs', () => {
  it('starts with the board’s eight rows of 128 in the last 24 hours', async () => {
    const page = await runs.listRuns(ama, sales, { limit: 8 })
    expect(page.data.map((r) => [r.id, r.workflowName, r.result])).toEqual([
      ['run_8f2c', 'Lead enrichment', 'failed'],
      ['run_8f2a', 'Quote follow-up', 'running'],
      ['run_8f27', 'Quote follow-up', 'succeeded'],
      ['req_31c9', 'CRM sync', 'succeeded'],
      ['run_8f11', 'Lead enrichment', 'failed'],
      ['run_8f03', 'Inbound webhook triage', 'succeeded'],
      ['run_8ef9', 'Lead enrichment', 'succeeded'],
      ['req_30a2', 'Pricing webhook', 'succeeded'],
    ])
    expect(page.counts).toEqual({ all: 128, failed: 4, running: 1, succeeded: 123 })
    expect(page.data[0]).toMatchObject({
      trigger: 'webhook',
      durationMs: 4200,
      failure: { step: 'Fetch company' },
    })
    expect(page.data[1]).toMatchObject({ waitingOn: 'Wait 3 days', durationMs: null })
    expect(page.data[3]).toMatchObject({ kind: 'script', trigger: 'http', httpStatus: 200 })
  })

  it('pages with an opaque cursor until the last page', async () => {
    const first = await runs.listRuns(ama, sales, { limit: 50 })
    expect(first.nextCursor).not.toBeNull()
    const second = await runs.listRuns(ama, sales, { limit: 50, cursor: first.nextCursor! })
    const third = await runs.listRuns(ama, sales, { limit: 50, cursor: second.nextCursor! })
    expect(third.data).toHaveLength(28)
    expect(third.nextCursor).toBeNull()
    const ids = [...first.data, ...second.data, ...third.data].map((r) => r.id)
    expect(new Set(ids).size).toBe(128)
    await expect(runs.listRuns(ama, sales, { cursor: 'x' })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('filters by result, search and period, keeping the pill counts for the whole period', async () => {
    const failed = await runs.listRuns(ama, sales, { result: 'failed' })
    expect(failed.data.every((r) => r.result === 'failed')).toBe(true)
    expect(failed.data).toHaveLength(4)
    expect(failed.counts.all).toBe(128)

    const byName = await runs.listRuns(ama, sales, { search: 'crm' })
    expect(byName.data.every((r) => r.workflowName === 'CRM sync')).toBe(true)
    expect((await runs.listRuns(ama, sales, { search: 'RUN_8F2C' })).data).toHaveLength(1)

    expect((await runs.listRuns(ama, sales, { period: '7d' })).counts.all).toBeGreaterThan(128)
  })

  it('returns no runs under the empty scenario', async () => {
    const page = await runs.listRuns(as(AMA, 'empty'), sales)
    expect(page.data).toEqual([])
    expect(page.counts.all).toBe(0)
  })
})

describe('failing now', () => {
  it('lists Lead enrichment for the owner and nothing for someone who can’t open Sales', async () => {
    const failing = await runs.listFailingNow(ama, 'acme')
    expect(failing.map((f) => [f.item.name, f.project.name, f.workspace.name, f.run.id])).toEqual([
      ['Lead enrichment', 'Project 101', 'Sales', 'run_8f2c'],
    ])
    expect(await runs.listFailingNow(as(LENA), 'acme')).toEqual([])
  })
})
