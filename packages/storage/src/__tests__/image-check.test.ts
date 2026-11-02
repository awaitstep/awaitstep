import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  LOGO_RULE,
  MAX_IMAGE_SIDE,
  PHOTO_RULE,
  checkImage,
  inspectImage,
  type ImageCheck,
} from '../image-check.js'

// Real files: the PNG was written by hand, the JPEG and GIF converted from
// it by macOS `sips`, the WebPs are the three kinds browsers produce.
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
}

function problemOf(check: ImageCheck): string | null {
  return check.ok ? null : check.problem
}

describe('inspectImage', () => {
  it.each([
    ['tiny.png', 'image/png', 3, 2],
    ['tiny.jpg', 'image/jpeg', 3, 2],
    ['tiny.gif', 'image/gif', 3, 2],
    ['lossy.webp', 'image/webp', 1, 1],
    ['lossless.webp', 'image/webp', 1, 1],
    ['extended.webp', 'image/webp', 1, 1],
  ])('reads the type and size of %s from its bytes', (name, type, width, height) => {
    expect(inspectImage(fixture(name))).toEqual({ type, width, height })
  })

  it.each(['logo.svg', 'page.html', 'polyglot.bin'])('finds no image signature in %s', (name) => {
    expect(inspectImage(fixture(name))).toBeNull()
  })

  it('refuses a GIF with a frame larger than the screen it declares', () => {
    // A 1×1 screen whose frame is 5000×5000: browsers would decode the frame's size.
    expect(inspectImage(fixture('frame-bomb.gif'))).toBeNull()
  })

  it('finds nothing in a truncated header', () => {
    expect(inspectImage(fixture('tiny.png').subarray(0, 16))).toBeNull()
    expect(inspectImage(fixture('tiny.jpg').subarray(0, 40))).toBeNull()
  })
})

describe('checkImage', () => {
  it('accepts each of the four types under the type it was sent as', () => {
    for (const [name, type] of [
      ['tiny.png', 'image/png'],
      ['tiny.jpg', 'image/jpeg'],
      ['tiny.gif', 'image/gif'],
      ['lossy.webp', 'image/webp'],
    ] as const) {
      expect(checkImage(fixture(name), PHOTO_RULE, type)).toEqual({
        ok: true,
        info: expect.objectContaining({ type }),
      })
    }
  })

  it('refuses an SVG, whatever it is sent as', () => {
    expect(problemOf(checkImage(fixture('logo.svg'), LOGO_RULE, 'image/svg+xml'))).toBe(
      'The logo must be a PNG, JPEG, WebP or GIF image',
    )
    expect(problemOf(checkImage(fixture('logo.svg'), LOGO_RULE, 'image/png'))).toMatch(/PNG, JPEG/)
  })

  it('refuses HTML labelled image/png', () => {
    expect(problemOf(checkImage(fixture('page.html'), PHOTO_RULE, 'image/png'))).toMatch(
      /must be a PNG, JPEG, WebP or GIF/,
    )
  })

  it('refuses a polyglot that only carries a PNG after its HTML', () => {
    expect(problemOf(checkImage(fixture('polyglot.bin'), PHOTO_RULE, 'image/png'))).toMatch(
      /must be a PNG/,
    )
  })

  it('refuses an image whose signature is not the type it was sent as', () => {
    expect(problemOf(checkImage(fixture('tiny.gif'), PHOTO_RULE, 'image/png'))).toBe(
      "The photo's content isn't the image/png it was sent as",
    )
  })

  it('refuses an empty body', () => {
    expect(problemOf(checkImage(new Uint8Array(), PHOTO_RULE, 'image/png'))).toBe(
      'The photo is empty',
    )
  })

  it(`refuses an image over ${MAX_IMAGE_SIDE} px on a side`, () => {
    expect(problemOf(checkImage(fixture('wide.png'), PHOTO_RULE, 'image/png'))).toBe(
      `The photo must be at most ${MAX_IMAGE_SIDE} px on each side`,
    )
  })

  it('refuses more bytes than the rule allows', () => {
    const big = new Uint8Array(LOGO_RULE.maxBytes + 1)
    big.set(fixture('tiny.png'))
    expect(problemOf(checkImage(big, LOGO_RULE, 'image/png'))).toBe(
      'The logo must be at most 200 KB',
    )
  })
})
