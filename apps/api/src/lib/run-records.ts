import type { FailingWorkflow, WorkflowRun } from '@awaitstep/db'

// The rows a list or count needs, never the run's output, error, instance or
// account — those belong to the run's own page. `error` is carried only by
// `GET /workflows/:id/runs/:runId`, where the page renders it.

export interface RunListRecord {
  id: string
  workflowId: string
  versionId: string | null
  versionNumber: number | null
  status: string
  createdAt: string
  updatedAt: string
}

export function runListRecord(run: WorkflowRun): RunListRecord {
  return {
    id: run.id,
    workflowId: run.workflowId,
    versionId: run.versionId,
    versionNumber: run.versionNumber,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export function runPageRecord<T extends { data: WorkflowRun[]; nextCursor: string | null }>(
  page: T,
): Omit<T, 'data'> & { data: RunListRecord[] } {
  return { ...page, data: page.data.map(runListRecord) }
}

interface WorkspaceRunRow extends WorkflowRun {
  workflowName: string
  kind: 'workflow' | 'script'
}

export function workspaceRunPageRecord<
  T extends { data: WorkspaceRunRow[]; nextCursor: string | null },
>(
  page: T,
): Omit<T, 'data'> & { data: (RunListRecord & Pick<WorkspaceRunRow, 'workflowName' | 'kind'>)[] } {
  return {
    ...page,
    data: page.data.map((run) => ({
      ...runListRecord(run),
      workflowName: run.workflowName,
      kind: run.kind,
    })),
  }
}

export function failingRecord(row: FailingWorkflow) {
  return {
    workflow: row.workflow,
    project: row.project,
    workspace: row.workspace,
    run: runListRecord(row.run),
  }
}
