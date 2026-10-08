import { eq, and, asc, sql } from 'drizzle-orm'
import type { UpsertRunStepData, WorkflowRunStep } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class RunStepsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private runsTable: AnyTable,
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
      createdAt: now,
      updatedAt: now,
    }))
    await this.db
      .insert(this.table)
      .values(rows)
      .onConflictDoUpdate({
        target: [this.table.runId, this.table.stepName, this.table.kind, this.table.stepIndex],
        set: {
          nodeId: sql`excluded.node_id`,
          status: sql`excluded.status`,
          attemptCount: sql`excluded.attempt_count`,
          error: sql`excluded.error`,
          startedAt: sql`excluded.started_at`,
          endedAt: sql`excluded.ended_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  /**
   * Steps for one run, ownership-checked in the same query: the INNER JOIN
   * on workflow_runs filters by workflowId so a run from another workflow
   * reads as empty rather than needing a prior fetch-then-check round trip.
   */
  async listByRun(runId: string, workflowId: string): Promise<WorkflowRunStep[]> {
    const rows = await this.db
      .select({ step: this.table })
      .from(this.table)
      .innerJoin(this.runsTable, eq(this.table.runId, this.runsTable.id))
      .where(and(eq(this.table.runId, runId), eq(this.runsTable.workflowId, workflowId)))
      .orderBy(asc(this.table.startedAt), asc(this.table.stepIndex))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => r.step)
  }
}
