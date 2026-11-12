import { aliasedTable, and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../db-errors.js'
import type {
  LibraryFileSummary,
  LibraryItemSources,
  LibraryOwnerScope,
  LibraryOwnerTree,
  LibraryOwnerTreeItem,
  LibraryVersionDetail,
  LibraryVersionFile,
  LibraryVersionFileSummary,
  LibraryVersionImports,
  LibraryVersionListItem,
  PublishLibraryVersionData,
  PublishLibraryVersionOutcome,
  RestoreLibraryVersionData,
} from '../library-types.js'
import { atomically, atomicallyReturning } from './atomic.js'
import {
  aliasedFrom,
  fieldOf,
  isoText,
  jsonArrayOf,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { LibraryTables } from './library-fields.js'
import type { LibraryFilesAdapter } from './library-files.js'
import type { LibraryUsagesAdapter } from './library-usages.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

const ICON = 'icon.svg'

/** A bound ISO time an INSERT … SELECT can put in a timestamp column on either dialect. */
function timeParam(dialect: Dialect, iso: string): SQL {
  return dialect === 'pg' ? sql`cast(${iso} as timestamp)` : sql`${iso}`
}

/**
 * Published versions: immutable rows, numbered in publish order, at most
 * `keep` per item. Publishing and restoring each run as one unit with the
 * working-copy changes and the usage rows they imply.
 */
export class LibraryVersionsAdapter {
  constructor(
    private db: AnyDb,
    private t: LibraryTables,
    private files: LibraryFilesAdapter,
    private usages: LibraryUsagesAdapter,
    private dialect: Dialect,
  ) {}

  // Who published, named only while they are still in the item's
  // organization (as a share names its sharer): someone who left is no one's to see.
  private listFields(v: AnyDb, u: AnyDb) {
    const m = aliasedTable(this.t.member, 'lvm')
    const i = aliasedTable(this.t.libraryItems, 'lvi')
    const p = aliasedTable(this.t.projects, 'lvp')
    const stillIn = sql`exists (select 1 from ${aliasedFrom(m)} inner join ${aliasedFrom(p)} on ${p.organizationId} = ${m.organizationId} inner join ${aliasedFrom(i)} on ${i.projectId} = ${p.id} where ${i.id} = ${v.itemId} and ${m.userId} = ${v.publishedBy})`
    return {
      version: v.version,
      seq: v.seq,
      publishedAt: v.publishedAt,
      publishedById: sql<string | null>`(case when ${stillIn} then ${v.publishedBy} else null end)`,
      publishedByName: sql<string | null>`(case when ${stillIn} then ${u.name} else null end)`,
    }
  }

  private toListItem(row: {
    version: string
    seq: number
    publishedAt: string
    publishedById: string | null
    publishedByName: string | null
  }): LibraryVersionListItem {
    return {
      version: row.version,
      seq: row.seq,
      publishedAt: row.publishedAt,
      publishedBy:
        row.publishedById && row.publishedByName
          ? { id: row.publishedById, name: row.publishedByName }
          : null,
    }
  }

  /** Newest first, with who published each. */
  async list(itemId: string): Promise<LibraryVersionListItem[]> {
    const v = this.t.libraryVersions
    const u = this.t.user
    const rows = await this.db
      .select(this.listFields(v, u))
      .from(v)
      .leftJoin(u, eq(u.id, v.publishedBy))
      .where(eq(v.itemId, itemId))
      .orderBy(desc(v.seq))
    return rows.map(this.toListItem)
  }

  async get(itemId: string, version: string): Promise<LibraryVersionDetail | null> {
    const v = this.t.libraryVersions
    const u = this.t.user
    const rows = await this.db
      .select({ ...this.listFields(v, u), files: v.files, imports: v.imports })
      .from(v)
      .leftJoin(u, eq(u.id, v.publishedBy))
      .where(and(eq(v.itemId, itemId), eq(v.version, version)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      ...this.toListItem(row),
      files: JSON.parse(row.files),
      imports: JSON.parse(row.imports),
    }
  }

  /** Each kept version's imports, newest first: part of what the item uses. */
  async versionImports(itemId: string): Promise<LibraryVersionImports[]> {
    const v = this.t.libraryVersions
    const rows: { version: string; seq: number; imports: string }[] = await this.db
      .select({ version: v.version, seq: v.seq, imports: v.imports })
      .from(v)
      .where(eq(v.itemId, itemId))
      .orderBy(desc(v.seq))
    return rows.map((row) => ({ ...row, imports: JSON.parse(row.imports) as string[] }))
  }

  /** Whether the item has published `version`. */
  async exists(itemId: string, version: string): Promise<boolean> {
    const v = this.t.libraryVersions
    const rows = await this.db
      .select({ id: v.id })
      .from(v)
      .where(and(eq(v.itemId, itemId), eq(v.version, version)))
      .limit(1)
    return rows.length > 0
  }

  /** One published file, picked out of its version row in SQL. */
  async file(
    itemId: string,
    version: string,
    path: string,
  ): Promise<(LibraryVersionFile & { publishedAt: string }) | null> {
    const v = aliasedTable(this.t.libraryVersions, 'lvf')
    const rows =
      this.dialect === 'pg'
        ? await this.db
            .select({
              path: sql<string>`e->>'path'`,
              source: sql<string>`e->>'source'`,
              hash: sql<string>`e->>'hash'`,
              size: sql<number>`(e->>'size')::int`,
              publishedAt: isoText(this.dialect, v.publishedAt),
            })
            .from(sql`${aliasedFrom(v)}, json_array_elements(${v.files}::json) as e`)
            .where(
              sql`${v.itemId} = ${itemId} and ${v.version} = ${version} and e->>'path' = ${path}`,
            )
            .limit(1)
        : await this.db
            .select({
              path: sql<string>`json_extract(e.value, '$.path')`,
              source: sql<string>`json_extract(e.value, '$.source')`,
              hash: sql<string>`json_extract(e.value, '$.hash')`,
              size: sql<number>`json_extract(e.value, '$.size')`,
              publishedAt: isoText(this.dialect, v.publishedAt),
            })
            .from(sql`${aliasedFrom(v)}, json_each(${v.files}) as e`)
            .where(
              sql`${v.itemId} = ${itemId} and ${v.version} = ${version} and json_extract(e.value, '$.path') = ${path}`,
            )
            .limit(1)
    return rows[0] ?? null
  }

  /**
   * The working copy's file metadata and, for a custom node, every
   * published file but its icon, read out of the version rows in SQL: the
   * item's tree in one statement. A module's versions are its history, not
   * part of its tree.
   */
  async tree(
    itemId: string,
    kind: 'module' | 'node',
  ): Promise<{ files: LibraryFileSummary[]; published: LibraryVersionFileSummary[] }> {
    const i = this.t.libraryItems
    const published = kind === 'module' ? sql`null` : this.publishedJson(i)
    const rows = await this.db
      .select({ files: fieldOf(this.workingJson(i)), published: fieldOf(published) })
      .from(i)
      .where(eq(i.id, itemId))
      .limit(1)
    return {
      files: readJsonArray<LibraryFileSummary>(rows[0]?.files),
      published: readJsonArray<LibraryVersionFileSummary>(rows[0]?.published),
    }
  }

  /**
   * Every item one owner holds (a workspace, or the project itself), each
   * with its tree as `tree()` reads it: the Library IDE's explorer in one
   * statement. Sources stay behind; the IDE reads a file when it opens it.
   */
  async ownerTree(scope: LibraryOwnerScope): Promise<LibraryOwnerTree> {
    const i = aliasedTable(this.t.libraryItems, 'lot')
    const own =
      scope.workspaceId === null
        ? sql`${i.workspaceId} is null`
        : sql`${i.workspaceId} = ${scope.workspaceId}`
    // In a workspace's tree, the project's modules come along by slug and
    // latest version only: what its imports resolve to when it owns none.
    const projectModule =
      scope.workspaceId === null
        ? sql`1 = 0`
        : sql`(${i.workspaceId} is null and ${i.kind} = 'module')`
    const latest = aliasedTable(this.t.libraryVersions, 'lotv')
    const rows = await this.db
      .select({
        id: i.id,
        kind: i.kind,
        slug: i.slug,
        name: i.name,
        own: sql<number>`(case when ${own} then 1 else 0 end)`.mapWith(Number),
        // fieldOf: a statement with no joins would strip the subqueries' qualifiers.
        latestVersion: fieldOf(
          sql<
            string | null
          >`(select ${latest.version} from ${aliasedFrom(latest)} where ${latest.itemId} = ${i.id} order by ${latest.seq} desc limit 1)`,
        ),
        files: fieldOf(sql`(case when ${own} then ${this.workingJson(i)} else null end)`),
        published: fieldOf(
          sql`(case when ${own} and ${i.kind} = 'node' then ${this.publishedJson(i)} else null end)`,
        ),
      })
      .from(i)
      .where(and(eq(i.projectId, scope.projectId), sql`(${own} or ${projectModule})`))
      .orderBy(i.kind, i.slug)
    const items: LibraryOwnerTreeItem[] = []
    const projectModules: LibraryOwnerTree['projectModules'] = []
    for (const row of rows as {
      id: string
      kind: 'module' | 'node'
      slug: string
      name: string
      own: number
      latestVersion: string | null
      files: unknown
      published: unknown
    }[]) {
      const latestVersion = row.latestVersion ?? null
      if (!row.own) {
        projectModules.push({ id: row.id, slug: row.slug, latestVersion })
        continue
      }
      items.push({
        id: row.id,
        kind: row.kind,
        slug: row.slug,
        name: row.name,
        latestVersion,
        files: readJsonArray<LibraryFileSummary>(row.files),
        published: readJsonArray<LibraryVersionFileSummary>(row.published),
      })
    }
    return { items, projectModules }
  }

  /**
   * The item's working copy with sources, and its latest version's files:
   * what a duplicate copies, in one statement.
   */
  async sources(itemId: string): Promise<LibraryItemSources> {
    const i = this.t.libraryItems
    const f = aliasedTable(this.t.libraryItemFiles, 'lsf')
    const v = aliasedTable(this.t.libraryVersions, 'lsv')
    const working = sql`(select ${jsonArrayOf(this.dialect, { path: f.path, source: f.source }, sql`${f.path}`)} from ${aliasedFrom(f)} where ${f.itemId} = ${i.id})`
    const latestVersion = sql<
      string | null
    >`(select ${v.version} from ${aliasedFrom(v)} where ${v.itemId} = ${i.id} order by ${v.seq} desc limit 1)`
    const lv = aliasedTable(this.t.libraryVersions, 'lsl')
    const latestFiles = sql`(select ${lv.files} from ${aliasedFrom(lv)} where ${lv.itemId} = ${i.id} order by ${lv.seq} desc limit 1)`
    const rows = await this.db
      .select({
        files: fieldOf(working),
        latestVersion: fieldOf(latestVersion),
        latestFiles: fieldOf(latestFiles),
      })
      .from(i)
      .where(eq(i.id, itemId))
      .limit(1)
    const row = rows[0]
    const latestVersionText = (row?.latestVersion as string | null | undefined) ?? null
    return {
      files: readJsonArray<{ path: string; source: string }>(row?.files),
      latest:
        latestVersionText === null
          ? null
          : {
              version: latestVersionText,
              files: readJsonArray<LibraryVersionFile>(row?.latestFiles).map((file) => ({
                path: file.path,
                source: file.source,
              })),
            },
    }
  }

  private workingJson(i: AnyDb): SQL {
    const f = aliasedTable(this.t.libraryItemFiles, 'ltf')
    return sql`(select ${jsonArrayOf(
      this.dialect,
      {
        id: f.id,
        itemId: f.itemId,
        path: f.path,
        hash: f.hash,
        size: f.size,
        createdAt: isoText(this.dialect, f.createdAt),
        updatedAt: isoText(this.dialect, f.updatedAt),
      },
      sql`${f.path}`,
    )} from ${aliasedFrom(f)} where ${f.itemId} = ${i.id})`
  }

  // A node's published files but its icon (the icon lives in the working copy).
  private publishedJson(i: AnyDb): SQL {
    const v = aliasedTable(this.t.libraryVersions, 'ltv')
    return this.dialect === 'pg'
      ? sql`(select coalesce(json_agg(json_build_object('version', ${v.version}, 'path', e->>'path', 'hash', e->>'hash', 'size', (e->>'size')::int, 'publishedAt', ${isoText(this.dialect, v.publishedAt)}) order by ${v.seq} desc, e->>'path'), '[]'::json) from ${aliasedFrom(v)}, json_array_elements(${v.files}::json) as e where ${v.itemId} = ${i.id} and e->>'path' <> ${ICON})`
      : sql`(select json_group_array(json_object('version', ${v.version}, 'path', json_extract(e.value, '$.path'), 'hash', json_extract(e.value, '$.hash'), 'size', json_extract(e.value, '$.size'), 'publishedAt', ${v.publishedAt}) order by ${v.seq} desc, json_extract(e.value, '$.path')) from ${aliasedFrom(v)}, json_each(${v.files}) as e where ${v.itemId} = ${i.id} and json_extract(e.value, '$.path') <> ${ICON})`
  }

  /**
   * Publishes as one unit: the version row (numbered one past the item's
   * last, and only while that last is still `expectedSeq`, so a version
   * judged against a stale latest never lands), the oldest rows beyond
   * `keep` removed, the working-copy paths
   * that became the version dropped, and the usage rows rewritten. A
   * module's bumped package.json is written first, conditionally on the
   * hash that was read: if that publish then loses a race, the file already
   * names the next version, which is what a retry publishes.
   */
  async publish(
    data: PublishLibraryVersionData,
    keep: number,
  ): Promise<PublishLibraryVersionOutcome> {
    if (data.rewrite) {
      const written = await this.files.updateIfMatches(data.rewrite.file, data.rewrite.expectedHash)
      if (!written) return { ok: false, reason: 'changed' }
    }
    const v = this.t.libraryVersions
    const now = new Date().toISOString()
    const itemId = data.item.itemId
    let results: { version: string; seq: number; publishedAt: string }[][]
    try {
      results = await atomicallyReturning(this.db, (tx) => {
        const last = aliasedTable(v, 'lpl')
        const insert = tx
          .insert(v)
          .select(
            tx
              .select({
                id: sql`${data.id}`,
                itemId: sql`${itemId}`,
                version: sql`${data.version}`,
                seq: sql`coalesce(max(${last.seq}), 0) + 1`,
                files: sql`${JSON.stringify(data.files)}`,
                imports: sql`${JSON.stringify(data.imports)}`,
                publishedBy: data.publishedBy === null ? sql`null` : sql`${data.publishedBy}`,
                publishedAt: timeParam(this.dialect, now),
              })
              .from(last)
              .where(eq(last.itemId, itemId))
              .having(sql`coalesce(max(${last.seq}), 0) = ${data.expectedSeq}`),
          )
          .returning({ version: v.version, seq: v.seq, publishedAt: v.publishedAt })
        // Everything after the insert happens only if it landed.
        const landed = aliasedTable(v, 'lpd')
        const inserted = sql`exists (select 1 from ${aliasedFrom(landed)} where ${landed.id} = ${data.id})`
        const newest = aliasedTable(v, 'lpn')
        const prune = tx
          .delete(v)
          .where(
            and(
              eq(v.itemId, itemId),
              inserted,
              sql`${v.seq} <= (select max(${newest.seq}) from ${aliasedFrom(newest)} where ${newest.itemId} = ${itemId}) - ${keep}`,
            ),
          )
          .returning({ version: v.version })
        const removed = this.files.deletePathsStatement(tx, itemId, data.removePaths, inserted)
        const i = this.t.libraryItems
        // The item changed: its "Updated" moves even when the publish emptied the working copy.
        const touch = tx
          .update(i)
          .set({ updatedAt: now })
          .where(and(eq(i.id, itemId), inserted))
          .returning({ id: i.id })
        return [
          insert,
          prune,
          touch,
          ...(removed ? [removed] : []),
          ...this.usages.rewriteStatements(tx, data.item, data.usageSlugs, {
            from: v,
            condition: eq(v.id, data.id),
          }),
        ]
      })
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: 'conflict' }
      throw error
    }
    const [inserted, pruned] = results
    const row = inserted?.[0]
    // Another publish moved the latest after this one was judged.
    if (!row) return { ok: false, reason: 'conflict' }
    return {
      ok: true,
      version: {
        version: row.version,
        seq: row.seq,
        publishedAt: row.publishedAt,
        publishedBy: null,
      },
      pruned: (pruned ?? []).map((r) => r.version),
    }
  }

  /** Replaces part of the working copy with a version's code, and rewrites the usage rows: one unit. */
  async restore(data: RestoreLibraryVersionData): Promise<void> {
    const itemId = data.item.itemId
    await atomically(this.db, (tx) => {
      const removed = this.files.deletePathsStatement(tx, itemId, data.removePaths)
      return [
        ...(removed ? [removed] : []),
        ...this.files.upsertStatements(tx, data.files),
        ...this.usages.rewriteStatements(tx, data.item, data.usageSlugs),
      ]
    })
  }
}
