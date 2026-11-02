import { describe, expect, it } from 'vitest'
import { imageIdOfPath, imagePath, isImageId, newImageId } from '../image-store.js'
import { MemoryImageStore } from '../memory-store.js'
import { dashboardImgSrc, isProviderImageUrl } from '../provider-images.js'

describe('image ids and paths', () => {
  it('makes a new random id for every upload', () => {
    const a = newImageId()
    const b = newImageId()
    expect(a).toMatch(/^img_[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
    expect(isImageId(a)).toBe(true)
  })

  it('reads the id back from its path, and nothing from other values', () => {
    const id = newImageId()
    expect(imageIdOfPath(imagePath(id))).toBe(id)
    expect(imageIdOfPath('/api/images/img_nothex')).toBeNull()
    expect(imageIdOfPath('https://avatars.githubusercontent.com/u/1')).toBeNull()
    expect(imageIdOfPath(null)).toBeNull()
  })
})

describe('provider avatars', () => {
  it('allows https on the GitHub and Google avatar hosts only', () => {
    expect(isProviderImageUrl('https://avatars.githubusercontent.com/u/1?v=4')).toBe(true)
    expect(isProviderImageUrl('https://lh3.googleusercontent.com/a/abc=s96-c')).toBe(true)
    expect(isProviderImageUrl('http://avatars.githubusercontent.com/u/1')).toBe(false)
    expect(isProviderImageUrl('https://avatars.githubusercontent.com.evil.example/x')).toBe(false)
    expect(isProviderImageUrl('https://evil.example/x.png')).toBe(false)
    expect(isProviderImageUrl('data:image/png;base64,AAAA')).toBe(false)
  })

  it('names the avatar hosts and the registry’s icon host in the dashboard image policy', () => {
    expect(dashboardImgSrc()).toBe(
      "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://raw.githubusercontent.com",
    )
    expect(dashboardImgSrc('https://nodes.example.com:8443/registry')).toMatch(
      / https:\/\/nodes\.example\.com:8443$/,
    )
    // A malformed registry URL adds nothing rather than breaking the policy.
    expect(dashboardImgSrc('not a url')).toBe(
      "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
    )
  })
})

describe('MemoryImageStore', () => {
  it('keeps, returns and deletes bytes by id', async () => {
    const store = new MemoryImageStore()
    await store.put('img_a', new Uint8Array([1, 2, 3]), 'image/png')
    expect(await store.get('img_a')).toEqual(new Uint8Array([1, 2, 3]))
    await store.delete(['img_a', 'img_missing'])
    expect(await store.get('img_a')).toBeNull()
  })
})
