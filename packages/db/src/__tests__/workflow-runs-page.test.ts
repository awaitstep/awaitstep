import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Harness,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// A workflow page's runs: the day's run times (the median and slowest 5% of
// the runs that finished well, by nearest rank), and its Runs tab's Failed list.

const NOW = new Date('2026-10-28T12:00:00.000Z')

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('workflow page runs on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  function run(id: string, status: string, durationMs: number | null, createdAt: string) {
    return {
      id,
      workflowId: 'wf-enrich',
      versionId: null,
      connectionId: null,
      instanceId: id,
      status,
      durationMs,
      createdAt,
      updatedAt: createdAt,
    }
  }

  it('takes the times of the day’s completed runs only', async () => {
    const day = '2026-10-28T10:00:00.000Z'
    const rows = [
      // 10 ms to 190 ms: the 10th of 19 is the median, the 19th the slowest 5%.
      ...Array.from({ length: 19 }, (_, i) => run(`t-${i}`, 'complete', (i + 1) * 10, day)),
      run('t-failed', 'errored', 5000, day),
      run('t-old', 'complete', 9999, '2026-10-26T10:00:00.000Z'),
    ]
    // One by one: D1 takes at most 100 bound values a statement.
    for (const row of rows) await h.db.insert(h.schema.workflowRuns).values(row)
    const summary = await h.adapter.workflowPageSummary('wf-enrich', NOW)
    expect(summary?.runs.took).toEqual({ p50Ms: 100, p95Ms: 190 })
  })

  it('gives no time when no run of the day finished well', async () => {
    await h.db
      .insert(h.schema.workflowRuns)
      .values([run('t-failed', 'errored', 5000, '2026-10-28T10:00:00.000Z')])
    const summary = await h.adapter.workflowPageSummary('wf-enrich', NOW)
    expect(summary?.runs.took).toEqual({ p50Ms: null, p95Ms: null })
  })

  it('lists only the failed runs, newest first, when asked', async () => {
    const failed = await h.adapter.listRunsByWorkflow('wf-enrich', undefined, { failed: true })
    // The seed's wf-enrich runs: r-1 and r-3 complete, r-2 errored.
    expect(failed.data.map((r) => r.id)).toEqual(['r-2'])
    const all = await h.adapter.listRunsByWorkflow('wf-enrich')
    expect(all.data.map((r) => r.id)).toEqual(['r-3', 'r-2', 'r-1'])
  })
})
