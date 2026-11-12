import { aliasedTable, eq, sql, type SQL } from 'drizzle-orm'
import type {
  LibraryConsumerPlace,
  LibraryConsumers,
  LibraryResolvedModule,
  LibraryUsages,
  LibraryUses,
} from '../library-types.js'
import { atomically } from './atomic.js'
import {
  aliasedFrom,
  fieldOf,
  idList,
  jsonArrayOf,
  nestedJson,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { LibraryFields, LibraryTables } from './library-fields.js'
import { liveOnItsAccount } from './live-deployment.js'
import type { RoleFields } from './role-fields.js'
import { insertWhereQuery } from './insert-where.js'
import { chunked, rowsPerInsert } from './statement-params.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/**
 * Who uses which library item. A consumer's rows are the slugs its code
 * imports (and, from L3, the custom nodes a workflow places), rewritten
 * whole whenever they may have changed. Which item a slug means is decided
 * when the rows are read, the way a deploy resolves it; a consumer's
 * delete cascades its rows away.
 */
export class LibraryUsagesAdapter {
  constructor(
    private db: AnyDb,
    private t: LibraryTables,
    private fields: LibraryFields,
    private roles: RoleFields,
    private dialect: Dialect,
  ) {}

  /**
   * The statements that make `slugs` the item's whole set of imports, not
   * yet run. With `onlyIf` (a row of `from` that must exist, such as the
   * version a publish inserts in the same unit) nothing changes unless it does.
   */
  rewriteStatements(
    tx: AnyDb,
    place: LibraryConsumerPlace,
    slugs: string[],
    onlyIf?: { from: AnyDb; condition: SQL },
  ): unknown[] {
    const u = this.t.libraryUsages
    const statements: unknown[] = [
      tx
        .delete(u)
        .where(
          onlyIf
            ? sql`${u.consumerItemId} = ${place.itemId} and exists (select 1 from ${onlyIf.from} where ${onlyIf.condition})`
            : eq(u.consumerItemId, place.itemId),
        )
        .returning({ id: u.id }),
    ]
    const now = new Date().toISOString()
    // One row per slug, so the id is the pair: a rewrite never races itself into duplicates.
    const rows = [...new Set(slugs)].map((slug) => ({
      id: `${place.itemId}:${slug}`,
      workflowId: null,
      consumerItemId: place.itemId,
      slug,
      nodeId: null,
      createdAt: now,
    }))
    if (onlyIf) {
      for (const row of rows) {
        statements.push(insertWhereQuery(tx, u, row, onlyIf.from, onlyIf.condition))
      }
    } else {
      for (const some of chunked(rows, rowsPerInsert(u))) {
        statements.push(tx.insert(u).values(some).returning({ id: u.id }))
      }
    }
    return statements
  }

  async rewrite(place: LibraryConsumerPlace, slugs: string[]): Promise<void> {
    await atomically(this.db, (tx) => this.rewriteStatements(tx, place, slugs))
  }

  /**
   * What `slugs` resolve to for a consumer at `place`, the way a deploy
   * resolves them, each with its latest published version (null: never
   * published). A slug nothing in reach answers is absent.
   */
  async resolve(
    place: { projectId: string; workspaceId: string | null; consumerItemId?: string },
    slugs: string[],
  ): Promise<LibraryResolvedModule[]> {
    if (slugs.length === 0) return []
    const t = aliasedTable(this.t.libraryItems, 'lrs')
    const notSelf = place.consumerItemId ? sql` and ${t.id} <> ${place.consumerItemId}` : sql``
    return this.db
      .select({
        slug: t.slug,
        itemId: t.id,
        // fieldOf: with no joins the subquery's `t.id` would reach the driver as a bare `id`.
        latestVersion: fieldOf(this.fields.latestVersion(t)),
      })
      .from(t)
      .where(
        sql`${t.slug} in ${idList(this.dialect, slugs)}${notSelf} and ${this.fields.resolves(t, {
          projectId: place.projectId,
          ownerKey: place.workspaceId ?? '',
        })}`,
      )
  }

  /** What the item imports and who uses it, as the caller may see them: one statement. */
  async usages(userId: string, itemId: string): Promise<LibraryUsages> {
    const anchor = this.t.libraryItems
    const rows = await this.db
      .select({
        // fieldOf: a statement with no joins would strip the subqueries' qualifiers.
        uses: fieldOf(this.usesJson(anchor)),
        usedBy: fieldOf(this.consumersJson(userId, anchor)),
        usedByHidden: fieldOf(this.consumersCount(userId, anchor)),
      })
      .from(anchor)
      .where(eq(anchor.id, itemId))
      .limit(1)
    const row = rows[0]
    return {
      uses: readJsonArray<LibraryUses>(row?.uses),
      usedBy: {
        visible: readJsonArray<LibraryConsumers['visible'][number]>(row?.usedBy),
        hiddenCount: Number(row?.usedByHidden ?? 0),
      },
    }
  }

  /** Who uses the item, as the caller may see them: one statement. */
  async consumers(userId: string, itemId: string): Promise<LibraryConsumers> {
    const anchor = this.t.libraryItems
    const rows = await this.db
      .select({
        usedBy: fieldOf(this.consumersJson(userId, anchor)),
        usedByHidden: fieldOf(this.consumersCount(userId, anchor)),
      })
      .from(anchor)
      .where(eq(anchor.id, itemId))
      .limit(1)
    return {
      visible: readJsonArray<LibraryConsumers['visible'][number]>(rows[0]?.usedBy),
      hiddenCount: Number(rows[0]?.usedByHidden ?? 0),
    }
  }

  // The modules consumer `c` (an outer library_items row) imports, as resolved from where it sits.
  private usesFrom(c: AnyDb, u: AnyDb, t: AnyDb): SQL {
    return sql`${aliasedFrom(u)} inner join ${aliasedFrom(t)} on ${t.slug} = ${u.slug} and ${t.id} <> ${c.id} and ${this.fields.resolves(t, { projectId: c.projectId, ownerKey: sql`coalesce(${c.workspaceId}, '')` })} where ${u.consumerItemId} = ${c.id}`
  }

  private usesJson(c: AnyDb): SQL {
    const u = aliasedTable(this.t.libraryUsages, 'luu')
    const t = aliasedTable(this.t.libraryItems, 'lui')
    const json = jsonArrayOf(
      this.dialect,
      { id: t.id, kind: t.kind, slug: t.slug, name: t.name, owner: this.fields.ownerJson(t) },
      sql`${t.name}`,
    )
    return sql`(select ${json} from ${this.usesFrom(c, u, t)})`
  }

  // A consumer is visible when the caller can open its workspace (a
  // workflow) or the item itself.
  private consumerVisible(userId: string, wf: AnyDb, ci: AnyDb): SQL {
    return sql`(case when ${wf.id} is not null then ${this.roles.workflowVisible(userId, wf.workspaceId)} else ${this.fields.readable(userId, ci)} end)`
  }

  private consumersJson(userId: string, i: AnyDb): SQL {
    const u = aliasedTable(this.t.libraryUsages, 'lcu')
    const wf = aliasedTable(this.t.workflows, 'lcw')
    const ci = aliasedTable(this.t.libraryItems, 'lci')
    const ws = aliasedTable(this.t.workspaces, 'lcs')
    const fn = this.dialect === 'pg' ? sql`json_build_object` : sql`json_object`
    const consumer = sql`(case when ${wf.id} is not null then ${fn}('kind', 'workflow', 'id', ${wf.id}, 'name', ${wf.name}, 'workspace', ${nestedJson(this.dialect, sql`(select ${fn}('id', ${ws.id}, 'name', ${ws.name}) from ${aliasedFrom(ws)} where ${ws.id} = ${wf.workspaceId})`)}, 'runs', ${this.runsVersion(wf, i)}) else ${fn}('kind', 'item', 'id', ${ci.id}, 'itemKind', ${ci.kind}, 'name', ${ci.name}, 'slug', ${ci.slug}, 'owner', ${this.fields.ownerJson(ci)}) end)`
    // Both dialects order by name, so a refusal names consumers the same way on each.
    const order = sql`coalesce(${wf.name}, ${ci.name}), ${u.id}`
    const agg =
      this.dialect === 'pg'
        ? sql`coalesce(json_agg(${consumer} order by ${order}), '[]'::json)`
        : sql`json_group_array(json(${consumer}) order by ${order})`
    return sql`(select ${agg} from ${this.fields.consumerJoins(u, wf, ci)} where ${this.fields.usageMatches(i, u, wf, ci)} and ${this.consumerVisible(userId, wf, ci)})`
  }

  private consumersCount(userId: string, i: AnyDb): SQL<number> {
    const u = aliasedTable(this.t.libraryUsages, 'lhu')
    const wf = aliasedTable(this.t.workflows, 'lhw')
    const ci = aliasedTable(this.t.libraryItems, 'lhi')
    return sql<number>`(select count(*) from ${this.fields.consumerJoins(u, wf, ci)} where ${this.fields.usageMatches(i, u, wf, ci)} and not ${this.consumerVisible(userId, wf, ci)})`
  }

  /** The version of the item the workflow's newest live deployment bundled. */
  private runsVersion(wf: AnyDb, i: AnyDb): SQL {
    const dlv = aliasedTable(this.t.deploymentLibraryVersions, 'lrv')
    const d = aliasedTable(this.t.deployments, 'lrd')
    const newer = aliasedTable(this.t.deployments, 'lrn')
    return sql`(select ${dlv.version} from ${aliasedFrom(dlv)} inner join ${aliasedFrom(d)} on ${d.id} = ${dlv.deploymentId} where ${d.workflowId} = ${wf.id} and ${dlv.itemId} = ${i.id} and ${liveOnItsAccount(d, newer)} order by ${d.createdAt} desc limit 1)`
  }

  /** Whether anything uses the item at all (blocks a delete, and a module's slug change). */
  used(i: AnyDb): SQL {
    const u = aliasedTable(this.t.libraryUsages, 'lus')
    const wf = aliasedTable(this.t.workflows, 'lusw')
    const ci = aliasedTable(this.t.libraryItems, 'lusi')
    return sql`exists (select 1 from ${this.fields.consumerJoins(u, wf, ci)} where ${this.fields.usageMatches(i, u, wf, ci)})`
  }
}
