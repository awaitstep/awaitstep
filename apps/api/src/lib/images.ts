// Images people upload — a profile photo, an organization logo — are kept as
// data URLs on their row and shown wherever the person or org appears. The
// row is read on every page, so what is stored is checked here: an image
// type the dashboard's picker offers, and a size.

export interface ImageRule {
  /** "photo", "logo": how the refusal names it. */
  what: string
  maxBytes: number
  /** MIME subtypes after `image/`, with their names for the refusal. */
  types: Record<string, string>
}

/** A profile photo: the browser shrinks a pick (up to 2 MB) to 256 px first. */
export const PHOTO_RULE: ImageRule = {
  what: 'photo',
  maxBytes: 512 * 1024,
  types: { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', gif: 'GIF' },
}

/** An organization logo (P5): an SVG is drawn only as an `<img>`, where its scripts never run. */
export const LOGO_RULE: ImageRule = {
  what: 'logo',
  maxBytes: 200 * 1024,
  types: { png: 'PNG', jpeg: 'JPEG', 'svg+xml': 'SVG', webp: 'WebP' },
}

const DATA_URL = /^data:image\/([a-z+]+);base64,([A-Za-z0-9+/]+={0,2})$/

/** The decoded size of a base64 payload, without decoding it. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function names(rule: ImageRule): string {
  const all = Object.values(rule.types)
  return `${all.slice(0, -1).join(', ')} or ${all.at(-1)}`
}

/**
 * Why `value` can't be stored as an uploaded image, or null when it can.
 * Null and the empty string clear the image.
 */
export function uploadedImageProblem(value: unknown, rule: ImageRule): string | null {
  if (value === null || value === '') return null
  const match = typeof value === 'string' ? DATA_URL.exec(value) : null
  if (!match || !Object.hasOwn(rule.types, match[1]!)) {
    return `The ${rule.what} must be a ${names(rule)} image`
  }
  if (decodedBytes(match[2]!) > rule.maxBytes) {
    return `The ${rule.what} must be at most ${Math.round(rule.maxBytes / 1024)} KB`
  }
  return null
}
