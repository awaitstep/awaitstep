import {
  eq,
  desc,
  and,
  or,
  lt,
  lte,
  inArray,
  aliasedTable,
  getTableColumns,
  sql,
} from 'drizzle-orm'
import type { Deployment, DeploymentListItem } from '../types.js'
import type { DeploymentLibraryVersion } from '../library-types.js'
import {
  IN_FLIGHT_DEPLOYMENT_STATUSES,
  INTERRUPTED_DEPLOY_ERROR,
  INTERRUPTED_UPLOAD_ERROR,
  STALE_DEPLOY_MS,
  type CancelDeploymentAnswer,
  type CancelDeploymentOutcome,
  type SettleDeploymentData,
  type StartDeploymentData,
} from '../deployment-status.js'
import { atomically } from './atomic.js'
import { chunked, rowsPerInsert } from './statement-params.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class DeploymentsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private user: AnyTable,
    private versions: AnyTable,
    private connections: AnyTable,
    private workflows: AnyTable,
    private projects: AnyTable,
    private libraryVersions: AnyTable,
  ) {}

  async create(data: {
    id: string
    workflowId: string
    versionId: string
    /** The version's number, kept on the row once the version is deleted. */
    versionNumber: number
    connectionId: string
    serviceName: string
    serviceUrl?: string
    /** The provider's name for what was deployed, which its runs are found under. */
    deployedName?: string
    status: string
    error?: string
    configSnapshot?: string
    /** The user who deployed it. */
    createdBy?: string
    /** The library versions it bundled, written with it. */
    libraryVersions?: DeploymentLibraryVersion[]
  }): Promise<Deployment> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      versionNumber: data.versionNumber,
      connectionId: data.connectionId,
      serviceName: data.serviceName,
      serviceUrl: data.serviceUrl ?? null,
      deployedName: data.deployedName ?? null,
      status: data.status,
      error: data.error ?? null,
      configSnapshot: data.configSnapshot ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: now,
      takenDownAt: null,
      takenDownBy: null,
      startedAt: null,
      cancelledBy: null,
      cancelledAt: null,
    }
    const library = (data.libraryVersions ?? []).map((entry) => ({
      deploymentId: data.id,
      itemId: entry.itemId,
      slug: entry.slug,
      version: entry.version,
    }))
    // Chunked: D1 binds at most 100 parameters per statement, and a bundle
    // reaches up to 100 items of 4 columns each.
    await atomically(this.db, (tx) => [
      tx.insert(this.table).values(row),
      ...chunked(library, rowsPerInsert(this.libraryVersions)).map((some) =>
        tx.insert(this.libraryVersions).values(some),
      ),
    ])
    return row
  }

  async listByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<DeploymentListItem>> {
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
    // Who deployed it, which version (its number and lock) and its account's name — only
    // an account of the workflow's organization — in the same statement. A deleted
    // version's number comes from the row itself.
    const wf = aliasedTable(this.workflows, 'dlw')
    const p = aliasedTable(this.projects, 'dlp')
    const c = aliasedTable(this.connections, 'dlc')
    const canceller = aliasedTable(this.user, 'dlcu')
    const rows: DeploymentListItem[] = await this.db
      .select({
        ...getTableColumns(this.table),
        ...staleView(this.table),
        createdByName: this.user.name,
        cancelledByName: canceller.name,
        version: sql<
          number | null
        >`coalesce(${this.versions.version}, ${this.table.versionNumber})`,
        versionLocked: this.versions.locked,
        // Named here so a taken-down row on an account the project dropped still says which.
        connectionName: c.name,
      })
      .from(this.table)
      .leftJoin(this.user, eq(this.user.id, this.table.createdBy))
      .leftJoin(canceller, eq(canceller.id, this.table.cancelledBy))
      .leftJoin(this.versions, eq(this.versions.id, this.table.versionId))
      .innerJoin(wf, eq(wf.id, this.table.workflowId))
      .innerJoin(p, eq(p.id, wf.projectId))
      .leftJoin(c, and(eq(c.id, this.table.connectionId), eq(c.organizationId, p.organizationId)))
      .where(and(...conditions))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  /**
   * Records a deploy as it starts: its row in `deploying`, with the library
   * versions it bundles. In the same unit, this workflow's deploys still
   * marked running but started before `staleBefore` — left by a server that
   * stopped mid-deploy — are settled as failed.
   */
  async start(data: StartDeploymentData, staleBefore: string): Promise<void> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      versionNumber: data.versionNumber,
      connectionId: data.connectionId,
      serviceName: '',
      serviceUrl: null,
      deployedName: null,
      status: 'deploying',
      error: null,
      configSnapshot: data.configSnapshot ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: now,
      takenDownAt: null,
      takenDownBy: null,
      startedAt: now,
      cancelledBy: null,
      cancelledAt: null,
    }
    const library = (data.libraryVersions ?? []).map((entry) => ({
      deploymentId: data.id,
      itemId: entry.itemId,
      slug: entry.slug,
      version: entry.version,
    }))
    await atomically(this.db, (tx) => [
      tx
        .update(this.table)
        .set({ status: 'failed', error: interruptedError(this.table) })
        .where(
          and(
            eq(this.table.workflowId, data.workflowId),
            inArray(this.table.status, [...IN_FLIGHT_DEPLOYMENT_STATUSES]),
            lt(this.table.startedAt, staleBefore),
          ),
        ),
      tx.insert(this.table).values(row),
      ...chunked(library, rowsPerInsert(this.libraryVersions)).map((some) =>
        tx.insert(this.libraryVersions).values(some),
      ),
    ])
  }

  /**
   * Moves a running deploy to `uploading`, the point after which it can no
   * longer be cancelled. False when a cancel got there first (the row is
   * `cancelling`): the deploy must stop without uploading.
   */
  async markUploading(id: string): Promise<boolean> {
    const rows = await this.db
      .update(this.table)
      .set({ status: 'uploading' })
      .where(and(eq(this.table.id, id), eq(this.table.status, 'deploying')))
      .returning({ id: this.table.id })
    return rows.length === 1
  }

  /**
   * Settles a deploy with how it ended. `created_at` becomes the moment it
   * settled, which is what "live" and every history ordering read.
   */
  async settle(id: string, outcome: SettleDeploymentData): Promise<void> {
    await this.db
      .update(this.table)
      .set({
        status: outcome.status,
        serviceName: outcome.serviceName ?? '',
        serviceUrl: outcome.serviceUrl ?? null,
        deployedName: outcome.deployedName ?? null,
        error: outcome.error ?? null,
        createdAt: new Date().toISOString(),
      })
      .where(eq(this.table.id, id))
  }

  /**
   * Asks a running deploy of this workflow to stop. Only a `deploying` row
   * started within the stale window changes (to `cancelling`, with who asked
   * and when); the statement returns the row either way, so one round trip
   * says what it found — and, by reading back its own `cancelled_at`, whether
   * this ask was the one that stopped it. A row left running past that window
   * was interrupted: nothing is there to stop.
   */
  async requestCancel(
    workflowId: string,
    id: string,
    userId: string | null,
  ): Promise<CancelDeploymentAnswer> {
    const t = this.table
    const cutoff = staleBefore()
    const now = new Date().toISOString()
    const cancellable = sql`${t.status} = 'deploying' and ${t.startedAt} >= ${cutoff}`
    const rows: Array<{
      status: string
      startedAt: string | null
      versionNumber: number | null
      cancelledAt: string | null
    }> = await this.db
      .update(t)
      .set({
        status: sql`case when ${cancellable} then 'cancelling' else ${t.status} end`,
        cancelledBy: sql`case when ${cancellable} then ${userId} else ${t.cancelledBy} end`,
        cancelledAt: sql`case when ${cancellable} then ${now} else ${t.cancelledAt} end`,
      })
      .where(and(eq(t.id, id), eq(t.workflowId, workflowId)))
      .returning({
        status: t.status,
        startedAt: t.startedAt,
        versionNumber: t.versionNumber,
        cancelledAt: t.cancelledAt,
      })
    const row = rows[0]
    if (!row) return { outcome: 'not_found', versionNumber: null, asked: false }
    const asked = row.cancelledAt !== null && Date.parse(row.cancelledAt) === Date.parse(now)
    const answer = (outcome: CancelDeploymentOutcome): CancelDeploymentAnswer => ({
      outcome,
      versionNumber: row.versionNumber,
      asked,
    })
    const running = (IN_FLIGHT_DEPLOYMENT_STATUSES as readonly string[]).includes(row.status)
    if (running && isStale(row.startedAt, cutoff)) return answer('interrupted')
    if (row.status === 'cancelling') return answer('cancelling')
    if (row.status === 'uploading') return answer('uploading')
    return answer('finished')
  }

  /** A deployment's status, or null when the row is gone. */
  async readStatus(id: string): Promise<string | null> {
    const rows: Array<{ status: string }> = await this.db
      .select({ status: this.table.status })
      .from(this.table)
      .where(eq(this.table.id, id))
      .limit(1)
    return rows[0]?.status ?? null
  }

  /**
   * Marks the workflow's successful deployments on one account, made before
   * `before`, as taken down — by whom and when. The rows stay as its history.
   */
  async takeDownOnConnection(
    workflowId: string,
    connectionId: string,
    before: string,
    takenDownBy: string | null,
  ): Promise<void> {
    await this.db
      .update(this.table)
      .set({ status: 'taken_down', takenDownAt: new Date().toISOString(), takenDownBy })
      .where(
        and(
          eq(this.table.workflowId, workflowId),
          eq(this.table.connectionId, connectionId),
          eq(this.table.status, 'success'),
          lte(this.table.createdAt, before),
        ),
      )
  }
}

