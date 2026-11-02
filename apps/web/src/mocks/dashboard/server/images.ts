import { invalidError } from '../scenario'

// An uploaded logo or photo arrives as a data URL read from the picked
// blob, as the API takes the bytes: a PNG, JPEG, WebP or GIF (an SVG logo
// is drawn to a PNG in the browser first), and a stored size. Thin: the
// type is the blob's own, not read from its bytes as the API does.

const PREFIX = /^data:(image\/[a-z+]+);base64,/
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
// Base64 grows a file by 4/3; a little more for the prefix.
const BASE64_GROWTH = 1.37

/** As the API's check: one of the four stored types, and the stored size (`maxBytes`). */
export function assertImage(value: string, field: string, maxBytes: number): void {
  const type = PREFIX.exec(value)?.[1]
  if (!type || !TYPES.includes(type))
    throw invalidError('Pick a PNG, JPG, WebP or GIF image', field)
  if (value.length > maxBytes * BASE64_GROWTH) {
    throw invalidError(`Pick an image under ${Math.round(maxBytes / 1024)} KB`, field)
  }
}
