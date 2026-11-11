import { eq, desc, and, or, lt, notInArray, sql } from 'drizzle-orm'
import type {
  ActiveRunForSync,
  Connection,
  CreateRunData,
  RunDetail,
  RunTrigger,
  WorkflowRun,
} from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { latestDeployedName, latestDeploymentSnapshot } from './deployment-snapshot.js'

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

  /**
   * The sync rows' select list and joins: the run, its workflow's name and
   * place, its snapshot — and, when asked, its account, joined only when that
   * account is the given organization's.
   */
  private syncQuery(account?: { connections: AnyTable; organizationId?: string }) {
    const runs = this.table
    const workflows = this.workflowsTable
    const deployments = this.deploymentsTable
    const place = this.placeTables
    if (!workflows || !deployments || !place) {
      throw new Error('RunsAdapter needs workflows, deployments and place tables for sync queries')
    }
    const { projects: p, workspaces: w, organization: o } = place
    const query = this.db
      .select({
        run: runs,
        workflowName: workflows.name,
        // The run's own record of the name it started under; for older runs, its deploy's.
        deployedName: sql<
          string | null
        >`coalesce(${runs.deployedName}, ${latestDeployedName(deployments, runs)})`,
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
        ...(account && { connection: account.connections }),
      })
      .from(runs)
      .innerJoin(workflows, eq(runs.workflowId, workflows.id))
      .leftJoin(p, eq(p.id, workflows.projectId))
      .leftJoin(o, eq(o.id, p.organizationId))
      .leftJoin(w, and(eq(w.id, workflows.workspaceId), eq(w.projectId, p.id)))
    if (!account) return query
    const c = account.connections
    // The caller's organization when one asks; else the workflow's own (the background loop).
    const owner = account.organizationId ?? p.organizationId
    return query.leftJoin(c, and(eq(c.id, runs.connectionId), eq(c.organizationId, owner)))
  }

  async create(data: CreateRunData): Promise<WorkflowRun> {
    const now = new Date().toISOString()
    const row: WorkflowRun = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      versionNumber: data.versionNumber,
      connectionId: data.connectionId,
      instanceId: data.instanceId,
      deployedName: data.deployedName ?? null,
      trigger: data.trigger ?? null,
      params: data.params ?? null,
      contentType: data.contentType ?? null,
      responseStatus: data.responseStatus ?? null,
      durationMs: data.durationMs ?? null,
      status: data.status,
      output: data.output ?? null,
      error: data.error ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? data.createdAt ?? now,
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
  /**
   * The active runs (not ended), newest first, each with its account
   * (only one of its workflow's own organization), in the same statement —
   * credentials as stored.
   */
  async listActiveForSyncWithAccounts(
    connections: AnyTable,
    limit = 200,
  ): Promise<Array<{ entry: ActiveRunForSync; connection: Connection | null }>> {
    const rows = (await this.syncQuery({ connections })
      .where(notInArray(this.table.status, TERMINAL_RUN_STATUSES))
      .orderBy(desc(this.table.createdAt))
      .limit(limit)) as Array<ActiveRunForSync & { connection: Connection | null }>
    return rows.map(({ connection, ...entry }) => ({
      entry,
      connection: connection?.id ? connection : null,
    }))
  }

  /**
   * One run's sync row with its account, read together — the account only
   * when it is the organization's (null otherwise), credentials as stored.
   */
  async getForSyncWithAccount(
    runId: string,
    workflowId: string,
    organizationId: string,
    connections: AnyTable,
  ): Promise<{ entry: ActiveRunForSync; connection: Connection | null } | null> {
    const rows = await this.syncQuery({ connections, organizationId })
      .where(and(eq(this.table.id, runId), eq(this.table.workflowId, workflowId)))
      .limit(1)
    const row = rows[0] as (ActiveRunForSync & { connection: Connection | null }) | undefined
    if (!row) return null
    const { connection, ...entry } = row
    return { entry, connection: connection?.id ? connection : null }
  }

  /** One run of that workflow, in the columns its page shows; the workflow is checked in the WHERE. */
  async getDetail(runId: string, workflowId: string): Promise<RunDetail | null> {
    const r = this.table
    const rows = await this.db
      .select({
        id: r.id,
        workflowId: r.workflowId,
        versionId: r.versionId,
        versionNumber: r.versionNumber,
        connectionId: r.connectionId,
        instanceId: r.instanceId,
        status: r.status,
        output: r.output,
        error: r.error,
        trigger: r.trigger,
        hasParams: sql<number>`case when ${r.params} is null then 0 else 1 end`,
        responseStatus: r.responseStatus,
        durationMs: r.durationMs,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
      .from(r)
      .where(and(eq(r.id, runId), eq(r.workflowId, workflowId)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      ...row,
      trigger: row.trigger as RunTrigger | null,
      hasParams: Number(row.hasParams) === 1,
    }
  }

  /**
   * The payload a run was started with — only when the run is that workflow's
   * and, given an account, was started on it. Null when no such run.
   */
  async getParams(
    runId: string,
    workflowId: string,
    connectionId?: string,
  ): Promise<{ params: string | null; contentType: string | null } | null> {
    const r = this.table
    const rows = await this.db
      .select({ params: r.params, contentType: r.contentType })
      .from(r)
      .where(
        and(
          eq(r.id, runId),
          eq(r.workflowId, workflowId),
          connectionId === undefined ? undefined : eq(r.connectionId, connectionId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
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
