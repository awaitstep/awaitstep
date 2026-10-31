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
  'image/gif': 'GIF',
}
// Base64 grows a file by 4/3; a little more for the prefix.
const BASE64_GROWTH = 1.37

/** As the API's check: the types the picker offers, and the stored size (`maxBytes`). */
export function assertImage(value: string, types: string[], field: string, maxBytes: number): void {
  const type = PREFIX.exec(value)?.[1]
  if (!type || !types.includes(type)) {
    const names = types.map((t) => LABEL[t] ?? t)
    const list =
      names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
    throw invalidError(`Pick a ${list} image`, field)
  }
  if (value.length > maxBytes * BASE64_GROWTH) {
    throw invalidError(`Pick an image under ${Math.round(maxBytes / 1024)} KB`, field)
  }
}
