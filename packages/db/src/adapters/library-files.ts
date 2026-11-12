import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import type { LibraryFile, LibraryFileSummary, UpsertLibraryFileData } from '../library-types.js'
import { insertWhereQuery } from './insert-where.js'
import { idList, type Dialect } from './json-array.js'
import { chunked, rowsPerInsert } from './statement-params.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/**
 * A library item's working copy, with the same optimistic-concurrency
 * contract as a workflow's project files: every precondition rides in the
 * statement's own WHERE or conflict clause. Rows are scoped by itemId only;
 * the route has already resolved the item for the caller.
 */
export class LibraryFilesAdapter {
  constructor(
    private db: AnyDb,
    private table: AnyDb,
    private dialect: Dialect,
  ) {}

  private fileFields() {
    return { ...this.summaryFields(), source: this.table.source }
  }

  private summaryFields() {
    return {
      id: this.table.id,
      itemId: this.table.itemId,
      path: this.table.path,
      hash: this.table.hash,
      size: this.table.size,
      createdAt: this.table.createdAt,
      updatedAt: this.table.updatedAt,
    }
  }

  async list(itemId: string): Promise<LibraryFile[]> {
    return this.db
      .select(this.fileFields())
      .from(this.table)
      .where(eq(this.table.itemId, itemId))
      .orderBy(asc(this.table.path))
  }

  /** Metadata only: a listing must not pull every source. */
  async listSummaries(itemId: string): Promise<LibraryFileSummary[]> {
    return this.db
      .select(this.summaryFields())
      .from(this.table)
      .where(eq(this.table.itemId, itemId))
      .orderBy(asc(this.table.path))
  }

  async get(itemId: string, path: string): Promise<LibraryFile | null> {
    const rows = await this.db
      .select(this.fileFields())
      .from(this.table)
      .where(and(eq(this.table.itemId, itemId), eq(this.table.path, path)))
      .limit(1)
    return rows[0] ?? null
  }

  private values(rows: UpsertLibraryFileData[]) {
    const now = new Date().toISOString()
    // One row per path, the last one winning: a path twice in one statement is an error on Postgres.
    const byPath = new Map(rows.map((data) => [`${data.itemId}\u0000${data.path}`, data]))
    return [...byPath.values()].map((data) => ({
      id: data.id,
      itemId: data.itemId,
      path: data.path,
      source: data.source,
      hash: data.hash,
      size: data.size,
      createdAt: now,
      updatedAt: now,
    }))
  }

  /** Create-or-replace statements on (itemId, path), not yet run: for a unit. */
  upsertStatements(tx: AnyDb, rows: UpsertLibraryFileData[]): unknown[] {
    if (rows.length === 0) return []
    return chunked(this.values(rows), rowsPerInsert(this.table)).map((some) =>
      tx
        .insert(this.table)
        .values(some)
        .onConflictDoUpdate({
          target: [this.table.itemId, this.table.path],
          set: {
            source: sql`excluded.source`,
            hash: sql`excluded.hash`,
            size: sql`excluded.size`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning({ id: this.table.id }),
    )
  }

  /** Inserts that land only if the item row exists (written earlier in the same unit). */
  insertWhereItemStatements(tx: AnyDb, rows: UpsertLibraryFileData[], items: AnyDb): unknown[] {
    return this.values(rows).map((row) =>
      insertWhereQuery(tx, this.table, row, items, eq(items.id, row.itemId)),
    )
  }

  /** Insert-only statements, not yet run: for a new item's scaffold. */
  insertStatements(tx: AnyDb, rows: UpsertLibraryFileData[]): unknown[] {
    if (rows.length === 0) return []
    return chunked(this.values(rows), rowsPerInsert(this.table)).map((some) =>
      tx.insert(this.table).values(some).returning({ id: this.table.id }),
    )
  }

  /** A delete of these paths, not yet run: for a unit. */
  deletePathsStatement(tx: AnyDb, itemId: string, paths: string[], onlyIf?: SQL): unknown | null {
    if (paths.length === 0) return null
    return (
      tx
        .delete(this.table)
        // One bound JSON list, so a long set never meets D1's 100-parameter cap.
        .where(
          and(
            eq(this.table.itemId, itemId),
            sql`${this.table.path} in ${idList(this.dialect, paths)}`,
            ...(onlyIf ? [onlyIf] : []),
          ),
        )
        .returning({ id: this.table.id })
    )
  }

  async upsert(data: UpsertLibraryFileData): Promise<LibraryFile> {
    const [row] = await this.db
      .insert(this.table)
      .values(this.values([data]))
      .onConflictDoUpdate({
        target: [this.table.itemId, this.table.path],
        set: {
          source: sql`excluded.source`,
          hash: sql`excluded.hash`,
          size: sql`excluded.size`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning(this.fileFields())
    return row
  }

  /** Insert only; null when the path was already taken. */
  async createIfAbsent(data: UpsertLibraryFileData): Promise<LibraryFile | null> {
    const rows = await this.db
      .insert(this.table)
      .values(this.values([data]))
      .onConflictDoNothing({ target: [this.table.itemId, this.table.path] })
      .returning(this.fileFields())
    return rows[0] ?? null
  }

  /** Replace only when the stored hash is `expectedHash` (`'*'`: only when it exists). */
  async updateIfMatches(
    data: UpsertLibraryFileData,
    expectedHash: string,
  ): Promise<LibraryFile | null> {
    const rows = await this.db
      .update(this.table)
      .set({
        source: data.source,
        hash: data.hash,
        size: data.size,
        updatedAt: new Date().toISOString(),
      })
      .where(this.matching(data.itemId, data.path, expectedHash))
      .returning(this.fileFields())
    return rows[0] ?? null
  }

  /** As `updateIfMatches`, not yet run: for a unit. */
  updateIfMatchesStatement(tx: AnyDb, data: UpsertLibraryFileData, expectedHash: string): unknown {
    return tx
      .update(this.table)
      .set({
        source: data.source,
        hash: data.hash,
        size: data.size,
        updatedAt: new Date().toISOString(),
      })
      .where(this.matching(data.itemId, data.path, expectedHash))
      .returning({ id: this.table.id })
  }

  private matching(itemId: string, path: string, expectedHash: string | undefined) {
    return and(
      eq(this.table.itemId, itemId),
      eq(this.table.path, path),
      ...(expectedHash !== undefined && expectedHash !== '*'
        ? [eq(this.table.hash, expectedHash)]
        : []),
    )
  }

  /** True when a row was removed; with `expectedHash` only if it still matches. */
  async delete(itemId: string, path: string, expectedHash?: string): Promise<boolean> {
    const rows = await this.db
      .delete(this.table)
      .where(this.matching(itemId, path, expectedHash))
      .returning({ id: this.table.id })
    return rows.length > 0
  }
}
