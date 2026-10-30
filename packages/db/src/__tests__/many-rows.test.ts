import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { afterEach } from 'vitest'
import {
  type Harness,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// Multi-row writes split under D1's 100 parameters still land as one unit,
// returning every row — on SQLite, Postgres and a real D1, the one that
// refuses a statement with more.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('many-row writes on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  const files = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      workflowId: 'wf-enrich',
      path: `lib/${prefix}-${i}.ts`,
      source: 'export {}',
      hash: `h${i}`,
      size: 9,
    }))

  it('upserts and replaces 40 workflow files, returning every row', async () => {
    expect(await h.adapter.upsertWorkflowFiles(files(40, 'a'))).toHaveLength(40)
    const replaced = await h.adapter.replaceWorkflowFiles('wf-enrich', files(30, 'b'))
    expect(replaced.map((f) => f.path).sort()).toEqual(
      files(30, 'b')
        .map((f) => f.path)
        .sort(),
    )
    expect(await h.count('workflow_files', "workflow_id = 'wf-enrich'")).toBe(30)
  })

  it('keeps the old files when a replace fails partway', async () => {
    await h.adapter.upsertWorkflowFiles(files(5, 'a'))
    const broken = [...files(20, 'b'), { ...files(1, 'c')[0]!, workflowId: 'wf-gone' }]
    await expect(h.adapter.replaceWorkflowFiles('wf-enrich', broken)).rejects.toThrow()
    expect(await h.count('workflow_files', "workflow_id = 'wf-enrich'")).toBe(5)
  })

  it('upserts 40 run steps', async () => {
    await h.adapter.upsertRunSteps(
      'r-1',
      Array.from({ length: 40 }, (_, i) => ({
        id: `s-${i}`,
        stepName: `step ${i}`,
        kind: 'do' as const,
        stepIndex: 1,
        status: 'complete' as const,
        attemptCount: 1,
      })),
    )
    expect(await h.count('workflow_run_steps', "run_id = 'r-1'")).toBe(40)
  })

  it('moves 100 workflows between workspaces in one statement', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `wf-many-${i}`)
    await h.db.insert(h.schema.workflows).values(
      ids.slice(0, 5).map((id) => ({
        id,
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        createdBy: 'u-ama',
        name: id,
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      })),
    )
    const moved = await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', ids)
    expect(moved.map((w) => w.id).sort()).toEqual(ids.slice(0, 5).sort())
    expect(await h.count('workflows', "workspace_id = 'ws-ops'")).toBe(5)
  })
})
