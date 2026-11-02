// Where uploaded images' bytes live. The rows that say whose an image is —
// the `image` table — are the database's whichever store holds the bytes;
// a store only keeps bytes by id. The entry points pick one.

/** One of the four types the server stores, as detected from the bytes. */
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface ImageStore {
  /**
   * `database` keeps the bytes in the image row's own `data` column, so the
   * row and its bytes are written, read and deleted together; `bucket` keeps
   * them in object storage, beside the row.
   */
  readonly kind: 'database' | 'bucket'
  put(id: string, bytes: Uint8Array, type: ImageType): Promise<void>
  /** The bytes, or null when the store has none by that id. */
  get(id: string): Promise<Uint8Array | null>
  /** Deletes what the store holds for these ids; an id it doesn't hold is no error. */
  delete(ids: string[]): Promise<void>
}

const ID_PREFIX = 'img_'
const ID_PATTERN = /^img_[0-9a-f]{32}$/
const PATH_PREFIX = '/api/images/'

/** A new image id: `img_` and 128 random bits, never derived from the content. */
export function newImageId(): string {
  const bits = crypto.getRandomValues(new Uint8Array(16))
  return ID_PREFIX + Array.from(bits, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isImageId(value: string): boolean {
  return ID_PATTERN.test(value)
}

/** What a user's `image` or an organization's `logo` holds for a stored image. */
export function imagePath(id: string): string {
  return PATH_PREFIX + id
}

/** The image id a stored path names, or null for anything else (a provider's URL). */
export function imageIdOfPath(value: string | null | undefined): string | null {
  if (!value?.startsWith(PATH_PREFIX)) return null
  const id = value.slice(PATH_PREFIX.length)
  return isImageId(id) ? id : null
}
