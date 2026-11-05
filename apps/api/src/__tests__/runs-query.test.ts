import { describe, it, expect, beforeEach } from 'vitest'
import { runsQuerySchema, workspaceRunFilter } from '../routes/runs-query.js'
import { createTestApp, resetStore, TEST_PROJECT_ID } from './helpers.js'

describe('runs query', () => {
  it('passes one workflow through to the adapter', () => {
    const query = runsQuerySchema.parse({ workflowId: 'wf-1', period: '24h' })
    const filter = workspaceRunFilter(query, new Date('2026-11-05T12:00:00.000Z'))
    expect(filter).toMatchObject({ workflowId: 'wf-1', since: '2026-11-04T12:00:00.000Z' })
  })

  it('refuses an empty or overlong workflow id', () => {
    expect(runsQuerySchema.safeParse({ workflowId: '' }).success).toBe(false)
    expect(runsQuerySchema.safeParse({ workflowId: 'x'.repeat(65) }).success).toBe(false)
  })
})

describe('GET /api/runs?workflowId=', () => {
  beforeEach(() => resetStore())

  it('needs a workspace, like the other filters', async () => {
    const app = createTestApp()
    const res = await app.request(`/api/runs?projectId=${TEST_PROJECT_ID}&workflowId=wf-1`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Filtering runs needs a workspace' })
  })
})
