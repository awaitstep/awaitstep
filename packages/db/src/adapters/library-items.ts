import { aliasedTable, and, eq, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../db-errors.js'
import type {
  CreateLibraryItemData,
  LibraryItem,
  LibraryItemAccess,
  LibraryItemUpdateOutcome,
  LibraryMarketplaceRow,
  LibraryOwner,
  LibrarySummary,
  LibrarySummaryRow,
  LibrarySummaryScope,
  UpdateLibraryItemData,
} from '../library-types.js'
import { atomicallyReturning } from './atomic.js'
import { insertWhereQuery } from './insert-where.js'
import { aliasedFrom, fieldOf, jsonArrayOf, readJsonArray, type Dialect } from './json-array.js'
import type { LibraryFields, LibraryTables } from './library-fields.js'
import type { LibraryFilesAdapter } from './library-files.js'
import type { LibraryUsagesAdapter } from './library-usages.js'
import type { OverviewTables } from './overview-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

function readOwner(value: unknown): LibraryOwner {
  return (typeof value === 'string' ? JSON.parse(value) : value) as LibraryOwner
}

/** Library items: who may open one, creating, changing and deleting them, and the page summary. */
export class LibraryItemsAdapter {
  constructor(
    private db: AnyDb,
    private t: LibraryTables & OverviewTables,
    private fields: LibraryFields,
    private files: LibraryFilesAdapter,
    private usages: LibraryUsagesAdapter,
    private dialect: Dialect,
  ) {}

  /**
   * The item with the caller's rows at its owner, if they may open it: from
   * its workspace, or anywhere in the project for the project's own. One statement;
   * a hidden item and a missing one are both null.
   */
  async getForUser(userId: string, itemId: string): Promise<LibraryItemAccess | null> {
    const i = aliasedTable(this.t.libraryItems, 'li')
    const p = aliasedTable(this.t.projects, 'lp')
    const me = aliasedTable(this.t.member, 'lme')
    const pm = aliasedTable(this.t.projectMembers, 'lpm')
    const wm = aliasedTable(this.t.workspaceMembers, 'lwm')
    const rows = await this.db
      .select({
        ...this.fields.itemColumns(i),
        organizationId: p.organizationId,
        owner: this.fields.ownerJson(i),
        latestVersion: this.fields.latestVersion(i),
        latestSeq: this.fields.latestSeq(i),
        orgRole: me.role,
        projectGrant: pm.role,
        workspaceGrant: wm.role,
      })
      .from(i)
      .innerJoin(p, eq(p.id, i.projectId))
      .innerJoin(me, and(eq(me.organizationId, p.organizationId), eq(me.userId, userId)))
      .leftJoin(pm, and(eq(pm.projectId, p.id), eq(pm.userId, userId)))
      .leftJoin(wm, and(eq(wm.workspaceId, i.workspaceId), eq(wm.userId, userId)))
      .where(and(eq(i.id, itemId), this.fields.readable(userId, i)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    const {
      organizationId,
      owner,
      latestVersion,
      latestSeq,
      orgRole,
      projectGrant,
      workspaceGrant,
      ...item
    } = row
    return {
      item: item as LibraryItem,
      organizationId,
      owner: readOwner(owner),
      latestVersion: latestVersion ?? null,
      latestSeq: Number(latestSeq ?? 0),
      orgRole,
      projectGrant,
      workspaceGrant,
    }
  }

  /**
   * The item and its scaffold files, as one unit, while its owner holds
   * fewer than `maxPerOwner` items (the count is in the INSERT's own WHERE;
   * the files are written only if the item was). Null when the owner is
   * full; a taken slug throws a unique violation.
   */
  async create(data: CreateLibraryItemData, maxPerOwner: number): Promise<LibraryItem | null> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      projectId: data.projectId,
      workspaceId: data.workspaceId,
      kind: data.kind,
      slug: data.slug,
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    }
    const items = this.t.libraryItems
    const p = this.t.projects
    const held = aliasedTable(items, 'lch')
    const room = sql`${p.id} = ${data.projectId} and (select count(*) from ${aliasedFrom(held)} where ${held.projectId} = ${data.projectId} and coalesce(${held.workspaceId}, '') = ${data.workspaceId ?? ''}) < ${maxPerOwner}`
    const [written] = await atomicallyReturning<{ id: string }>(this.db, (tx) => [
      insertWhereQuery(tx, items, row, p, room),
      ...this.files.insertWhereItemStatements(tx, data.files, items),
      // Only when the item landed: a full owner writes nothing at all.
      ...(data.usageSlugs && data.usageSlugs.length > 0
        ? this.usages.rewriteStatements(
            tx,
            { itemId: data.id, projectId: data.projectId, workspaceId: data.workspaceId },
            data.usageSlugs,
            { from: items, condition: eq(items.id, data.id) },
          )
        : []),
    ])
    return written && written.length > 0 ? row : null
  }

  /**
   * Applies the changes in one conditional UPDATE. A module's slug change
   * needs it unused (a node is placed by id, so its slug is free to move).
   * When the update matches nothing, the reason is read afterwards.
   */
  async update(
    userId: string,
    itemId: string,
    changes: UpdateLibraryItemData,
    retried = false,
  ): Promise<LibraryItemUpdateOutcome> {
    const i = this.t.libraryItems
    const conditions: SQL[] = [eq(i.id, itemId) as SQL]
    if (changes.slug !== undefined) {
      conditions.push(
        sql`(${i.kind} <> 'module' or ${i.slug} = ${changes.slug} or not ${this.usages.used(i)})`,
      )
    }
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    for (const key of ['name', 'description', 'slug'] as const) {
      if (changes[key] !== undefined) set[key] = changes[key]
    }
    let rows: LibraryItem[]
    try {
      rows = await this.db
        .update(i)
        .set(set)
        .where(and(...conditions))
        .returning(this.fields.itemColumns(i))
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'slug-taken' }
      throw error
    }
    if (rows[0]) return { ok: true, item: rows[0] }
    const consumers = await this.usages.consumers(userId, itemId)
    if (consumers.visible.length > 0 || consumers.hiddenCount > 0) {
      return { ok: false, reason: 'in-use', consumers }
    }
    // Nothing refuses it: the consumers went away in between (try once more), or the item did.
    return retried ? { ok: false, reason: 'missing' } : this.update(userId, itemId, changes, true)
  }

  /** Deletes the item unless something uses it; false when it is used (or gone). */
  async deleteIfUnused(itemId: string): Promise<boolean> {
    const i = this.t.libraryItems
    const rows = await this.db
      .delete(i)
      .where(and(eq(i.id, itemId), sql`not ${this.usages.used(i)}`))
      .returning({ id: i.id })
    return rows.length > 0
  }

  private rowJson(i: AnyDb): SQL {
    return jsonArrayOf(
      this.dialect,
      {
        id: i.id,
        kind: i.kind,
        slug: i.slug,
        name: i.name,
        description: i.description,
        owner: this.fields.ownerJson(i),
        latestVersion: this.fields.latestVersion(i),
        publishedAt: this.fields.latestPublishedAt(i),
        usedBy: this.fields.usedByCount(i),
        updatedAt: this.fields.updatedAt(i),
      },
      sql`${i.name}`,
    )
  }

  /**
   * The Library page in one statement: the place's own items, the
   * project's own (a workspace may use them; no workspace sees another's)
   * and, for the project, the organization's marketplace nodes, with the
   * place's own items counted per kind.
   */
  async summary(scope: LibrarySummaryScope): Promise<LibrarySummary> {
    const own = aliasedTable(this.t.libraryItems, 'lso')
    const fromProject = aliasedTable(this.t.libraryItems, 'lsp')
    const ownerIs = (i: AnyDb) =>
      scope.level === 'workspace'
        ? sql`${i.projectId} = ${scope.projectId} and ${i.workspaceId} = ${scope.workspaceId}`
        : sql`${i.projectId} = ${scope.projectId} and ${i.workspaceId} is null`
    const inProject = (i: AnyDb) =>
      scope.level === 'workspace'
        ? sql`${i.projectId} = ${scope.projectId} and ${i.workspaceId} is null`
        : sql`1 = 0`
    const count = (kind: 'module' | 'node') => {
      const a = aliasedTable(this.t.libraryItems, `lsc${kind[0]}`)
      // The page's kind pills count the place's own items (28a).
      return sql<number>`(select count(*) from ${aliasedFrom(a)} where ${ownerIs(a)} and ${a.kind} = ${kind})`
    }
    const n = this.t.installedNodes
    const nodeName =
      this.dialect === 'pg'
        ? sql`coalesce((${n.bundle})::json->'definition'->>'name', ${n.nodeId})`
        : sql`coalesce(json_extract(${n.bundle}, '$.definition.name'), ${n.nodeId})`
    const marketplace =
      scope.level === 'project'
        ? sql`(select ${jsonArrayOf(this.dialect, { nodeId: n.nodeId, name: nodeName, version: n.version }, sql`${n.nodeId}`)} from ${n} where ${n.organizationId} = ${scope.organizationId})`
        : sql`null`
    const marketplaceCount =
      scope.level === 'project'
        ? sql<number>`(select count(*) from ${n} where ${n.organizationId} = ${scope.organizationId})`
        : sql<number>`0`
    const p = this.t.projects
    const rows = await this.db
      .select({
        // fieldOf: a statement with no joins would strip the subqueries' qualifiers.
        own: fieldOf(
          sql`(select ${this.rowJson(own)} from ${aliasedFrom(own)} where ${ownerIs(own)})`,
        ),
        fromProject: fieldOf(
          sql`(select ${this.rowJson(fromProject)} from ${aliasedFrom(fromProject)} where ${inProject(fromProject)})`,
        ),
        marketplace: fieldOf(marketplace),
        modules: fieldOf(count('module')).mapWith(Number),
        nodes: fieldOf(count('node')).mapWith(Number),
        marketplaceCount: fieldOf(marketplaceCount).mapWith(Number),
      })
      .from(p)
      .where(eq(p.id, scope.projectId))
      .limit(1)
    const row = rows[0]
    return {
      own: readJsonArray<LibrarySummaryRow>(row?.own),
      fromProject: readJsonArray<LibrarySummaryRow>(row?.fromProject),
      marketplace: readJsonArray<LibraryMarketplaceRow>(row?.marketplace),
      counts: {
        module: row?.modules ?? 0,
        node: row?.nodes ?? 0,
        marketplace: row?.marketplaceCount ?? 0,
      },
    }
  }
}
