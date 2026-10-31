/** The largest logo or photo the dashboard keeps (inline, as a data URL). */
export const IMAGE_MAX_BYTES = 200 * 1024
export const IMAGE_TOO_LARGE = 'Pick an image under 200 KB'

/** A picked file as a data URL, for an uploaded logo or photo kept in the dummy data. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * A picked logo or photo as a data URL. Refuses one over `IMAGE_MAX_BYTES`
 * before reading it, so a large file is never encoded only to be turned away.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  if (file.size > IMAGE_MAX_BYTES) return Promise.reject(new Error(IMAGE_TOO_LARGE))
  return readAsDataUrl(file)
}

/** The largest photo a person can pick; it is shrunk before it is saved. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const PHOTO_TOO_LARGE = 'Pick an image under 2 MB'

/** The longest side of a saved profile photo, in pixels. */
export const PHOTO_SIZE_PX = 256

/**
 * The image drawn at most `size` px on its longest side, as a WebP data URL:
 * the photo rides along with every session read, so it is kept small. Null
 * where the browser can't decode or draw it (the original is used then).
 */
async function shrinkImage(file: File, size: number): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const url = canvas.toDataURL('image/webp', 0.9)
  // A browser without WebP encoding answers PNG, which is still an image.
  return url.startsWith('data:image/') ? url : null
}

/** The largest photo stored (as the API keeps it); a pick the browser can't shrink must fit as it is. */
export const PHOTO_STORED_MAX_BYTES = 512 * 1024
export const PHOTO_UNSHRUNK_TOO_LARGE =
  'This browser can’t shrink that image. Pick one under 512 KB, or a PNG or JPEG.'

/**
 * A picked profile photo as a data URL: refused over `PHOTO_MAX_BYTES`
 * before reading, then shrunk to `PHOTO_SIZE_PX` so what is stored is small.
 * Where it can't be shrunk, it is kept as it is only if it fits.
 */
export async function readPhotoAsDataUrl(file: File): Promise<string> {
  if (file.size > PHOTO_MAX_BYTES) throw new Error(PHOTO_TOO_LARGE)
  const shrunk = await shrinkImage(file, PHOTO_SIZE_PX)
  if (shrunk) return shrunk
  if (file.size > PHOTO_STORED_MAX_BYTES) throw new Error(PHOTO_UNSHRUNK_TOO_LARGE)
  return readAsDataUrl(file)
}
