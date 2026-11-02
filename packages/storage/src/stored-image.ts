import { checkImage, type ImageCheck, type ImageInfo, type ImageRule } from './image-check.js'
import { stripImageMetadata } from './image-metadata.js'

// What goes into the store is checked twice: the bytes as sent, and the
// bytes after their metadata is stripped. A damaged file can walk
// differently from how it was checked — a WebP whose RIFF size cuts its
// frame off, a PNG of many tiny EXIF chunks that each come out longer — so
// the stripped bytes must pass the same rule and read as the same image.

export type StoredImage =
  { ok: true; bytes: Uint8Array; info: ImageInfo } | { ok: false; problem: string }

/**
 * `bytes` as they would be stored under `rule`: checked (`checkImage`),
 * stripped of their metadata (`stripImageMetadata`), and checked again.
 */
export function prepareImage(
  bytes: Uint8Array,
  rule: ImageRule,
  claimedType?: string,
): StoredImage {
  const check: ImageCheck = checkImage(bytes, rule, claimedType)
  if (!check.ok) return check
  const stripped = stripImageMetadata(bytes, check.info.type)
  const again = checkImage(stripped, rule)
  if (
    !again.ok ||
    again.info.type !== check.info.type ||
    again.info.width !== check.info.width ||
    again.info.height !== check.info.height
  ) {
    return { ok: false, problem: `The ${rule.what} is damaged and can’t be stored` }
  }
  return { ok: true, bytes: stripped, info: check.info }
}
