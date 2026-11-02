import type { DatabaseAdapter, ImageInsert, ImageOwner, InlineImageRow } from '@awaitstep/db'
import {
  LOGO_RULE,
  PHOTO_RULE,
  checkImage,
  newImageId,
  type ImageInfo,
  type ImageStore,
} from '@awaitstep/storage'

// Before the image store, photos and logos sat in their owner's column as
// `data:` URLs, and older ones as remote URLs. This moves them out, once:
// each inline image that passes the upload rules becomes a stored image,
// one that doesn't (an SVG logo) is cleared, and every remote URL but a
// GitHub or Google avatar is cleared. It runs with the maintenance jobs, so
// every entry point — the Worker has no start-up — does it, and it finds
// nothing to do after the first run.

// Small: on D1 one batch is read and written in single round trips.
const BATCH = 10
/** A stop for a store that keeps failing: the next tick carries on. */
const MAX_BATCHES = 40

const DATA_URL = /^data:([^;,]*)(;base64)?,(.*)$/s

function decodeDataUrl(value: string): Uint8Array | null {
  const match = DATA_URL.exec(value)
  if (!match?.[2]) return null
  try {
    return Uint8Array.from(atob(match[3]!), (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

interface Checked {
  owner: ImageOwner
  bytes: Uint8Array
  info: ImageInfo
}

/** Whether the inline value can be stored under its owner's rule. The claimed type is ignored. */
function checkInline(row: InlineImageRow): Checked | null {
  const bytes = decodeDataUrl(row.value)
  if (!bytes) return null
  const check = checkImage(bytes, row.ownerKind === 'user' ? PHOTO_RULE : LOGO_RULE)
  return check.ok
    ? { owner: { kind: row.ownerKind, id: row.ownerId }, bytes, info: check.info }
    : null
}

/**
 * Moves inline images into the store and clears the rest. Rows go in
 * before their bytes; an owner who uploaded meanwhile keeps the upload,
 * and the row made for their old image is the reaper's.
 */
export async function migrateInlineImages(
  db: DatabaseAdapter,
  store: ImageStore,
  now = new Date(),
): Promise<void> {
  await db.clearRemoteImages()
  const inRow = store.kind === 'database'
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await db.listInlineImages(BATCH)
    if (rows.length === 0) return
    const checked = rows.map(checkInline)
    const cleared = rows
      .filter((_, i) => !checked[i])
      .map((row): ImageOwner => ({ kind: row.ownerKind, id: row.ownerId }))
    const moved = checked
      .filter((c): c is Checked => c !== null)
      .map((c) => ({ ...c, imageId: newImageId() }))
    await db.insertImages(
      moved.map((m): ImageInsert => ({
        id: m.imageId,
        ownerKind: m.owner.kind,
        ownerId: m.owner.id,
        contentType: m.info.type,
        bytesLen: m.bytes.length,
        width: m.info.width,
        height: m.info.height,
        createdAt: now.toISOString(),
        data: inRow ? m.bytes : null,
      })),
    )
    if (!inRow) await Promise.all(moved.map((m) => store.put(m.imageId, m.bytes, m.info.type)))
    await db.replaceInlineImages(
      moved.map((m) => ({ owner: m.owner, imageId: m.imageId })),
      cleared,
    )
    if (!inRow) {
      // An upload's cleanup may have taken a row before its bytes went in:
      // those bytes are nobody's, and the owner keeps its data URL for next time.
      const ids = moved.map((m) => m.imageId)
      const kept = new Set(await db.existingImages(ids))
      await store.delete(ids.filter((id) => !kept.has(id)))
    }
  }
}
