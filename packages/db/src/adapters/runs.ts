import { eq, desc, and, or, lt, notInArray } from 'drizzle-orm'
import type { ActiveRunForSync, WorkflowRun } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { latestDeploymentServiceName, latestDeploymentSnapshot } from './deployment-snapshot.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

const TERMINAL_RUN_STATUSES = ['complete', 'errored', 'terminated']

export class RunsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private workflowsTable?: AnyTable,
    private deploymentsTable?: AnyTable,
    private placeTables?: { projects: AnyTable; workspaces: AnyTable; organization: AnyTable },
  ) {}

  /** The sync rows' select list and joins: the run, its workflow's name and place, its snapshot. */
  private syncQuery() {
    const runs = this.table
    const workflows = this.workflowsTable
    const deployments = this.deploymentsTable
    const place = this.placeTables
    if (!workflows || !deployments || !place) {
      throw new Error('RunsAdapter needs workflows, deployments and place tables for sync queries')
    }
    const { projects: p, workspaces: w, organization: o } = place
    return this.db
      .select({
        run: runs,
        workflowName: workflows.name,
        deployedName: latestDeploymentServiceName(deployments, runs),
        configSnapshot: latestDeploymentSnapshot(deployments, runs),
        place: {
          organizationId: p.organizationId,
          orgSlug: o.slug,
          projectId: p.id,
          projectSlug: p.slug,
          projectName: p.name,
          workspaceId: w.id,
          workspaceSlug: w.slug,
          workspaceName: w.name,
        },
      })
      .from(runs)
      .innerJoin(workflows, eq(runs.workflowId, workflows.id))
      .leftJoin(p, eq(p.id, workflows.projectId))
      .leftJoin(o, eq(o.id, p.organizationId))
      .leftJoin(w, and(eq(w.id, workflows.workspaceId), eq(w.projectId, p.id)))
  }

  async create(data: {
    id: string
    workflowId: string
    versionId: string | null
    /** The version's number, kept on the run once the version is deleted. */
    versionNumber: number | null
    connectionId: string
    instanceId: string
    status: string
  }): Promise<WorkflowRun> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      versionNumber: data.versionNumber,
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
    const rows = await this.syncQuery()
      .where(notInArray(this.table.status, TERMINAL_RUN_STATUSES))
      .orderBy(desc(this.table.createdAt))
      .limit(limit)
    return rows as ActiveRunForSync[]
  }

  /**
   * One run with the same JOINed context listActiveForSync provides, for
   * on-demand reconciliation (the live stream). Ownership is enforced in the
   * query: a run from another workflow reads as null.
   */
  async getForSync(runId: string, workflowId: string): Promise<ActiveRunForSync | null> {
    const rows = await this.syncQuery()
      .where(and(eq(this.table.id, runId), eq(this.table.workflowId, workflowId)))
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

  /**
   * Writes `data` only while the run is still in `fromStatus` — one guarded
   * statement — and says whether it did: of two syncs seeing the same
   * change, one moves the run and the other learns it was beaten.
   */
  async updateFromStatus(
    id: string,
    fromStatus: string,
    data: { status: string; output?: string; error?: string; updatedAt?: string },
  ): Promise<boolean> {
    const updates = { ...data, updatedAt: data.updatedAt ?? new Date().toISOString() }
    const rows = await this.db
      .update(this.table)
      .set(updates)
      .where(and(eq(this.table.id, id), eq(this.table.status, fromStatus)))
      .returning({ id: this.table.id })
    return rows.length > 0
  }
}
