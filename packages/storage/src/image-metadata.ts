import type { ImageType } from './image-store.js'
import { orientationApp1, orientationTiff, readOrientation } from './exif-orientation.js'

// A camera writes where and when a photo was taken, and with what, into the
// file: EXIF (with GPS), XMP, comments. Served as uploaded, anyone with an
// image's link could read them. This drops those parts of the file and
// keeps the pixels, which a Worker can't decode and re-encode. Only what
// draws the image survives: the frames, and what changes how they look —
// the colour profile (ICC), the looping, and the EXIF orientation, written
// back as an EXIF block of that one tag. PNG and WebP keep a list of known
// chunks, so a chunk added by some other tool goes too. Bytes after the format's end marker go
// too — a phone's motion photo puts a whole video there. A file it can't
// walk to the end is kept from that point as it is: `checkImage` has
// already refused anything that isn't one of the four types.

function be16(b: Uint8Array, at: number): number {
  return (b[at]! << 8) | b[at + 1]!
}

function be32(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0
}

function le32(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0
}

function ascii(b: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...b.subarray(at, at + length))
}

function le32Bytes(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

function be32Bytes(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** APP2 carrying an ICC profile: it sets the colours, so it stays. */
function iccSegment(b: Uint8Array, at: number): boolean {
  return ascii(b, at + 4, 12) === 'ICC_PROFILE\0'
}

/** APP14 "Adobe": says how CMYK and YCCK frames decode, so it stays. */
function adobeSegment(b: Uint8Array, at: number): boolean {
  return ascii(b, at + 4, 5) === 'Adobe'
}

/** Where the entropy-coded data from `at` ends: the next marker, or the end of the file. */
function scanEnd(b: Uint8Array, at: number): number {
  // In the data a 0xFF is a stuffed byte (FF 00), a restart marker (FF D0–D7),
  // or fill before a marker; anything else after it starts the next segment.
  let n = at
  while (n + 1 < b.length) {
    const next = b[n + 1]!
    if (b[n] !== 0xff) n += 1
    else if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) n += 2
    else if (next === 0xff) n += 1
    else return n
  }
  return b.length
}

function droppedSegment(b: Uint8Array, at: number, marker: number): boolean {
  if (marker === 0xfe) return true
  if (marker < 0xe1 || marker > 0xef) return false
  return !(marker === 0xe2 && iccSegment(b, at)) && !(marker === 0xee && adobeSegment(b, at))
}

/** An APP1 holding EXIF (not XMP, which is APP1 too). */
function exifSegment(b: Uint8Array, at: number, marker: number): boolean {
  return marker === 0xe1 && ascii(b, at + 4, 6) === 'Exif\0\0'
}

function jpeg(b: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [b.subarray(0, 2)]
  let oriented = false
  let at = 2
  while (at + 1 < b.length) {
    if (b[at] !== 0xff) break
    const marker = b[at + 1]!
    if (marker === 0xff) {
      at += 1
      continue
    }
    if (marker === 0xd9) {
      kept.push(b.subarray(at, at + 2))
      return concat(kept)
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(b.subarray(at, at + 2))
      at += 2
      continue
    }
    if (at + 3 >= b.length) break
    const end = at + 2 + be16(b, at + 2)
    if (end > b.length) break
    if (!droppedSegment(b, at, marker)) {
      kept.push(b.subarray(at, end))
    } else if (!oriented && exifSegment(b, at, marker)) {
      oriented = true
      const orientation = readOrientation(b.subarray(at + 4, end))
      if (orientation) kept.push(orientationApp1(orientation))
    }
    at = end
    if (marker === 0xda) {
      // A scan: its image data runs to the next marker (another scan's
      // tables, in a progressive JPEG, or the end).
      const data = scanEnd(b, at)
      kept.push(b.subarray(at, data))
      at = data
    }
  }
  kept.push(b.subarray(at))
  return concat(kept)
}

/**
 * The PNG chunks kept: the critical ones, and those that change how the
 * image or its animation draws. `eXIf` is rewritten to its orientation.
 */
// prettier-ignore
const PNG_KEPT = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND',
  'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP', 'mDCv', 'cLLi', 'sBIT', 'pHYs', 'bKGD',
  'acTL', 'fcTL', 'fdAT',
])

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)).concat([...data]))
  return new Uint8Array([...be32Bytes(data.length), ...typed, ...be32Bytes(crc32(typed))])
}

