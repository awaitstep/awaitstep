import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MemoryImageStore, type ImageStore } from '@awaitstep/storage'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { databaseImageStore } from '../lib/images.js'
import { migrateInlineImages } from '../lib/image-migration.js'

// Photos and logos from before the image store: `data:` URLs move into the
// store, what can't be stored (an SVG logo) and remote URLs other than the
// GitHub and Google avatars are cleared. Run on each store, twice: the
// second run finds nothing to do.

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/images/${name}`, import.meta.url)))
}

function dataUrl(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

const GITHUB = 'https://avatars.githubusercontent.com/u/42?v=4'

async function seedOldImages(h: SqliteApp) {
  const setPhoto = h.sqlite.prepare('UPDATE user SET image = ? WHERE id = ?')
  const setLogo = h.sqlite.prepare('UPDATE organization SET logo = ? WHERE id = ?')
  setPhoto.run(dataUrl('image/png', fixture('tiny.png')), 'u-ama')
  setPhoto.run('https://evil.example/pixel.png', 'u-ben')
  setPhoto.run(GITHUB, 'u-cleo')
  // An HTML payload that once claimed to be a photo.
  setPhoto.run(dataUrl('image/png', fixture('page.html')), 'u-dan')
  setLogo.run(dataUrl('image/svg+xml', fixture('logo.svg')), 'org-acme')
  setLogo.run(dataUrl('image/jpeg', fixture('tiny.jpg')), 'org-globex')
}

const photoOf = (h: SqliteApp, id: string) =>
  (h.sqlite.prepare('SELECT image AS v FROM user WHERE id = ?').get(id) as { v: string | null }).v
const logoOf = (h: SqliteApp, id: string) =>
  (
    h.sqlite.prepare('SELECT logo AS v FROM organization WHERE id = ?').get(id) as {
      v: string | null
    }
  ).v

describe.each(['database', 'bucket'] as const)('moving inline images into the %s store', (kind) => {
  async function setup() {
    const bucket = kind === 'bucket' ? new MemoryImageStore() : null
    const h = createSqliteApp(bucket ? { imageStore: bucket as ImageStore } : {})
    await seedAcme(h)
    await seedOldImages(h)
    const store = bucket ?? databaseImageStore(h.adapter)
    return { h, bucket, store }
  }

  it('moves each storable data URL, and serves the same bytes from its new path', async () => {
    const { h, store } = await setup()
    await migrateInlineImages(h.adapter, store)

    const photo = photoOf(h, 'u-ama')!
    const logo = logoOf(h, 'org-globex')!
    expect(photo).toMatch(/^\/api\/images\/img_[0-9a-f]{32}$/)
    expect(logo).toMatch(/^\/api\/images\/img_[0-9a-f]{32}$/)
    const served = await h.app.request(photo)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(fixture('tiny.png'))
    expect((await h.app.request(logo)).headers.get('content-type')).toBe('image/jpeg')
  })

  it('clears what the store refuses and remote URLs, and keeps provider avatars', async () => {
    const { h, store } = await setup()
    await migrateInlineImages(h.adapter, store)
    expect(logoOf(h, 'org-acme')).toBeNull()
    expect(photoOf(h, 'u-dan')).toBeNull()
    expect(photoOf(h, 'u-ben')).toBeNull()
    expect(photoOf(h, 'u-cleo')).toBe(GITHUB)
    const inline = h.sqlite
      .prepare("SELECT count(*) AS n FROM user WHERE image LIKE 'data:%'")
      .get() as { n: number }
    expect(inline.n).toBe(0)
  })

  it('finds nothing to do the second time', async () => {
    const { h, bucket, store } = await setup()
    await migrateInlineImages(h.adapter, store)
    const before = { photo: photoOf(h, 'u-ama'), objects: bucket?.objects.size }
    await migrateInlineImages(h.adapter, store)
    expect(photoOf(h, 'u-ama')).toBe(before.photo)
    expect(bucket?.objects.size).toBe(before.objects)
    const rows = h.sqlite.prepare('SELECT count(*) AS n FROM image').get() as { n: number }
    expect(rows.n).toBe(2)
  })
})

describe('moving inline images when the bucket fails', () => {
  it('leaves the owner’s data URL in place, to move on the next run', async () => {
    const h = createSqliteApp()
    await seedAcme(h)
    await seedOldImages(h)
    const failing: ImageStore = {
      kind: 'bucket',
      put: async () => {
        throw new Error('bucket down')
      },
      get: async () => null,
      delete: async () => {},
    }
    await expect(migrateInlineImages(h.adapter, failing)).rejects.toThrow('bucket down')
    expect(photoOf(h, 'u-ama')).toMatch(/^data:image\/png;base64,/)
    // The rows made for the batch name nobody: the reaper's to remove.
    expect(
      (h.sqlite.prepare('SELECT count(*) AS n FROM image').get() as { n: number }).n,
    ).toBeGreaterThan(0)
  })
})

describe('moving inline images when an upload’s cleanup races the batch', () => {
  it('drops the bytes of a row taken before its put, and leaves the data URL to move later', async () => {
    const bucket = new MemoryImageStore()
    const h = createSqliteApp()
    await seedAcme(h)
    await seedOldImages(h)
    const racing: ImageStore = {
      kind: 'bucket',
      put: async (id, bytes, type) => {
        // Ama's row is claimed and deleted by another request first.
        const owner = h.sqlite.prepare('SELECT owner_id AS o FROM image WHERE id = ?').get(id) as {
          o: string
        }
        if (owner.o === 'u-ama') {
          await h.adapter.claimImages([id], new Date().toISOString())
          await h.adapter.deleteImages([id])
        }
        await bucket.put(id, bytes, type)
      },
      get: (id) => bucket.get(id),
      delete: (ids) => bucket.delete(ids),
    }
    // One batch only, so the race happens once.
    await migrateInlineImages(h.adapter, { ...racing, put: racing.put })
    expect(photoOf(h, 'u-ama')).toMatch(/^\/api\/images\/|^data:/)
    const rowIds = new Set(
      (h.sqlite.prepare('SELECT id FROM image').all() as { id: string }[]).map((r) => r.id),
    )
    // Every object in the bucket has its row.
    expect([...bucket.objects.keys()].every((id) => rowIds.has(id))).toBe(true)
  })
})
