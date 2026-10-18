import { eq, desc, and, or, lt, notInArray } from 'drizzle-orm'
import type { ActiveRunForSync, WorkflowRun } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { latestDeploymentSnapshot } from './deployment-snapshot.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

const TERMINAL_RUN_STATUSES = ['complete', 'errored', 'terminated']

export class RunsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private workflowsTable?: AnyTable,
    private deploymentsTable?: AnyTable,
  ) {}

  async create(data: {
    id: string
    workflowId: string
    versionId: string
    connectionId: string
    instanceId: string
    status: string
  }): Promise<WorkflowRun> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      connectionId: data.connectionId,
      instanceId: data.instanceId,
      status: data.status,
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<WorkflowRun | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowRun>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.workflowId, workflowId)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(
          lt(this.table.createdAt, timestamp),
          and(eq(this.table.createdAt, timestamp), lt(this.table.id, cursorId)),
        )!,
      )
    }
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(...conditions))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  /**
   * Non-terminal runs joined with the provider workflow name and the
   * deployed version's config snapshot (latest successful deployment of the
   * run's own version — the one whose step manifest matches the running
   * code), all in one query per the no-sequential-awaits rule.
   */
  async listActiveForSync(limit = 200): Promise<ActiveRunForSync[]> {
    const runs = this.table
    const workflows = this.workflowsTable
    const deployments = this.deploymentsTable
    if (!workflows || !deployments) {
      throw new Error('RunsAdapter needs workflows and deployments tables for sync queries')
    }
    const snapshotExpr = latestDeploymentSnapshot(deployments, runs)
    const rows = await this.db
      .select({ run: runs, workflowName: workflows.name, configSnapshot: snapshotExpr })
      .from(runs)
      .innerJoin(workflows, eq(runs.workflowId, workflows.id))
      .where(notInArray(runs.status, TERMINAL_RUN_STATUSES))
      .orderBy(desc(runs.createdAt))
      .limit(limit)
    return rows as ActiveRunForSync[]
  }

  /**
   * One run with the same JOINed context listActiveForSync provides, for
   * on-demand reconciliation (the live stream). Ownership is enforced in the
   * query: a run from another workflow reads as null.
   */
  async getForSync(runId: string, workflowId: string): Promise<ActiveRunForSync | null> {
    const runs = this.table
    const workflows = this.workflowsTable
    const deployments = this.deploymentsTable
    if (!workflows || !deployments) {
      throw new Error('RunsAdapter needs workflows and deployments tables for sync queries')
    }
    const rows = await this.db
      .select({
        run: runs,
        workflowName: workflows.name,
        configSnapshot: latestDeploymentSnapshot(deployments, runs),
      })
      .from(runs)
      .innerJoin(workflows, eq(runs.workflowId, workflows.id))
      .where(and(eq(runs.id, runId), eq(runs.workflowId, workflowId)))
      .limit(1)
    return (rows[0] as ActiveRunForSync | undefined) ?? null
  }

  async update(
    id: string,
    data: { status?: string; output?: string; error?: string; updatedAt?: string },
  ): Promise<WorkflowRun> {
    const updates = { ...data, updatedAt: data.updatedAt ?? new Date().toISOString() }
    await this.db.update(this.table).set(updates).where(eq(this.table.id, id))
    const updated = await this.getById(id)
    if (!updated) throw new Error(`WorkflowRun ${id} not found`)
    return updated
  }
}
