import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOGO_MAX_BYTES,
  LOGO_SIZE_PX,
  PHOTO_MAX_BYTES,
  PHOTO_SIZE_PX,
  readLogo,
  readPhoto,
} from '../read-file'

// A pick becomes the bytes the API stores: a photo is refused over 2 MB and
// shrunk to a 256 px WebP, an SVG logo is drawn to a PNG. jsdom decodes and
// draws no images, so the bitmap, the <img> and the canvas are stubbed.

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The canvas hands back `type` as a blob; `drawImage` records what was drawn. */
function stubCanvas(type: string) {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((done) => done(new Blob(['drawn'], { type })))
  return { drawImage, toBlob }
}

/** An `<img>` that loads at once with this size, from a blob: URL that is released. */
function stubSvgImage(width: number, height: number) {
  const revoke = vi.fn()
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:svg', revokeObjectURL: revoke })
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
  return { revoke }
}

describe('readPhoto', () => {
  it('refuses a file over 2 MB before reading it', async () => {
    const big = new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })
    await expect(readPhoto(big)).rejects.toThrow('Pick an image under 2 MB')
  })

  it('draws the photo at most 256 px on its longest side, as WebP', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1024, height: 512, close }),
    )
    const { drawImage, toBlob } = stubCanvas('image/webp')
    const file = new File([new Uint8Array(1_500_000)], 'me.jpg', { type: 'image/jpeg' })
    const photo = await readPhoto(file)
    expect(photo.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      PHOTO_SIZE_PX,
      PHOTO_SIZE_PX / 2,
    )
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9)
    expect(close).toHaveBeenCalled()
  })

  it('keeps the file as it is where the browser can’t draw it, if the API stores it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('no decoder')))
    const file = new File(['png'], 'me.png', { type: 'image/png' })
    expect(await readPhoto(file)).toBe(file)
    const big = new File([new Uint8Array(600 * 1024)], 'me.jpg', { type: 'image/jpeg' })
    await expect(readPhoto(big)).rejects.toThrow(/can’t shrink that image/)
    const heic = new File(['heic'], 'me.heic', { type: 'image/heic' })
    await expect(readPhoto(heic)).rejects.toThrow(/can’t shrink that image/)
  })
})

describe('readLogo', () => {
  it('draws an SVG to a PNG, at most 256 px on its longest side', async () => {
    const { revoke } = stubSvgImage(100, 50)
    const { drawImage, toBlob } = stubCanvas('image/png')
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'mark.svg', {
      type: 'image/svg+xml',
    })
    const logo = await readLogo(svg)
    expect(logo.type).toBe('image/png')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, LOGO_SIZE_PX, LOGO_SIZE_PX / 2)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined)
    expect(revoke).toHaveBeenCalledWith('blob:svg')
  })

  it('refuses an SVG that draws to a PNG over 200 KB', async () => {
    stubSvgImage(256, 256)
    stubCanvas('image/png')
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
      done(new Blob([new Uint8Array(LOGO_MAX_BYTES + 1)], { type: 'image/png' })),
    )
    await expect(
      readLogo(new File(['<svg/>'], 'busy.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('Pick an image under 200 KB')
  })

  it('draws an SVG with no size of its own as a square', async () => {
    stubSvgImage(0, 0)
    const { drawImage } = stubCanvas('image/png')
    await readLogo(new File(['<svg/>'], 'mark.svg', { type: 'image/svg+xml' }))
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, LOGO_SIZE_PX, LOGO_SIZE_PX)
  })

  it('says so when the browser won’t export the drawn SVG', async () => {
    stubSvgImage(10, 10)
    stubCanvas('image/png')
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported', 'SecurityError')
    })
    await expect(
      readLogo(new File(['<svg/>'], 'mark.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('Pick a PNG instead')
  })

  it('keeps a PNG, JPEG, WebP or GIF as it is, under 200 KB', async () => {
    const png = new File(['png'], 'mark.png', { type: 'image/png' })
    expect(await readLogo(png)).toBe(png)
    const big = new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'mark.png', { type: 'image/png' })
    await expect(readLogo(big)).rejects.toThrow('Pick an image under 200 KB')
    const pdf = new File(['%PDF'], 'mark.pdf', { type: 'application/pdf' })
    await expect(readLogo(pdf)).rejects.toThrow('Pick a PNG, JPG, SVG or WebP image')
  })
})