/** Running rows started before this were left by a server that stopped. */
function staleBefore(): string {
  return new Date(Date.now() - STALE_DEPLOY_MS).toISOString()
}

function staleWhere(t: AnyTable, cutoff: string) {
  return sql`${t.status} in (${sql.join(
    IN_FLIGHT_DEPLOYMENT_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  )}) and (${t.startedAt} is null or ${t.startedAt} < ${cutoff})`
}

function isStale(startedAt: string | null, cutoff: string): boolean {
  return startedAt === null || new Date(startedAt).getTime() < new Date(cutoff).getTime()
}

function interruptedError(t: AnyTable) {
  return sql`case when ${t.status} = 'uploading' then ${INTERRUPTED_UPLOAD_ERROR} else ${INTERRUPTED_DEPLOY_ERROR} end`
}

/**
 * A deployment's status and error as lists show them. A deploy still marked
 * running long past any deploy's length was left by a server that stopped:
 * it reads as the interrupted failure it is, and one stopped mid-upload says
 * it may have reached the account.
 */
export function staleView(t: AnyTable) {
  const stale = staleWhere(t, staleBefore())
  return {
    status: sql<string>`case when ${stale} then 'failed' else ${t.status} end`,
    error: sql<string | null>`case when ${stale} then ${interruptedError(t)} else ${t.error} end`,
  }
}
