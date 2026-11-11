import type { RunStepAttempt } from '@awaitstep/codegen'
import type {
  FailingWorkflow,
  RunDetail,
  RunStepExtras,
  RunTrigger,
  WorkflowRun,
} from '@awaitstep/db'

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

/** A run as its own page and the trigger's answer show it: the documented run object, field by field. */
export function runDetailRecord(run: WorkflowRun): RunDetail {
  return {
    id: run.id,
    workflowId: run.workflowId,
    versionId: run.versionId,
    versionNumber: run.versionNumber,
    connectionId: run.connectionId,
    instanceId: run.instanceId,
    status: run.status,
    output: run.output,
    error: run.error,
    trigger: run.trigger as RunTrigger | null,
    hasParams: run.params !== null,
    responseStatus: run.responseStatus,
    durationMs: run.durationMs,
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

/** What a selected step adds to its row: its output and its tries. */
export interface RunStepExtrasRecord {
  output: unknown
  outputTruncated: boolean
  outputPreview: string | null
  attempts: RunStepAttempt[]
}

export function runStepExtrasRecord(extras: RunStepExtras): RunStepExtrasRecord {
  const whole = extras.output !== null && !extras.outputTruncated
  return {
    output: whole ? parseJson(extras.output as string, null) : null,
    outputTruncated: extras.outputTruncated,
    outputPreview: extras.outputTruncated ? extras.output : null,
    attempts: extras.attempts ? (parseJson(extras.attempts, []) as RunStepAttempt[]) : [],
  }
}

function parseJson(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}
