import { and, asc, eq, inArray, isNotNull, lt, ne, sql, type SQL } from 'drizzle-orm'
import type {
  ImageInsert,
  ImageOwner,
  ImageOwnerKind,
  InlineImageRow,
  ServableImage,
} from '../types.js'
import { atomically, atomicallyReturning } from './atomic.js'
import type { Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface ImageTables {
  images: AnyTable
  user: AnyTable
  organization: AnyTable
}

/** What an owner's column holds for a stored image: this, then the id. */
const PATH_PREFIX = '/api/images/'

/** Ids per statement: D1 binds at most 100 parameters, and a claim adds three. */
const CHUNK = 90

function chunks(ids: string[]): string[][] {
  const out: string[][] = []
  for (let at = 0; at < ids.length; at += CHUNK) out.push(ids.slice(at, at + CHUNK))
  return out
}

/** Users before organizations: the order owner rows are locked in. */
const OWNER_KINDS = ['user', 'org'] as const

/** Users before organizations, then by id: the order owner rows are locked in. */
function ownerOrder(a: ImageOwner, b: ImageOwner): number {
  if (a.kind !== b.kind) return OWNER_KINDS.indexOf(a.kind) - OWNER_KINDS.indexOf(b.kind)
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The provider avatar URLs kept as they are; any other remote URL is cleared. */
const PROVIDER_URL_PATTERNS = [
  'https://avatars.githubusercontent.com/%',
  'https://lh3.googleusercontent.com/%',
]

/**
 * Uploaded photos and logos (`image`): the rows that say whose each image
 * is, and — for the database store — its bytes. An image is served, and
 * kept, only while its owner's column still names it; every check of that
 * is in the statement.
 */
export class ImagesAdapter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: ImageTables,
    private dialect: Dialect,
  ) {}

  /*
   * On Postgres the swap and the claim each lock the owner rows they are
   * about to check, before checking them. Under read committed a statement's
   * `exists` reads the rows as they were when it began, so without the lock
   * a swap and a claim running at once could each pass on what the other
   * was changing: the owner pointed at a row whose bytes then go. With it,
   * the second waits for the first to commit, and its check (a statement
   * that starts after the lock) reads what the first wrote. A swap locks
   * its one owner row; a claim locks every owner row of all its images up
   * front, users then organizations, each by id — so two claims take their
   * locks in the same order and can't deadlock. `for no key update`: it
   * conflicts with itself, but not with the key-share locks that inserts
   * referencing the user or organization (sessions, members) take. SQLite
   * and D1 already run one writer at a time, and SQLite has no row locks.
   */

  /** Locks the owner's row; nothing on SQLite. */
  private lockOwner(tx: AnyTable, owner: ImageOwner): AnyTable[] {
    if (this.dialect !== 'pg') return []
    const { table } = this.ownerColumn(owner.kind)
    return [
      tx.select({ id: table.id }).from(table).where(eq(table.id, owner.id)).for('no key update'),
    ]
  }

  /**
   * Locks the rows of every owner of these images, in id order; nothing on
   * SQLite. Not chunked: only Postgres runs it, which binds far more than
   * D1's 100 parameters.
   */
  private lockOwnersOf(tx: AnyTable, ids: string[]): AnyTable[] {
    if (this.dialect !== 'pg') return []
    const i = this.t.images
    return OWNER_KINDS.map((kind) => {
      const { table } = this.ownerColumn(kind)
      const owners = tx
        .select({ id: i.ownerId })
        .from(i)
        .where(and(inArray(i.id, ids), eq(i.ownerKind, kind)))
      return (
        tx
          .select({ id: table.id })
          .from(table)
          .where(inArray(table.id, owners))
          // Byte order, as `ownerOrder` sorts: the database's collation may not be.
          .orderBy(sql`${table.id} collate "C"`)
          .for('no key update')
      )
    })
  }

  /** The owner's table and the column that holds its image. */
  private ownerColumn(kind: ImageOwnerKind): {
    table: AnyTable
    column: AnyTable
    field: 'image' | 'logo'
  } {
    return kind === 'user'
      ? { table: this.t.user, column: this.t.user.image, field: 'image' }
      : { table: this.t.organization, column: this.t.organization.logo, field: 'logo' }
  }

  /** The image row `i` is what its owner's column names right now. */
  private referenced(): SQL {
    const i = this.t.images
    const u = this.t.user
    const o = this.t.organization
    const path = sql`${PATH_PREFIX} || ${i.id}`
    return sql`((${i.ownerKind} = 'user' and exists (select 1 from ${u} where ${u.id} = ${i.ownerId} and ${u.image} = ${path})) or (${i.ownerKind} = 'org' and exists (select 1 from ${o} where ${o.id} = ${i.ownerId} and ${o.logo} = ${path})))`
  }

  async insertImage(row: ImageInsert): Promise<void> {
    await this.db.insert(this.t.images).values({ ...row, data: row.data ?? null })
  }

  /** Several rows as one unit: the inline images a migration batch moves. */
  async insertImages(rows: ImageInsert[]): Promise<void> {
    await atomically(this.db, (tx) =>
      rows.map((row) => tx.insert(this.t.images).values({ ...row, data: row.data ?? null })),
    )
  }

  /** Writes the bytes into an existing row (the database store's `put`). */
  async setImageData(id: string, data: Uint8Array): Promise<void> {
    await this.db.update(this.t.images).set({ data }).where(eq(this.t.images.id, id))
  }

  /** The bytes a row holds (the database store's `get`), or null. */
  async getImageData(id: string): Promise<Uint8Array | null> {
    const i = this.t.images
    const rows = await this.db.select({ data: i.data }).from(i).where(eq(i.id, id)).limit(1)
    return rows[0]?.data ? new Uint8Array(rows[0].data) : null
  }

  /**
   * The image to serve at `/api/images/:id`, with its bytes when the row
   * holds them; null when there is none, or its owner no longer names it.
   */
  async getImage(id: string): Promise<ServableImage | null> {
    const i = this.t.images
    const rows = await this.db
      .select({ contentType: i.contentType, bytesLen: i.bytesLen, data: i.data })
      .from(i)
      .where(and(eq(i.id, id), this.referenced()))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      contentType: row.contentType,
      bytesLen: row.bytesLen,
      data: row.data ? new Uint8Array(row.data) : null,
    }
  }

  /**
   * Points the owner's column at `imageId`, as one unit with reading what
   * else the owner has stored (the old image, an upload that failed part
   * way): those ids are the caller's to delete. `set` is false when the
   * owner or the image row is gone, or the row was claimed for deletion,
   * and nothing changed.
   */
  async setOwnerImage(
    owner: ImageOwner,
    imageId: string,
  ): Promise<{ set: boolean; others: string[] }> {
    const i = this.t.images
    const { table, field } = this.ownerColumn(owner.kind)
    const ownsImage = sql`exists (select 1 from ${i} where ${i.id} = ${imageId} and ${i.ownerKind} = ${owner.kind} and ${i.ownerId} = ${owner.id} and ${i.discardedAt} is null)`
    const results = await atomicallyReturning<{ id: string }>(this.db, (tx) => [
      ...this.lockOwner(tx, owner),
      tx
        .update(table)
        .set({ [field]: PATH_PREFIX + imageId })
        .where(and(eq(table.id, owner.id), ownsImage))
        .returning({ id: table.id }),
      tx
        .select({ id: i.id })
        .from(i)
        .where(and(eq(i.ownerKind, owner.kind), eq(i.ownerId, owner.id), ne(i.id, imageId))),
    ])
    const [updated, others] = results.slice(-2)
    return { set: (updated?.length ?? 0) > 0, others: (others ?? []).map((r) => r.id) }
  }

  /** Clears the owner's column, as one unit with reading every image the owner has stored. */
  async clearOwnerImage(owner: ImageOwner): Promise<string[]> {
    const i = this.t.images
    const { table, field } = this.ownerColumn(owner.kind)
    const [, stored] = await atomicallyReturning<{ id: string }>(this.db, (tx) => [
      tx
        .update(table)
        .set({ [field]: null })
        .where(eq(table.id, owner.id))
        .returning({ id: table.id }),
      tx
        .select({ id: i.id })
        .from(i)
        .where(and(eq(i.ownerKind, owner.kind), eq(i.ownerId, owner.id))),
    ])
    return (stored ?? []).map((r) => r.id)
  }

  /** Every image an owner has stored: what deleting the account or organization removes. */
  async listOwnerImages(owner: ImageOwner): Promise<string[]> {
    const i = this.t.images
    const rows: { id: string }[] = await this.db
      .select({ id: i.id })
      .from(i)
      .where(and(eq(i.ownerKind, owner.kind), eq(i.ownerId, owner.id)))
    return rows.map((r) => r.id)
  }

  /** Images written before `before` that no owner names: the reaper's batch, oldest first. */
  async listUnreferencedImages(before: string, limit: number): Promise<string[]> {
    const i = this.t.images
    const rows: { id: string }[] = await this.db
      .select({ id: i.id })
      .from(i)
      .where(and(lt(i.createdAt, before), sql`not ${this.referenced()}`))
      .orderBy(asc(i.createdAt))
      .limit(limit)
    return rows.map((r) => r.id)
  }

  /**
   * Claims these rows for deletion, except any an owner names: from then
   * on no owner can be pointed at them, so their bytes may go. The ids
   * claimed. A row claimed before (a deletion that failed part way) is
   * claimed again. Chunked to stay under D1's 100 bound parameters, as
   * one unit.
   */
  async claimImages(ids: string[], at: string): Promise<string[]> {
    if (ids.length === 0) return []
    const i = this.t.images
    const results = await atomicallyReturning<{ id: string }>(this.db, (tx) => [
      ...this.lockOwnersOf(tx, ids),
      ...chunks(ids).map((chunk) =>
        tx
          .update(i)
          .set({ discardedAt: at })
          .where(and(inArray(i.id, chunk), sql`not ${this.referenced()}`))
          .returning({ id: i.id }),
      ),
    ])
    // The lock statements come first; their rows are owner ids.
    const locks = this.dialect === 'pg' ? OWNER_KINDS.length : 0
    return results
      .slice(locks)
      .flat()
      .map((r) => r.id)
  }

  /** Deletes claimed rows (`claimImages`); a database-store row takes its bytes with it. */
  async deleteImages(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const i = this.t.images
    await atomically(this.db, (tx) =>
      chunks(ids).map((chunk) =>
        tx.delete(i).where(and(inArray(i.id, chunk), isNotNull(i.discardedAt))),
      ),
    )
  }

  /** Which of these ids still have a row: bytes put for one that hasn't are nobody's. */
  async existingImages(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const i = this.t.images
    const found = await atomicallyReturning<{ id: string }>(this.db, (tx) =>
      chunks(ids).map((chunk) => tx.select({ id: i.id }).from(i).where(inArray(i.id, chunk))),
    )
    return found.flat().map((r) => r.id)
  }

  /** Photos and logos still held inline as `data:` URLs, from before the image store. */
  async listInlineImages(limit: number): Promise<InlineImageRow[]> {
    const u = this.t.user
    const o = this.t.organization
    const users = this.db
      .select({ ownerKind: sql<ImageOwnerKind>`'user'`, ownerId: u.id, value: u.image })
      .from(u)
      .where(sql`${u.image} like 'data:%'`)
    const orgs = this.db
      .select({ ownerKind: sql<ImageOwnerKind>`'org'`, ownerId: o.id, value: o.logo })
      .from(o)
      .where(sql`${o.logo} like 'data:%'`)
    return (await users.unionAll(orgs).limit(limit)) as InlineImageRow[]
  }

  /**
   * The inline images moved into the store, as one unit: each owner's
   * column is pointed at its new image, but only where it still holds a
   * `data:` URL (a newer upload wins); `cleared` owners — an image that
   * can't be stored, such as an SVG logo — lose theirs.
   */
  async replaceInlineImages(
    moved: { owner: ImageOwner; imageId: string }[],
    cleared: ImageOwner[],
  ): Promise<void> {
    const i = this.t.images
    // A moved owner is pointed only at a row no cleanup has claimed.
    const live = (imageId: string) =>
      sql`exists (select 1 from ${i} where ${i.id} = ${imageId} and ${i.discardedAt} is null)`
    // Each update locks its owner row: users then organizations, by id, the
    // order a claim locks them in, so a batch and a sweep can't deadlock.
    const updates = [
      ...moved.map(({ owner, imageId }) => ({ owner, value: PATH_PREFIX + imageId, imageId })),
      ...cleared.map((owner) => ({ owner, value: null, imageId: null })),
    ].sort((a, b) => ownerOrder(a.owner, b.owner))
    await atomically(this.db, (tx) =>
      updates.map(({ owner, value, imageId }) =>
        this.inlineUpdate(tx, owner, value, imageId ? live(imageId) : undefined),
      ),
    )
  }

  private inlineUpdate(tx: AnyTable, owner: ImageOwner, value: string | null, also?: SQL) {
    const { table, column, field } = this.ownerColumn(owner.kind)
    return tx
      .update(table)
      .set({ [field]: value })
      .where(and(eq(table.id, owner.id), sql`${column} like 'data:%'`, also))
  }

  /**
   * Clears every photo and logo that is neither a stored image, an inline
   * one still to move, nor a provider avatar: older remote URLs, which
   * could act as tracking pixels.
   */
  async clearRemoteImages(): Promise<void> {
    await atomically(this.db, (tx) =>
      (['user', 'org'] as const).map((kind) => {
        const { table, column, field } = this.ownerColumn(kind)
        const kept = [`${PATH_PREFIX}%`, 'data:%', ...PROVIDER_URL_PATTERNS]
        return tx
          .update(table)
          .set({ [field]: null })
          .where(
            and(
              sql`${column} is not null`,
              ...kept.map((pattern) => sql`${column} not like ${pattern}`),
            ),
          )
      }),
    )
  }
}
