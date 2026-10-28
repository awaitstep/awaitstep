import { IMAGE_MAX_BYTES, IMAGE_TOO_LARGE } from '../../../lib/read-file'
import { invalidError } from '../scenario'

// An uploaded logo or photo arrives as a data URL. The file picker's `accept`
// is only a hint, so the type is checked here too: anything else would show
// as a broken image wherever the logo or avatar is drawn.

const PREFIX = /^data:(image\/[a-z+]+);base64,/
const LABEL: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/svg+xml': 'SVG',
  'image/webp': 'WebP',
}
// Base64 grows a file by 4/3; a little more for the prefix.
const BASE64_GROWTH = 1.37

export function assertImage(value: string, types: string[], field: string): void {
  const type = PREFIX.exec(value)?.[1]
  if (!type || !types.includes(type)) {
    const names = types.map((t) => LABEL[t] ?? t)
    const list =
      names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
    throw invalidError(`Pick a ${list} image`, field)
  }
  if (value.length > IMAGE_MAX_BYTES * BASE64_GROWTH) throw invalidError(IMAGE_TOO_LARGE, field)
}
