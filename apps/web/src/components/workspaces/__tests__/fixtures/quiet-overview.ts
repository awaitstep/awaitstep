import type { WorkspaceRun } from '../../../../types/dashboard/runs'
import type { Workspace, WorkspaceOverviewData } from '../../../../types/dashboard/workspaces'

/** Deployed and run before, but nothing in the last 24 hours. */
export const quietCounts = {
  workflows: 1,
  deployed: 1,
  functions: 0,
  sharedOut: 0,
  runs24h: 0,
  failing: 0,
  lastRunAt: '2026-11-17T23:13:47.800Z',
}

export const quietWorkspace: Workspace = {
  id: 'ws1',
  projectId: 'p1',
  slug: 'support',
  name: 'Support',
  initial: 'S',
  description: null,
  colour: 'green',
  people: [],
  createdAt: '2026-11-01T09:00:00.000Z',
  createdBy: null,
  lock: { own: null, inherited: null },
  counts: quietCounts,
  viewerCanEdit: true,
}

export const olderRun: WorkspaceRun = {
  id: 'run1',
  workflowId: 'wf1',
  createdAt: '2026-11-17T23:13:47.800Z',
  workflowName: 'Ticket triage',
  kind: 'workflow',
  result: 'succeeded',
  trigger: 'http',
  durationMs: 41000,
  waitingOn: null,
  httpStatus: null,
  failure: null,
}

export function quietOverview(recent: WorkspaceRun[], deployed = 1): WorkspaceOverviewData {
  return {
    counts: { ...quietCounts, deployed },
    needsAttention: [],
    recent,
    shared: { out: [], in: [] },
  }
}
