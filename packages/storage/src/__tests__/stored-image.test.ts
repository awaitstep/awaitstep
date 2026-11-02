import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LOGO_RULE, PHOTO_RULE, inspectImage } from '../image-check.js'
import { prepareImage } from '../stored-image.js'

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
}

/** A minimal EXIF: big-endian, the directory at 6, overlapping the header; 20 bytes in all. */
const TINY_EXIF = new Uint8Array([
  0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 6, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6,
])

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  // The stripper doesn't check CRCs; zeros do.
  const length = [0, 0, 0, data.length]
  return new Uint8Array([...length, ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0])
}

describe('prepareImage', () => {
  it('answers the stripped bytes with the checked type and size', () => {
    const sent = fixture('exif.jpg')
    const image = prepareImage(sent, PHOTO_RULE, 'image/jpeg')
    expect(image.ok && image.info).toEqual(inspectImage(sent))
    expect(image.ok && image.bytes.length).toBeLessThan(sent.length)
  })

  it('refuses what checkImage refuses, with its reason', () => {
    expect(prepareImage(fixture('tiny.gif'), PHOTO_RULE, 'image/png')).toEqual({
      ok: false,
      problem: "The photo's content isn't the image/png it was sent as",
    })
  })

  it('refuses a WebP whose RIFF size leaves no frame once stripped', () => {
    const webp = fixture('extended.webp').slice()
    new DataView(webp.buffer).setUint32(4, 0, true)
    expect(inspectImage(webp)).not.toBeNull()
    expect(prepareImage(webp, LOGO_RULE)).toEqual({
      ok: false,
      problem: 'The logo is damaged and can’t be stored',
    })
  })

  it('never stores a PNG grown past its limit by rewriting EXIF chunks', () => {
    const png = fixture('tiny.png')
    const chunk = pngChunk('eXIf', TINY_EXIF)
    const count = Math.floor((LOGO_RULE.maxBytes - png.length) / chunk.length)
    const parts = [
      png.subarray(0, 33),
      ...Array.from({ length: count }, () => chunk),
      png.subarray(33),
    ]
    const sent = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    parts.reduce((at, p) => (sent.set(p, at), at + p.length), 0)
    expect(sent.length).toBeLessThanOrEqual(LOGO_RULE.maxBytes)
    const image = prepareImage(sent, LOGO_RULE)
    expect(image.ok).toBe(true)
    // One orientation chunk is written back; the rest go.
    expect(image.ok && image.bytes.length).toBeLessThan(png.length + 40)
  })

  it('refuses a PNG whose header chunk isn’t 13 bytes long', () => {
    const png = fixture('tiny.png').slice()
    png[11] = 14
    expect(inspectImage(png)).toBeNull()
  })
})