function png(b: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [b.subarray(0, 8)]
  let oriented = false
  let at = 8
  while (at + 12 <= b.length) {
    const type = ascii(b, at + 4, 4)
    const end = at + 12 + be32(b, at)
    if (end > b.length) break
    if (PNG_KEPT.has(type)) {
      kept.push(b.subarray(at, end))
    } else if (type === 'eXIf' && !oriented) {
      // Only the first: any more are dropped, so rewriting can't add up.
      oriented = true
      const orientation = readOrientation(b.subarray(at + 8, end - 4))
      if (orientation) kept.push(pngChunk('eXIf', orientationTiff(orientation)))
    }
    at = end
    if (type === 'IEND') return concat(kept)
  }
  kept.push(b.subarray(at))
  return concat(kept)
}

/** The WebP chunks kept: the frames, alpha, animation and colour profile. `EXIF` is rewritten. */
const WEBP_KEPT = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'])
/** The VP8X flags that say an EXIF or XMP chunk follows. */
const VP8X_EXIF = 0x08
const VP8X_XMP = 0x04

function webp(b: Uint8Array): Uint8Array {
  // The RIFF header (rewritten below with the new size), then chunks, each
  // padded to an even length.
  const riffEnd = Math.min(b.length, 8 + le32(b, 4))
  const kept: Uint8Array[] = [b.slice(0, 12)]
  let vp8x: Uint8Array | null = null
  let exif: Uint8Array | null = null
  let at = 12
  while (at + 8 <= riffEnd) {
    const type = ascii(b, at, 4)
    const size = le32(b, at + 4)
    const end = Math.min(riffEnd, at + 8 + size + (size & 1))
    if (at + 8 + size > riffEnd) break
    if (type === 'VP8X') {
      vp8x = b.slice(at, end)
      vp8x[8] = vp8x[8]! & ~(VP8X_EXIF | VP8X_XMP)
      kept.push(vp8x)
    } else if (WEBP_KEPT.has(type)) {
      kept.push(b.subarray(at, end))
    } else if (type === 'EXIF' && vp8x && !exif) {
      const orientation = readOrientation(b.subarray(at + 8, at + 8 + size))
      if (orientation) exif = orientationTiff(orientation)
    }
    at = end
  }
  // A chunk that runs past the RIFF size: the rest is kept as it is, to the
  // end of the file, as for the other formats. Past a whole RIFF, nothing is.
  if (at < riffEnd) kept.push(b.subarray(at))
  if (vp8x && exif) {
    // EXIF goes after the image data, which is where it was.
    vp8x[8] = vp8x[8]! | VP8X_EXIF
    kept.push(
      new Uint8Array(
        [...'EXIF'].map((ch) => ch.charCodeAt(0)).concat(le32Bytes(exif.length), [...exif]),
      ),
    )
  }
  const out = concat(kept)
  const size = out.length - 8
  out.set(le32Bytes(size), 4)
  return out
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

/** The application extensions kept: an animation's looping, and the colour profile. */
const GIF_KEPT = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0', 'ICCRGBG1012'])

function keptExtension(b: Uint8Array, at: number): boolean {
  return b[at + 2] === 11 && GIF_KEPT.has(ascii(b, at + 3, 11))
}

function gif(b: Uint8Array): Uint8Array {
  const packed = b[10]!
  let at = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
  const kept: Uint8Array[] = [b.subarray(0, at)]
  while (at < b.length) {
    const block = b[at]!
    if (block === 0x3b) {
      kept.push(b.subarray(at, at + 1))
      return concat(kept)
    }
    let end: number
    let dropped = false
    if (block === 0x21) {
      const label = b[at + 1]
      end = skipSubBlocks(b, at + 2)
      dropped = label === 0xfe || (label === 0xff && !keptExtension(b, at))
    } else if (block === 0x2c && at + 10 <= b.length) {
      const local = b[at + 9]!
      end = skipSubBlocks(b, at + 11 + (local & 0x80 ? 3 * 2 ** ((local & 7) + 1) : 0))
    } else {
      break
    }
    if (end < 0) break
    if (!dropped) kept.push(b.subarray(at, end))
    at = end
  }
  kept.push(b.subarray(at))
  return concat(kept)
}

/**
 * `bytes` without the metadata its format carries: EXIF (all but the
 * orientation), XMP and comments in a JPEG, its ICC profile kept; every
 * PNG and WebP chunk but those that draw the image; comments and
 * application extensions in a GIF, its looping and ICC profile kept.
 * `type` is the one `checkImage` detected.
 */
export function stripImageMetadata(bytes: Uint8Array, type: ImageType): Uint8Array {
  switch (type) {
    case 'image/jpeg':
      return jpeg(bytes)
    case 'image/png':
      return png(bytes)
    case 'image/webp':
      return webp(bytes)
    case 'image/gif':
      return gif(bytes)
  }
}
