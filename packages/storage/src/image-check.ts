import type { ImageType } from './image-store.js'

// What the server stores is decided from the bytes alone: the file
// signature (magic bytes) says the type, and the header says the size in
// pixels. A body without one of the four signatures — SVG, HTML, a polyglot
// that only starts with something else — is never stored, whatever type the
// request claimed.

export interface ImageRule {
  /** "photo", "logo": how a refusal names it. */
  what: string
  maxBytes: number
}

/** The longest side any stored image may have, in pixels. */
export const MAX_IMAGE_SIDE = 4096

/** A profile photo: the browser shrinks a pick to 256 px first. */
export const PHOTO_RULE: ImageRule = { what: 'photo', maxBytes: 512 * 1024 }

/** An organization logo: a picked SVG is drawn to a PNG in the browser before upload. */
export const LOGO_RULE: ImageRule = { what: 'logo', maxBytes: 200 * 1024 }

export interface ImageInfo {
  type: ImageType
  width: number
  height: number
}

const TYPE_NAMES = 'a PNG, JPEG, WebP or GIF image'

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
  return signature.every((b, i) => bytes[at + i] === b)
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length))
}

function be16(b: Uint8Array, at: number): number {
  return (b[at]! << 8) | b[at + 1]!
}

function be32(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0
}

function le16(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8)
}

function le24(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16)
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function png(b: Uint8Array): ImageInfo | null {
  // The first chunk is always IHDR: length 13, then width and height.
  if (b.length < 24 || !startsWith(b, PNG) || ascii(b, 12, 4) !== 'IHDR') return null
  if (be32(b, 8) !== 13) return null
  return { type: 'image/png', width: be32(b, 16), height: be32(b, 20) }
}

/** Past a run of GIF data sub-blocks (a size byte, that many bytes, until a 0), or -1. */
function skipSubBlocks(b: Uint8Array, at: number): number {
  while (at < b.length) {
    const size = b[at]!
    if (size === 0) return at + 1
    at += 1 + size
  }
  return -1
}

function gif(b: Uint8Array): ImageInfo | null {
  const signature = ascii(b, 0, 6)
  if (b.length < 13 || (signature !== 'GIF87a' && signature !== 'GIF89a')) return null
  const width = le16(b, 6)
  const height = le16(b, 8)
  // Every frame must sit inside the screen the header declares: browsers
  // widen the image to a larger frame, which would slip past the size limit.
  const packed = b[10]!
  let at = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
  while (at < b.length) {
    const block = b[at]!
    if (block === 0x3b) return { type: 'image/gif', width, height }
    if (block === 0x21) {
      at = skipSubBlocks(b, at + 2)
    } else if (block === 0x2c) {
      if (at + 10 > b.length) return null
      const [left, top, frameWidth, frameHeight] = [1, 3, 5, 7].map((n) => le16(b, at + n))
      if (left! + frameWidth! > width || top! + frameHeight! > height) return null
      const local = b[at + 9]!
      at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 7) + 1) : 0)
      // The LZW minimum code size, then the image data.
      at = skipSubBlocks(b, at + 1)
    } else {
      return null
    }
    if (at < 0) return null
  }
  // No trailer: a truncated file browsers still draw; its frames were all checked.
  return { type: 'image/gif', width, height }
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  const type = 'image/webp' as const
  if (chunk === 'VP8 ') {
    // A lossy key frame: the start code, then 14-bit width and height.
    if (!startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null
    return { type, width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    // Lossless: a signature byte, then width-1 and height-1 in 14 bits each.
    if (b[20] !== 0x2f) return null
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return { type, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    // Extended: the canvas size, each 24 bits holding the side minus one.
    return { type, width: le24(b, 24) + 1, height: le24(b, 27) + 1 }
  }
  return null
}

// The markers with no length after them: TEM and the restart markers.
function standalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
}

// A start-of-frame: C0–CF but for DHT (C4), JPG (C8) and DAC (CC).
function startOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (!startsWith(b, [0xff, 0xd8, 0xff])) return null
  // Walk the segments to the first frame header, which holds the size.
  let at = 2
  while (at + 3 < b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1]!
    if (marker === 0xff) {
      at += 1
      continue
    }
    if (standalone(marker)) {
      at += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = be16(b, at + 2)
    if (length < 2) return null
    if (startOfFrame(marker)) {
      if (at + 9 > b.length) return null
      return { type: 'image/jpeg', height: be16(b, at + 5), width: be16(b, at + 7) }
    }
    at += 2 + length
  }
  return null
}

/** The type and size the bytes themselves say, or null when they are none of the four. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? gif(bytes)
}

export type ImageCheck = { ok: true; info: ImageInfo } | { ok: false; problem: string }

/**
 * Whether `bytes` may be stored under `rule`. `claimedType` is the request's
 * `Content-Type`: a body whose signature says otherwise is refused, and the
 * stored type is always the detected one.
 */
export function checkImage(bytes: Uint8Array, rule: ImageRule, claimedType?: string): ImageCheck {
  const refuse = (problem: string): ImageCheck => ({ ok: false, problem })
  if (bytes.length === 0) return refuse(`The ${rule.what} is empty`)
  if (bytes.length > rule.maxBytes) {
    return refuse(`The ${rule.what} must be at most ${Math.round(rule.maxBytes / 1024)} KB`)
  }
  const info = inspectImage(bytes)
  if (!info) return refuse(`The ${rule.what} must be ${TYPE_NAMES}`)
  const claimed = claimedType?.split(';')[0]?.trim().toLowerCase()
  if (claimed && claimed !== info.type) {
    return refuse(`The ${rule.what}'s content isn't the ${claimed} it was sent as`)
  }
  if (info.width < 1 || info.height < 1) return refuse(`The ${rule.what} has no size`)
  if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
    return refuse(`The ${rule.what} must be at most ${MAX_IMAGE_SIDE} px on each side`)
  }
  return { ok: true, info }
}
