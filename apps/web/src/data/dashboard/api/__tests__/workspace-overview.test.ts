import { describe, expect, it } from 'vitest'
import type { ApiWorkspaceOverview } from '../../../../lib/dashboard-api'
import { tookLabel } from '../../../../components/runs/run-format'
import { toWorkspaceOverview } from '../workspace-overview'

const overview: ApiWorkspaceOverview = {
  counts: {
    workflows: 1,
    deployed: 1,
    functions: 0,
    sharedOut: 0,
    runs24h: 0,
    failing: 0,
    lastRunAt: '2026-11-17T23:14:28.000Z',
  },
  needsAttention: [],
  recent: [
    {
      id: 'r1',
      workflowId: 'wf1',
      workflowName: 'Sample',
      kind: 'workflow',
      status: 'complete',
      createdAt: '2026-11-17T23:13:47.000Z',
      updatedAt: '2026-11-17T23:14:28.000Z',
    },
  ],
  shared: { out: [], in: [] },
}

describe('toWorkspaceOverview', () => {
  it('times a recent run from its start to its end, not 0ms', () => {
    const [run] = toWorkspaceOverview(overview).recent
    expect(run!.durationMs).toBe(41_000)
    expect(tookLabel(run!.durationMs)).toBe('41.0s')
  })
})
