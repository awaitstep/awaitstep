import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Workflow } from '@awaitstep/db'
import { mockDb, resetStore, TEST_PROJECT_ID, TEST_USER_ID } from './helpers.js'
import { projectWriteRuleErrors } from '../lib/project-write-rules.js'

const ir = (runtime?: Record<string, unknown>) =>
  JSON.stringify({
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
    ...(runtime && { runtime }),
  })

const handler = 'export default async () => {}'

describe('projectWriteRuleErrors', () => {
  let workflow: Workflow

  beforeEach(async () => {
    resetStore()
    workflow = await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function withLegacyVersion(): Promise<Workflow> {
    const version = await mockDb.createVersion({
      id: 'v-1',
      workflowId: workflow.id,
      ir: ir({ triggerCode: '@fetch function legacy() {}' }),
    })
    return mockDb.updateWorkflow(workflow.id, { currentVersionId: version.id })
  }

  it('lets an ordinary write through', async () => {
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow,
      existing: [{ path: 'lib/retry.ts' }],
      changes: [{ path: 'config/env.ts', source: 'export const x = 1' }],
    })
    expect(errors).toEqual([])
  })

  it('refuses a handler path, worded as the write endpoint words it', async () => {
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow,
      existing: [{ path: 'handlers/fetch.ts' }],
      changes: [{ path: 'handlers/fetch.mjs', source: handler }],
    })
    expect(errors).toEqual([
      {
        path: 'handlers/fetch.mjs',
        message:
          'Invalid handler path "handlers/fetch.mjs": would be a second fetch handler beside "handlers/fetch.ts" — one file per entry',
      },
    ])
  })

  it('refuses a first handler module while the trigger-code setting still holds code', async () => {
    const withSetting = await mockDb.updateWorkflow(workflow.id, { triggerCode: 'return 1' })
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow: withSetting,
      existing: [],
      changes: [{ path: 'handlers/queue/orders.ts', source: handler }],
    })
    expect(errors).toEqual([
      {
        path: 'handlers/queue/orders.ts',
        message:
          'The workflow still has legacy trigger code — convert it to handler modules first (POST /workflows/wf-1/project/convert-handlers)',
      },
    ])
  })

  it('finds legacy trigger code inline in the current version, not only in the setting', async () => {
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow: await withLegacyVersion(),
      existing: [],
      changes: [{ path: 'handlers/fetch.ts', source: handler }],
    })
    expect(errors[0]?.message).toMatch(/convert it to handler modules first/)
  })

  it('stops guarding once the project already uses handler modules', async () => {
    // The guard exists so a first module cannot silently retire the legacy
    // code. A project that has modules has already made that choice.
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow: await withLegacyVersion(),
      existing: [{ path: 'handlers/fetch.ts' }],
      changes: [{ path: 'handlers/queue/orders.ts', source: handler }],
    })
    expect(errors).toEqual([])
  })

  it('does not look for legacy code when a path rule has already refused the write', async () => {
    const lookup = vi.spyOn(mockDb, 'getWorkflowVersionById')
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow: await withLegacyVersion(),
      existing: [],
      changes: [
        { path: 'handlers/fetch.ts', source: handler },
        { path: 'handlers/fetch.mjs', source: handler },
      ],
    })
    expect(errors.map((e) => e.path)).toEqual(['handlers/fetch.ts', 'handlers/fetch.mjs'])
    expect(lookup).not.toHaveBeenCalled()
  })

  it('treats a removal as a removal, not a write', async () => {
    // handlers.ts out and a module in, in one change set: the merged project
    // never holds both models, so nothing is refused — and no handler entry
    // is judged against a file that is leaving.
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow,
      existing: [{ path: 'handlers.ts' }],
      changes: [
        { path: 'handlers.ts', source: null },
        { path: 'handlers/fetch.ts', source: handler },
      ],
    })
    expect(errors).toEqual([])
  })

  it('refuses a module added beside a handlers.ts that stays', async () => {
    const errors = await projectWriteRuleErrors({
      db: mockDb,
      workflow,
      existing: [{ path: 'handlers.ts' }],
      changes: [{ path: 'handlers/fetch.ts', source: handler }],
    })
    expect(errors[0]?.message).toMatch(/cannot coexist/)
  })
})
