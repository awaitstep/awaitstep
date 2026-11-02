import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { inspectImage } from '../image-check.js'
import { stripImageMetadata } from '../image-metadata.js'
import type { ImageType } from '../image-store.js'
import { orientationTiff, readOrientation } from '../exif-orientation.js'

// The `exif.*` fixtures carry what a camera writes: EXIF with GPS
// (51°30′ N, made by "SecretCam"), XMP with the same, a comment, and for
// the JPEG an ICC profile and bytes after its end marker. Each was built
// from an ImageMagick or `tiny.*` image and reads back in ImageMagick with
// its GPS tags. The `rotated.*` ones hold little-endian EXIF with
// Orientation 6 (stored rotated, shown turned 90°), Make and GPS.
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
}

function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1')
}

/** What a camera leaves that must never be served. */
const LEAKS = ['Exif\0', 'SecretCam', '51.5N', 'xmpmeta', 'TRAILER']

function strip(name: string): { before: Uint8Array; after: Uint8Array } {
  const before = fixture(name)
  const info = inspectImage(before)!
  return { before, after: stripImageMetadata(before, info.type) }
}

describe('stripImageMetadata', () => {
  it.each(['exif.jpg', 'exif.png', 'exif.webp', 'exif.gif'])(
    'drops the location, camera and comments from %s and keeps its type and size',
    (name) => {
      const { before, after } = strip(name)
      expect(text(before)).toContain('xmpmeta')
      for (const leak of LEAKS) expect(text(after)).not.toContain(leak)
      expect(inspectImage(after)).toEqual(inspectImage(before))
      expect(after.length).toBeLessThan(before.length)
    },
  )

  it.each(['exif.jpg', 'exif.png', 'exif.webp', 'exif.gif', 'tiny.jpg'])(
    'leaves nothing more to drop from %s once stripped',
    (name) => {
      const { after } = strip(name)
      expect(stripImageMetadata(after, inspectImage(after)!.type)).toEqual(after)
    },
  )

  it.each([
    ['tiny.png', 'image/png'],
    ['tiny.gif', 'image/gif'],
    ['lossy.webp', 'image/webp'],
    ['lossless.webp', 'image/webp'],
    ['extended.webp', 'image/webp'],
  ])('keeps %s, which carries no metadata, byte for byte', (name, type) => {
    const bytes = fixture(name)
    expect(stripImageMetadata(bytes, type as ImageType)).toEqual(bytes)
  })

  it('keeps a JPEG’s colour profile and frame, and ends it at its end marker', () => {
    const { after } = strip('exif.jpg')
    expect(text(after)).toContain('ICC_PROFILE\0')
    expect(text(after)).toContain('JFIF\0')
    expect([...after.subarray(-2)]).toEqual([0xff, 0xd9])
  })

  it('drops the EXIF a JPEG converted by macOS carries', () => {
    const { before, after } = strip('tiny.jpg')
    expect(text(before)).toContain('Exif\0')
    expect(text(after)).not.toContain('Exif\0')
  })

  it('keeps a JPEG’s image data whole, though it holds bytes that look like markers', () => {
    // SOI, a quantisation table holding FF D9, a frame, a scan with a
    // stuffed byte and a restart marker in its data, a comment, the end.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xdb, 0x00, 0x06, 0x00, 0xff, 0xd9, 0x01, 0xff, 0xc0, 0x00, 0x0b, 0x08,
      0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
      0x00, 0x3f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xfe, 0x00, 0x04, 0x68,
      0x69, 0xff, 0xd9,
    ])
    const stripped = stripImageMetadata(jpeg, 'image/jpeg')
    expect([...stripped]).toEqual([...jpeg.subarray(0, 40), 0xff, 0xd9])
  })

  it('drops every text chunk from a PNG, keeping each chunk it keeps whole', () => {
    const { after } = strip('exif.png')
    const types: string[] = []
    for (let at = 8; at < after.length;) {
      const length = new DataView(after.buffer, after.byteOffset).getUint32(at)
      types.push(text(after.subarray(at + 4, at + 8)))
      at += 12 + length
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('fixes a WebP’s RIFF size and clears the EXIF and XMP flags', () => {
    const { before, after } = strip('exif.webp')
    const view = new DataView(after.buffer, after.byteOffset)
    expect(view.getUint32(4, true)).toBe(after.length - 8)
    expect(before[20]! & 0x0c).toBe(0x0c)
    expect(after[20]! & 0x0c).toBe(0)
    expect(text(after.subarray(12, 16))).toBe('VP8X')
  })

  it('keeps a GIF’s looping, and drops its comment and other application data', () => {
    const { after } = strip('exif.gif')
    expect(text(after)).toContain('NETSCAPE2.0')
    expect(text(after)).not.toContain('XMP DataXMP')
    expect(after[after.length - 1]).toBe(0x3b)
  })

  it.each(['rotated.jpg', 'rotated.png', 'rotated.webp'])(
    'keeps the orientation %s is shown in, and nothing else of its EXIF',
    (name) => {
      const { before, after } = strip(name)
      for (const leak of ['SecretCam', 'GPS']) expect(text(after)).not.toContain(leak)
      expect(text(before)).toContain('SecretCam')
      const tiff = text(after).indexOf('MM\0*')
      expect(tiff).toBeGreaterThan(0)
      expect(readOrientation(after.subarray(tiff))).toBe(6)
      expect(inspectImage(after)).toEqual(inspectImage(before))
    },
  )

  it('keeps a PNG’s chunks valid after writing its orientation back', () => {
    const { after } = strip('rotated.png')
    const types: string[] = []
    for (let at = 8; at < after.length;) {
      const length = new DataView(after.buffer, after.byteOffset).getUint32(at)
      types.push(text(after.subarray(at + 4, at + 8)))
      at += 12 + length
    }
    expect(types).toEqual(['IHDR', 'eXIf', 'IDAT', 'IEND'])
  })

  it('sets the WebP EXIF flag again when the orientation is written back', () => {
    const { after } = strip('rotated.webp')
    expect(after[20]! & 0x08).toBe(0x08)
    expect(new DataView(after.buffer, after.byteOffset).getUint32(4, true)).toBe(after.length - 8)
  })

  it('drops PNG and WebP chunks it doesn’t know, such as content credentials', () => {
    const png = fixture('tiny.png')
    // A caBX chunk (C2PA) after IHDR; its CRC is not checked by the walk.
    const cabx = new Uint8Array([0, 0, 0, 4, ...new TextEncoder().encode('caBXsecr'), 0, 0, 0, 0])
    const withCabx = new Uint8Array([...png.subarray(0, 33), ...cabx, ...png.subarray(33)])
    expect(stripImageMetadata(withCabx, 'image/png')).toEqual(png)

    const webp = fixture('extended.webp')
    const c2pa = new Uint8Array([...new TextEncoder().encode('C2PA'), 4, 0, 0, 0, 1, 2, 3, 4])
    const withC2pa = new Uint8Array([...webp, ...c2pa])
    new DataView(withC2pa.buffer).setUint32(4, withC2pa.length - 8, true)
    expect(stripImageMetadata(withC2pa, 'image/webp')).toEqual(webp)
  })

  it('keeps a WebP whose RIFF size is too small for its chunks as it is', () => {
    const webp = fixture('extended.webp').slice()
    new DataView(webp.buffer).setUint32(4, 6, true)
    const stripped = stripImageMetadata(webp, 'image/webp')
    expect(stripped.subarray(8)).toEqual(webp.subarray(8))
    expect(inspectImage(stripped)).toEqual(inspectImage(webp))
  })

  it('keeps a GIF’s colour profile', () => {
    const gif = fixture('tiny.gif')
    const at = 13 + 3 * 2 ** ((gif[10]! & 7) + 1)
    const icc = new Uint8Array([
      0x21,
      0xff,
      11,
      ...new TextEncoder().encode('ICCRGBG1012'),
      3,
      1,
      2,
      3,
      0,
    ])
    const withIcc = new Uint8Array([...gif.subarray(0, at), ...icc, ...gif.subarray(at)])
    expect(stripImageMetadata(withIcc, 'image/gif')).toEqual(withIcc)
  })
})

describe('readOrientation', () => {
  it('reads the orientation from either byte order, with or without the Exif header', () => {
    expect(readOrientation(orientationTiff(8))).toBe(8)
    const little = new Uint8Array([
      0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(readOrientation(little)).toBe(3)
    const exif = new Uint8Array([...new TextEncoder().encode('Exif\0\0'), ...little])
    expect(readOrientation(exif)).toBe(3)
  })

  it('is null for the default orientation, none, or data it can’t read', () => {
    expect(readOrientation(orientationTiff(1))).toBeNull()
    expect(readOrientation(orientationTiff(9))).toBeNull()
    expect(
      readOrientation(new Uint8Array([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0])),
    ).toBeNull()
    expect(readOrientation(new Uint8Array([1, 2, 3]))).toBeNull()
    // A directory that says it has more entries than the data holds.
    expect(readOrientation(new Uint8Array([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 9]))).toBeNull()
  })
})
