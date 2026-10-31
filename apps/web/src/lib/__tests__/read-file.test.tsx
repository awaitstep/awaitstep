import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHOTO_MAX_BYTES, PHOTO_SIZE_PX, readPhotoAsDataUrl } from '../read-file'

// A picked photo is refused over 2 MB and shrunk to 256 px before it is
// saved; jsdom has no image decoding, so the drawing is stubbed.

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readPhotoAsDataUrl', () => {
  it('refuses a file over 2 MB before reading it', async () => {
    const big = new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })
    await expect(readPhotoAsDataUrl(big)).rejects.toThrow('Pick an image under 2 MB')
  })

  it('draws the photo at most 256 px on its longest side, as WebP', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1024, height: 512, close }),
    )
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/webp;base64,UklGRg==')
    const file = new File([new Uint8Array(1_500_000)], 'me.jpg', { type: 'image/jpeg' })
    expect(await readPhotoAsDataUrl(file)).toBe('data:image/webp;base64,UklGRg==')
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      PHOTO_SIZE_PX,
      PHOTO_SIZE_PX / 2,
    )
    expect(toDataURL).toHaveBeenCalledWith('image/webp', 0.9)
    expect(close).toHaveBeenCalled()
  })

  it('keeps the file as it is where the browser can’t draw it, if it fits as it is', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('no decoder')))
    const file = new File(['png'], 'me.png', { type: 'image/png' })
    expect(await readPhotoAsDataUrl(file)).toMatch(/^data:image\/png;base64,/)
    const big = new File([new Uint8Array(600 * 1024)], 'me.heic', { type: 'image/heic' })
    await expect(readPhotoAsDataUrl(big)).rejects.toThrow(/can’t shrink that image/)
  })
})
