import type { ApiWorkspaceOverview } from '../../../lib/dashboard-api'
import type { WorkspaceOverviewData } from '../../../types/dashboard/workspaces'
import { toWorkspaceRun } from './runs'

/** The Overview's one answer, in the shapes the page draws: runs read as `WorkspaceRun`s. */
export function toWorkspaceOverview(overview: ApiWorkspaceOverview): WorkspaceOverviewData {
  return {
    counts: overview.counts,
    needsAttention: overview.needsAttention.map((entry) => ({
      item: entry.item,
      run: entry.run
        ? toWorkspaceRun(
            {
              id: entry.run.id,
              workflowId: entry.run.workflowId,
              versionId: null,
              versionNumber: null,
              connectionId: null,
              instanceId: '',
              status: entry.run.status,
              output: null,
              error: entry.run.error,
              createdAt: entry.run.createdAt,
              // Needs attention shows when a run failed, never how long it took,
              // so the overview sends no end time for it (the Took column is Recent runs').
              updatedAt: entry.run.createdAt,
            },
            entry.item,
          )
        : null,
      failures: entry.failures,
      total: entry.total,
    })),
    recent: overview.recent.map((run) =>
      toWorkspaceRun(
        {
          id: run.id,
          workflowId: run.workflowId,
          versionId: null,
          versionNumber: null,
          connectionId: null,
          instanceId: '',
          status: run.status,
          output: null,
          error: null,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        },
        { name: run.workflowName, kind: run.kind },
      ),
    ),
    shared: {
      out: overview.shared.out,
      in: overview.shared.in.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        version: null,
        from: { ...item.from },
        usedBy: [],
        canOpen: false,
        unshare: { allowed: false },
        sharedAt: '',
        sharedBy: { id: '', name: '' },
      })),
    },
  }
}
