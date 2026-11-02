import type { DatabaseAdapter, ImageOwner } from '@awaitstep/db'
import { imagePath, newImageId, type ImageInfo, type ImageStore } from '@awaitstep/storage'
import { createLogger } from './logger.js'

// Images people upload — a profile photo, an organization logo. The
// owner's column holds `/api/images/<id>`, the `image` row says whose it
// is, and the store the entry point chose holds the bytes. Every write
// keeps one rule: bytes never exist without a row to track them. So a row
// goes in before its bytes, and bytes go before their row — once the row
// is claimed, so that no owner can be pointed at it in between.

const log = createLogger('images')

/** Why an upload was not saved: another upload or removal got there first. */
export const IMAGE_RACE = 'Another change to this image landed first. Try again.'

/** Unreferenced rows younger than this may be an upload still in flight. */
export const UNREFERENCED_GRACE_MS = 60 * 60 * 1000
/** How many unreferenced images one sweep removes. */
const SWEEP_BATCH = 100

/** The database store: the bytes live in the image row's own `data` column. */
export function databaseImageStore(db: DatabaseAdapter): ImageStore {
  return {
    kind: 'database',
    put: (id, bytes) => db.setImageData(id, bytes),
    get: (id) => db.getImageData(id),
    // Deleting the row (`deleteImages`) takes its bytes with it.
    delete: async () => {},
  }
}

/**
 * Deletes images nobody names: claims their rows (so no owner can be
 * pointed at one again), deletes their bytes, then the rows. A row an
 * owner names by now is left alone. Failures are logged, and the reaper
 * finds whatever is left.
 */
export async function discardImages(
  db: DatabaseAdapter,
  store: ImageStore,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  try {
    const claimed = await db.claimImages(ids, new Date().toISOString())
    if (claimed.length === 0) return
    await store.delete(claimed)
    await db.deleteImages(claimed)
  } catch (err) {
    log.error('Failed to delete images; the reaper will retry', {
      count: ids.length,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Every image of an owner that is gone: called once an account or organization is deleted. */
export async function discardOwnerImages(
  db: DatabaseAdapter,
  store: ImageStore,
  owner: ImageOwner,
): Promise<void> {
  try {
    await discardImages(db, store, await db.listOwnerImages(owner))
  } catch (err) {
    log.error('Failed to list a deleted owner’s images; the reaper will remove them', {
      kind: owner.kind,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Stores checked bytes as the owner's image and points the owner at it:
 * the row (with the bytes, for the database store), then the bucket
 * object, then the owner's column. The images it replaced are deleted
 * after. Null when another upload or removal claimed the new row first,
 * or the owner is gone.
 */
export async function saveOwnerImage(
  db: DatabaseAdapter,
  store: ImageStore,
  owner: ImageOwner,
  bytes: Uint8Array,
  info: ImageInfo,
): Promise<string | null> {
  const id = newImageId()
  const inRow = store.kind === 'database'
  await db.insertImage({
    id,
    ownerKind: owner.kind,
    ownerId: owner.id,
    contentType: info.type,
    bytesLen: bytes.length,
    width: info.width,
    height: info.height,
    createdAt: new Date().toISOString(),
    data: inRow ? bytes : null,
  })
  // A failed put leaves a row nothing names: the reaper removes it.
  if (!inRow) await store.put(id, bytes, info.type)
  const { set, others } = await db.setOwnerImage(owner, id)
  if (!set) {
    // Nobody else can name this id: its bytes go even when another
    // request's cleanup already took its row.
    await store.delete([id])
    await discardImages(db, store, [id])
    return null
  }
  await discardImages(db, store, others)
  return imagePath(id)
}

/** Clears the owner's image and deletes every image it had stored. */
export async function clearOwnerImage(
  db: DatabaseAdapter,
  store: ImageStore,
  owner: ImageOwner,
): Promise<void> {
  await discardImages(db, store, await db.clearOwnerImage(owner))
}

/** The bytes to serve for an image row: the row's own, else the bucket's. */
export async function imageBytes(
  store: ImageStore,
  id: string,
  inRow: Uint8Array | null,
): Promise<Uint8Array | null> {
  return inRow ?? (store.kind === 'bucket' ? store.get(id) : null)
}

/** The reaper's part: images nobody has named for an hour, with their bytes. */
export async function sweepUnreferencedImages(
  db: DatabaseAdapter,
  store: ImageStore,
  now: Date,
): Promise<void> {
  const before = new Date(now.getTime() - UNREFERENCED_GRACE_MS).toISOString()
  const claimed = await db.claimImages(
    await db.listUnreferencedImages(before, SWEEP_BATCH),
    now.toISOString(),
  )
  if (claimed.length === 0) return
  await store.delete(claimed)
  await db.deleteImages(claimed)
}
