import { eq, and, asc, sql } from 'drizzle-orm'
import type { RunStepExtras, RunStepsResult, UpsertRunStepData } from '../types.js'
import { latestDeploymentSnapshot } from './deployment-snapshot.js'
import { atomically } from './atomic.js'
import { chunked, rowsPerInsert } from './statement-params.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class RunStepsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private runsTable: AnyTable,
    private deploymentsTable: AnyTable,
  ) {}

  /**
   * Converging upsert on the (runId, stepName, kind, stepIndex) identity:
   * repeated sync ticks update status/attempts/timing in place instead of
   * duplicating rows. The stored id and createdAt survive conflicts.
   */
  async upsertMany(runId: string, steps: UpsertRunStepData[]): Promise<void> {
    if (steps.length === 0) return
    const now = new Date().toISOString()
    const rows = steps.map((s) => ({
      id: s.id,
      runId,
      nodeId: s.nodeId ?? null,
      stepName: s.stepName,
      kind: s.kind,
      stepIndex: s.stepIndex,
      status: s.status,
      attemptCount: s.attemptCount,
      error: s.error ?? null,
      startedAt: s.startedAt ?? null,
      endedAt: s.endedAt ?? null,
      output: s.output ?? null,
      outputTruncated: s.outputTruncated ? 1 : 0,
      attempts: s.attempts ?? null,
      createdAt: now,
      updatedAt: now,
    }))
    // A few rows per statement (D1 binds at most 100 parameters), as one unit.
    await atomically(this.db, (tx) =>
      chunked(rows, rowsPerInsert(this.table)).map((some) =>
        tx
          .insert(this.table)
          .values(some)
          .onConflictDoUpdate({
            target: [this.table.runId, this.table.stepName, this.table.kind, this.table.stepIndex],
            set: {
              nodeId: sql`excluded.node_id`,
              status: sql`excluded.status`,
              attemptCount: sql`excluded.attempt_count`,
              error: sql`excluded.error`,
              startedAt: sql`excluded.started_at`,
              endedAt: sql`excluded.ended_at`,
              output: sql`excluded.output`,
              outputTruncated: sql`excluded.output_truncated`,
              attempts: sql`excluded.attempts`,
              updatedAt: sql`excluded.updated_at`,
            },
          }),
      ),
    )
  }

  /**
   * Steps for one run, ownership-checked in the same query: the INNER JOIN
   * on workflow_runs filters by workflowId so a run from another workflow
   * reads as empty rather than needing a prior fetch-then-check round trip.
   * The deployed version's config snapshot rides along (scalar subquery:
   * latest successful deployment of the run's version) because it carries
   * the step manifest that links coalesced members to their leader.
   */
  async listByRun(runId: string, workflowId: string): Promise<RunStepsResult> {
    const runs = this.runsTable
    const deployments = this.deploymentsTable
    const snapshotExpr = latestDeploymentSnapshot(deployments, runs)
    const t = this.table
    const rows = await this.db
      .select({
        // The list's columns: a step's output and tries are read when it is selected.
        step: {
          id: t.id,
          runId: t.runId,
          nodeId: t.nodeId,
          stepName: t.stepName,
          kind: t.kind,
          stepIndex: t.stepIndex,
          status: t.status,
          attemptCount: t.attemptCount,
          error: t.error,
          startedAt: t.startedAt,
          endedAt: t.endedAt,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        },
        configSnapshot: snapshotExpr,
      })
      .from(this.table)
      .innerJoin(runs, eq(this.table.runId, runs.id))
      .where(and(eq(this.table.runId, runId), eq(runs.workflowId, workflowId)))
      .orderBy(asc(this.table.startedAt), asc(this.table.stepIndex))
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      steps: rows.map((r: any) => r.step),
      configSnapshot: rows[0]?.configSnapshot ?? null,
    }
  }

  /** One step's output and tries — only when the step is that run's and the run that workflow's. */
  async getExtras(
    stepId: string,
    runId: string,
    workflowId: string,
  ): Promise<RunStepExtras | null> {
    const t = this.table
    const runs = this.runsTable
    const rows = await this.db
      .select({ output: t.output, outputTruncated: t.outputTruncated, attempts: t.attempts })
      .from(t)
      .innerJoin(runs, eq(t.runId, runs.id))
      .where(and(eq(t.id, stepId), eq(t.runId, runId), eq(runs.workflowId, workflowId)))
      .limit(1)
    const row = rows[0] as
      { output: string | null; outputTruncated: unknown; attempts: string | null } | undefined
    if (!row) return null
    return {
      output: row.output,
      outputTruncated: row.outputTruncated === 1 || row.outputTruncated === true,
      attempts: row.attempts,
    }
  }
}
