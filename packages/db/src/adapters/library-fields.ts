import { aliasedTable, sql, type SQL } from 'drizzle-orm'
import { aliasedFrom, isoText, nestedJson, type Dialect } from './json-array.js'
import type { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface LibraryTables {
  libraryItems: AnyTable
  libraryItemFiles: AnyTable
  libraryVersions: AnyTable
  libraryUsages: AnyTable
  deploymentLibraryVersions: AnyTable
  projects: AnyTable
  workspaces: AnyTable
  workflows: AnyTable
  deployments: AnyTable
  user: AnyTable
  member: AnyTable
  installedNodes: AnyTable
}

/**
 * Where a consumer sits, as SQL: its project, and its owner key (the
 * workspace id, or '' for the project itself), so its imports resolve the
 * way a deploy resolves them.
 */
export interface ConsumerPlaceSql {
  projectId: SQL | string
  ownerKey: SQL | string
}

/**
 * The SQL every library read shares: who may open an item, its owner as
 * JSON and its latest published version. `i` is an alias of library_items
 * in the statement being built.
 */
export class LibraryFields {
  constructor(
    private t: LibraryTables,
    private roles: RoleFields,
    private dialect: Dialect,
  ) {}

  private organizationOf(i: AnyTable): SQL {
    const p = aliasedTable(this.t.projects, 'lfo')
    return sql`(select ${p.organizationId} from ${aliasedFrom(p)} where ${p.id} = ${i.projectId})`
  }

  /**
   * The caller's role where the item lives: their workspace role for a
   * workspace's item, the role their project role gives for the project's
   * (admin → admin, member → editor). Null when they cannot open the owner.
   */
  ownerRole(who: string, i: AnyTable): SQL {
    const organizationId = this.organizationOf(i)
    const place = { organizationId, projectId: i.projectId }
    const projectRole = this.roles.projectRoleOf(who, place)
    return sql`(case when ${i.workspaceId} is null then (case ${projectRole} when 'admin' then 'admin' when 'member' then 'editor' else null end) else ${this.roles.workspaceRoleOf(who, { ...place, workspaceId: i.workspaceId })} end)`
  }

  /** An item's columns, named: no read takes the whole row. */
  itemColumns(i: AnyTable) {
    return {
      id: i.id,
      projectId: i.projectId,
      workspaceId: i.workspaceId,
      kind: i.kind,
      slug: i.slug,
      name: i.name,
      description: i.description,
      createdBy: i.createdBy,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }
  }

  /**
   * Whether the caller may open the item: a workspace's item from that
   * workspace only; the project's own from anywhere in the project, since
   * every workspace there may use it.
   */
  readable(who: string, i: AnyTable): SQL {
    const place = { organizationId: this.organizationOf(i), projectId: i.projectId }
    return sql`(case when ${i.workspaceId} is null then ${this.roles.projectVisible(who, place)} else ${this.roles.workspaceRoleOf(who, { ...place, workspaceId: i.workspaceId })} is not null end)`
  }

  /** `{ kind, id, name }` of the item's owner, as a JSON object. */
  ownerJson(i: AnyTable): SQL {
    const w = aliasedTable(this.t.workspaces, 'lfw')
    const p = aliasedTable(this.t.projects, 'lfp')
    const fn = this.dialect === 'pg' ? sql`json_build_object` : sql`json_object`
    // A subquery's JSON reaches sqlite's outer json_object as text: nestedJson marks it as JSON.
    return nestedJson(
      this.dialect,
      sql`(case when ${i.workspaceId} is null then (select ${fn}('kind', 'project', 'id', ${p.id}, 'name', ${p.name}) from ${aliasedFrom(p)} where ${p.id} = ${i.projectId}) else (select ${fn}('kind', 'workspace', 'id', ${w.id}, 'name', ${w.name}) from ${aliasedFrom(w)} where ${w.id} = ${i.workspaceId}) end)`,
    )
  }

  /** The item's newest published version text, or null. */
  latestVersion(i: AnyTable): SQL<string | null> {
    const v = aliasedTable(this.t.libraryVersions, 'lfv')
    return sql<
      string | null
    >`(select ${v.version} from ${aliasedFrom(v)} where ${v.itemId} = ${i.id} order by ${v.seq} desc limit 1)`
  }

  /** The newest version's publish order, or 0. */
  latestSeq(i: AnyTable): SQL<number> {
    const v = aliasedTable(this.t.libraryVersions, 'lfs')
    return sql<number>`(select coalesce(max(${v.seq}), 0) from ${aliasedFrom(v)} where ${v.itemId} = ${i.id})`.mapWith(
      Number,
    )
  }

  /** When the newest version was published, as ISO text, or null. */
  latestPublishedAt(i: AnyTable): SQL<string | null> {
    const v = aliasedTable(this.t.libraryVersions, 'lfa')
    return sql<
      string | null
    >`(select ${isoText(this.dialect, v.publishedAt)} from ${aliasedFrom(v)} where ${v.itemId} = ${i.id} order by ${v.seq} desc limit 1)`
  }

  /** How many workflows and items use the item, each judged as a deploy resolves it. */
  usedByCount(i: AnyTable): SQL<number> {
    const u = aliasedTable(this.t.libraryUsages, 'lfu')
    const wf = aliasedTable(this.t.workflows, 'lfuw')
    const ci = aliasedTable(this.t.libraryItems, 'lfui')
    return sql<number>`(select count(*) from ${this.consumerJoins(u, wf, ci)} where ${this.usageMatches(i, u, wf, ci)})`
  }

  /** A usage row with its consumer: the workflow, or the library item. */
  consumerJoins(u: AnyTable, wf: AnyTable, ci: AnyTable): SQL {
    return sql`${aliasedFrom(u)} left join ${aliasedFrom(wf)} on ${wf.id} = ${u.workflowId} left join ${aliasedFrom(ci)} on ${ci.id} = ${u.consumerItemId}`
  }

  /** The joined consumer's place. */
  consumerPlace(wf: AnyTable, ci: AnyTable): ConsumerPlaceSql {
    return {
      projectId: sql`coalesce(${wf.projectId}, ${ci.projectId})`,
      ownerKey: sql`(case when ${wf.id} is not null then ${wf.workspaceId} else coalesce(${ci.workspaceId}, '') end)`,
    }
  }

  /**
   * Whether usage row `u` (its consumer joined as `wf` / `ci`) uses item `i`:
   * a custom node it places, or a module its slug resolves to from where
   * the consumer sits. Resolved at read time, so a module created or
   * shadowed after the consumer was saved is judged as a deploy would.
   */
  usageMatches(i: AnyTable, u: AnyTable, wf: AnyTable, ci: AnyTable): SQL {
    const place = this.consumerPlace(wf, ci)
    // A node counts only where it is in reach: the consumer's own workspace or its project's own.
    const nodeInReach = sql`${i.projectId} = ${place.projectId} and coalesce(${i.workspaceId}, '') in (${place.ownerKey}, '')`
    return sql`((${u.nodeId} = ${i.id} and ${nodeInReach}) or (${i.kind} = 'module' and ${u.slug} = ${i.slug} and (${ci.id} is null or ${ci.id} <> ${i.id}) and ${this.resolves(i, place)}))`
  }

  /** The later of the item's own change and its newest file write, as ISO text. */
  updatedAt(i: AnyTable): SQL<string> {
    const f = aliasedTable(this.t.libraryItemFiles, 'lff')
    const newestFile = sql`(select max(${f.updatedAt}) from ${aliasedFrom(f)} where ${f.itemId} = ${i.id})`
    const later =
      this.dialect === 'pg'
        ? sql`greatest(${i.updatedAt}, ${newestFile})`
        : sql`max(${i.updatedAt}, coalesce(${newestFile}, ${i.updatedAt}))`
    return isoText(this.dialect, later)
  }

  /**
   * Whether module `t` is what a consumer at `place` gets for `t.slug`: its
   * own workspace's module of that slug, else the project's own. Nothing
   * reaches across workspaces, and the project's items see only each other.
   * `t` is an alias of library_items; the caller matches the slug.
   */
  resolves(t: AnyTable, place: ConsumerPlaceSql): SQL {
    const own = aliasedTable(this.t.libraryItems, 'lro')
    return sql`(${t.projectId} = ${place.projectId} and ${t.kind} = 'module' and (coalesce(${t.workspaceId}, '') = ${place.ownerKey} or (${t.workspaceId} is null and not exists (select 1 from ${aliasedFrom(own)} where ${own.projectId} = ${t.projectId} and ${own.kind} = 'module' and ${own.slug} = ${t.slug} and coalesce(${own.workspaceId}, '') = ${place.ownerKey}))))`
  }
}
