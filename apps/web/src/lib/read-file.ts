// A picked logo or photo, made ready to upload: the API stores PNG, JPEG,
// WebP or GIF bytes only, sent as the request body. A photo is shrunk to
// WebP first; an SVG logo is drawn to a PNG, because an SVG on our own
// domain could run its scripts when opened directly. The type sent is the
// one the file's first bytes say, not its name's: the API refuses a body
// whose bytes don't match it, and a JPEG saved as `.png` is common.

/** The image types the API stores. */
export const STORED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** The largest logo the API keeps. */
export const LOGO_MAX_BYTES = 200 * 1024
export const LOGO_TOO_LARGE = 'Pick an image under 200 KB'
export const LOGO_WRONG_TYPE = 'Pick a PNG, JPG, SVG or WebP image'

/** The longest side of a logo drawn from an SVG, in pixels. */
export const LOGO_SIZE_PX = 256

/** The stored type `blob`'s first bytes say it is, or null when they are none of the four. */
export async function sniffImageType(blob: Blob): Promise<string | null> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const ascii = (at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length))
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif'
  return null
}

/** The file's bytes as a blob of the type they really are, or null when that is none of the four. */
async function asStoredType(file: Blob): Promise<Blob | null> {
  const type = await sniffImageType(file)
  if (!type) return null
  return type === file.type ? file : new Blob([file], { type })
}

/** A file or blob as a data URL: the preview shown before it is uploaded. */
export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function canDraw(): boolean {
  return typeof document !== 'undefined'
}

/** The canvas's pixels as `type`, or null where the browser can't encode them. */
function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** A canvas `width` × `height` with `draw` on it, or null without a 2D context. */
function drawn(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) return null
  draw(context)
  return canvas
}

/** An SVG file as an `<img>`, loaded from a blob: URL that is released once it has loaded. */
function loadSvg(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('We couldn’t read that SVG'))
    }
    image.src = url
  })
}

/** An SVG drawn at most `LOGO_SIZE_PX` on its longest side, as a PNG. */
export async function svgToPng(file: Blob): Promise<Blob> {
  if (!canDraw()) throw new Error('This browser can’t convert an SVG')
  const image = await loadSvg(file)
  // An SVG without its own size draws as a square.
  const width = image.naturalWidth || LOGO_SIZE_PX
  const height = image.naturalHeight || LOGO_SIZE_PX
  const scale = LOGO_SIZE_PX / Math.max(width, height)
  const canvas = drawn(width * scale, height * scale, (context) =>
    context.drawImage(image, 0, 0, width * scale, height * scale),
  )
  // A browser that taints the canvas for this SVG refuses to export it.
  const png = canvas && (await canvasBlob(canvas, 'image/png').catch(() => null))
  if (!png) throw new Error('This browser can’t convert that SVG. Pick a PNG instead.')
  return png
}

/**
 * A picked logo, ready to upload: a PNG, JPEG, WebP or GIF (by its bytes)
 * kept as it is if it fits, labelled with its real type; an SVG drawn to
 * a PNG; anything else refused.
 */
export async function readLogo(file: File): Promise<Blob> {
  const stored = await asStoredType(file)
  if (!stored && file.type !== 'image/svg+xml') throw new Error(LOGO_WRONG_TYPE)
  // A detailed SVG can draw to a PNG over the limit, so the result is checked too.
  const logo = stored ?? (await svgToPng(file))
  if (logo.size > LOGO_MAX_BYTES) throw new Error(LOGO_TOO_LARGE)
  return logo
}

/** The largest photo a person can pick; it is shrunk before it is saved. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const PHOTO_TOO_LARGE = 'Pick an image under 2 MB'

/** The longest side of a saved profile photo, in pixels. */
export const PHOTO_SIZE_PX = 256

/** The largest photo stored (as the API keeps it); a pick the browser can't shrink must fit as it is. */
export const PHOTO_STORED_MAX_BYTES = 512 * 1024
export const PHOTO_UNSHRUNK_TOO_LARGE =
  'This browser can’t shrink that image. Pick one under 512 KB, or a PNG or JPEG.'

/**
 * The image drawn at most `size` px on its longest side, as WebP (or PNG
 * where the browser has no WebP encoder). Null where the browser can't
 * decode or draw it.
 */
async function shrinkImage(file: File, size: number): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || !canDraw()) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
  const canvas = drawn(bitmap.width * scale, bitmap.height * scale, (context) =>
    context.drawImage(bitmap, 0, 0, bitmap.width * scale, bitmap.height * scale),
  )
  bitmap.close()
  const blob = canvas && (await canvasBlob(canvas, 'image/webp', 0.9))
  return blob && STORED_IMAGE_TYPES.includes(blob.type) ? blob : null
}

/**
 * A picked profile photo, ready to upload: refused over `PHOTO_MAX_BYTES`
 * before reading, then shrunk to `PHOTO_SIZE_PX` so what is stored is
 * small. Where it can't be shrunk, it is kept as it is only if its bytes
 * are a type the API stores (labelled with that type) and it fits.
 */
export async function readPhoto(file: File): Promise<Blob> {
  if (file.size > PHOTO_MAX_BYTES) throw new Error(PHOTO_TOO_LARGE)
  const shrunk = await shrinkImage(file, PHOTO_SIZE_PX)
  if (shrunk) return shrunk
  const stored = file.size <= PHOTO_STORED_MAX_BYTES ? await asStoredType(file) : null
  if (!stored) throw new Error(PHOTO_UNSHRUNK_TOO_LARGE)
  return stored
}
