import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  aliasedTable,
  getTableName,
} from 'drizzle-orm'
import type { SharedWorkflowFilter, SharedWorkflowRow, SharingRow } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import type { Dialect } from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'
import { writeChanging } from './projects.js'

/**
 * Sharing a workflow or function to its project (B6): the switch, and the
 * lists every workspace and the project's Shared library read. Sharing
 * publishes what an item is and where it lives, never its code.
 */
export class SharedWorkflowsAdapter {
  private fields: OverviewFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: OverviewTables,
    dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  /**
   * Turns the share on or off while the workflow is still in `workspaceId`,
   * the workspace whose `share` right the caller was judged on. Sharing again
   * keeps the first sharer and time, as a lock does. Null when the workflow
   * is gone or has moved meanwhile.
   */
  async setShared(
    id: string,
    workspaceId: string,
    userId: string,
    shared: boolean,
  ): Promise<SharingRow | null> {
    const wf = this.t.workflows
    const values = shared
      ? {
          sharedBy: sql`case when ${wf.sharedAt} is null then ${userId} else coalesce(${wf.sharedBy}, ${userId}) end`,
          sharedAt: sql`coalesce(${wf.sharedAt}, ${new Date().toISOString()})`,
        }
      : { sharedBy: null, sharedAt: null }
    return writeChanging<Omit<SharingRow, 'changed'>>((match) =>
      this.db
        .update(wf)
        .set(values)
        .where(
          and(
            eq(wf.id, id),
            eq(wf.workspaceId, workspaceId),
            shared === (match === 'already') ? isNotNull(wf.sharedAt) : isNull(wf.sharedAt),
          ),
        )
        .returning(this.sharingReturning()),
    )
  }

  /**
   * The share as the write left it, with the sharer's name read in the same
   * statement while they are in the workflow's organization. Columns are
   * spelled out with their table: RETURNING renders them bare, and a bare one
   * inside the subqueries would bind to the innermost table that has it.
   */
  private sharingReturning() {
    const wf = this.t.workflows
    const users = this.t.user
    const projects = this.t.projects
    const col = (t: string, c: string) => sql`${sql.identifier(t)}.${sql.identifier(c)}`
    const own = (c: string) => col(getTableName(wf), c)
    const sharerId = col('sharer', users.id.name)
    const organizationId = sql`(select ${col('sp', projects.organizationId.name)} from ${sql.identifier(getTableName(projects))} ${sql.identifier('sp')} where ${col('sp', projects.id.name)} = ${own(wf.projectId.name)})`
    return {
      sharedBy: wf.sharedBy,
      sharedAt: wf.sharedAt,
      sharedByName: sql<
        string | null
      >`(select ${col('sharer', users.name.name)} from ${sql.identifier(getTableName(users))} ${sql.identifier('sharer')} where ${sharerId} = ${own(wf.sharedBy.name)} and ${this.fields.inOrganization(sharerId, organizationId)})`,
    }
  }

  /**
   * The project's shared items, newest share first, with the workspace each
   * comes from and the viewer's role there — one statement. Items in
   * workspaces hidden from the viewer are listed too: sharing publishes them
   * to the project.
   */
  async list(
    filter: SharedWorkflowFilter,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<SharedWorkflowRow>> {
    const limit = clampLimit(pagination?.limit)
    const wf = aliasedTable(this.t.workflows, 'sw')
    const w = aliasedTable(this.t.workspaces, 'sws')
    const sharer = aliasedTable(this.t.user, 'sharer')
    const conditions = [eq(wf.projectId, filter.projectId), isNotNull(wf.sharedAt)]
    if (filter.exceptWorkspaceId) conditions.push(ne(wf.workspaceId, filter.exceptWorkspaceId))
    if (filter.kind) conditions.push(eq(wf.kind, filter.kind))
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(wf.sharedAt, timestamp), and(eq(wf.sharedAt, timestamp), lt(wf.id, cursorId)))!,
      )
    }
    const rows = await this.db
      .select({
        id: wf.id,
        name: wf.name,
        kind: wf.kind,
        deployedVersion: this.fields.latestDeployedVersion(wf),
        sharedAt: wf.sharedAt,
        sharedBy: wf.sharedBy,
        sharedByName: sharer.name,
        from: { id: w.id, slug: w.slug, name: w.name, colour: w.colour },
        viewerRole: this.fields.roles.workspaceRoleOf(filter.viewer, {
          organizationId: filter.organizationId,
          projectId: filter.projectId,
          workspaceId: w.id,
        }),
      })
      .from(wf)
      .innerJoin(w, eq(w.id, wf.workspaceId))
      .leftJoin(
        sharer,
        and(
          eq(sharer.id, wf.sharedBy),
          this.fields.inOrganization(sharer.id, filter.organizationId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(wf.sharedAt), desc(wf.id))
      .limit(limit + 1)
    return paginateResults(rows as SharedWorkflowRow[], limit, (row) => row.sharedAt)
  }
}
