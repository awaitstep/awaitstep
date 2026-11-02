import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MemoryImageStore, type ImageStore } from '@awaitstep/storage'
import { presetPermissions } from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { databaseImageStore, discardOwnerImages } from '../lib/images.js'
import { runMaintenance } from '../lib/maintenance.js'

// Uploading, serving and removing photos and logos, on the real migrated
// database, with each store: the database (bytes in the image row) and a
// bucket (bytes beside it, here in memory). The answers must be the same.

function fixture(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(new URL(`./fixtures/images/${name}`, import.meta.url)))
}

const PNG = fixture('tiny.png')
const JPEG = fixture('tiny.jpg')

interface Setup {
  h: SqliteApp
  bucket: MemoryImageStore | null
}

async function setup(store: 'database' | 'bucket'): Promise<Setup> {
  const bucket = store === 'bucket' ? new MemoryImageStore() : null
  const h = createSqliteApp(bucket ? { imageStore: bucket as ImageStore } : {})
  await seedAcme(h)
  return { h, bucket }
}

function upload(h: SqliteApp, user: string, path: string, body: Uint8Array, type = 'image/png') {
  return h.app.request(
    path,
    h.as(user, { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': type } }),
  )
}

function imageRows(h: SqliteApp): { id: string; owner_id: string; has_data: number }[] {
  return h.sqlite
    .prepare('SELECT id, owner_id, data IS NOT NULL AS has_data FROM image ORDER BY created_at')
    .all() as { id: string; owner_id: string; has_data: number }[]
}

function column(h: SqliteApp, sql: string, id: string): string | null {
  return (h.sqlite.prepare(sql).get(id) as { v: string | null } | undefined)?.v ?? null
}

const photoOf = (h: SqliteApp, id: string) =>
  column(h, 'SELECT image AS v FROM user WHERE id = ?', id)
const logoOf = (h: SqliteApp, id: string) =>
  column(h, 'SELECT logo AS v FROM organization WHERE id = ?', id)

describe.each(['database', 'bucket'] as const)('images with the %s store', (store) => {
  it('stores a photo, and serves the same bytes to anyone with its path', async () => {
    const { h, bucket } = await setup(store)
    const res = await upload(h, 'u-ama', '/api/account/photo', PNG)
    expect(res.status).toBe(200)
    const { image } = (await res.json()) as { image: string }
    expect(image).toMatch(/^\/api\/images\/img_[0-9a-f]{32}$/)
    expect(photoOf(h, 'u-ama')).toBe(image)

    // No session: the invite page shows a logo before sign-in.
    const served = await h.app.request(image)
    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(served.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(served.headers.get('cross-origin-resource-policy')).toBe('same-site')

    const [row] = imageRows(h)
    expect(row?.has_data).toBe(store === 'database' ? 1 : 0)
    expect(bucket?.objects.size ?? 0).toBe(store === 'bucket' ? 1 : 0)
  })

  it('serves the type detected from the bytes', async () => {
    const { h } = await setup(store)
    const { image } = (await (
      await upload(h, 'u-ama', '/api/account/photo', JPEG, 'image/jpeg')
    ).json()) as { image: string }
    expect((await h.app.request(image)).headers.get('content-type')).toBe('image/jpeg')
  })

  it('refuses an image that is damaged once its metadata is stripped, and stores nothing', async () => {
    const { h } = await setup(store)
    const webp = fixture('lossy.webp').slice()
    new DataView(webp.buffer).setUint32(4, 0, true)
    const res = await upload(h, 'u-ama', '/api/account/photo', webp, 'image/webp')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'The photo is damaged and can’t be stored',
      field: 'image',
    })
    expect(imageRows(h)).toEqual([])
  })

  it.each([
    ['a JPEG', 'exif.jpg', 'image/jpeg'],
    ['a PNG', 'exif.png', 'image/png'],
    ['a WebP', 'exif.webp', 'image/webp'],
  ])(
    'serves %s without the location and camera it was uploaded with',
    async (_what, name, type) => {
      const { h } = await setup(store)
      const sent = fixture(name)
      const { image } = (await (
        await upload(h, 'u-ama', '/api/account/photo', sent, type)
      ).json()) as { image: string }
      const served = new Uint8Array(await (await h.app.request(image)).arrayBuffer())
      const text = Buffer.from(served).toString('latin1')
      for (const leak of ['Exif\0', 'SecretCam', '51.5N', 'xmpmeta']) {
        expect(text).not.toContain(leak)
      }
      expect(served.length).toBeLessThan(sent.length)
      if (type === 'image/jpeg') expect(text).toContain('ICC_PROFILE\0')
      const stored = h.sqlite.prepare('SELECT bytes_len AS n FROM image').get() as { n: number }
      expect(stored.n).toBe(served.length)
    },
  )

  it.each([
    ['an SVG', fixture('logo.svg'), 'image/svg+xml', /must be a PNG, JPEG, WebP or GIF/],
    ['HTML labelled image/png', fixture('page.html'), 'image/png', /must be a PNG, JPEG/],
    ['a polyglot that starts as HTML', fixture('polyglot.bin'), 'image/png', /must be a PNG/],
    ['a GIF sent as a PNG', fixture('tiny.gif'), 'image/png', /isn't the image\/png/],
    ['an empty body', new Uint8Array(), 'image/png', /is empty/],
    ['an image over 4096 px', fixture('wide.png'), 'image/png', /4096 px/],
    ['a body that is not sent as an image', PNG, 'application/json', /image Content-Type/],
  ])('refuses %s with a 400 and stores nothing', async (_what, body, type, message) => {
    const { h, bucket } = await setup(store)
    const res = await upload(h, 'u-ama', '/api/account/photo', body, type)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: expect.stringMatching(message), field: 'image' })
    expect(imageRows(h)).toEqual([])
    expect(bucket?.objects.size ?? 0).toBe(0)
    expect(photoOf(h, 'u-ama')).toBeNull()
  })

  it('refuses a body over the size limit with a 413, from its length alone', async () => {
    const { h } = await setup(store)
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(64 * 1024))
        if (pulled > 4) controller.close()
      },
    })
    const res = await h.app.request(
      '/api/orgs/org-acme/logo',
      h.as('u-ama', {
        method: 'PUT',
        body,
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(5 * 64 * 1024) },
        duplex: 'half',
      } as RequestInit),
    )
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'The logo must be at most 200 KB', field: 'logo' })
    // Refused on the declared length: the body was never read through.
    expect(pulled).toBeLessThan(3)
    expect(imageRows(h)).toEqual([])
  })

  it('refuses an oversized body that names no length once it passes the limit', async () => {
    const { h } = await setup(store)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(64 * 1024))
        controller.close()
      },
    })
    const res = await h.app.request(
      '/api/account/photo',
      h.as('u-ama', {
        method: 'PUT',
        body,
        headers: { 'Content-Type': 'image/png' },
        duplex: 'half',
      } as RequestInit),
    )
    expect(res.status).toBe(413)
    expect(imageRows(h)).toEqual([])
  })

  it('replacing a photo makes the old path 404 and deletes its bytes', async () => {
    const { h, bucket } = await setup(store)
    const first = (
      (await (await upload(h, 'u-ama', '/api/account/photo', PNG)).json()) as {
        image: string
      }
    ).image
    const second = (
      (await (await upload(h, 'u-ama', '/api/account/photo', JPEG, 'image/jpeg')).json()) as {
        image: string
      }
    ).image
    expect(second).not.toBe(first)
    expect((await h.app.request(first)).status).toBe(404)
    expect((await h.app.request(second)).status).toBe(200)
    expect(imageRows(h).map((r) => r.id)).toEqual([second.split('/').at(-1)])
    expect(bucket?.objects.size ?? 1).toBe(1)
  })

  it('clearing a photo shows the initials again and deletes it', async () => {
    const { h, bucket } = await setup(store)
    const { image } = (await (await upload(h, 'u-ama', '/api/account/photo', PNG)).json()) as {
      image: string
    }
    const res = await h.app.request('/api/account/photo', h.as('u-ama', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ image: null })
    expect(photoOf(h, 'u-ama')).toBeNull()
    expect((await h.app.request(image)).status).toBe(404)
    expect(imageRows(h)).toEqual([])
    expect(bucket?.objects.size ?? 0).toBe(0)
  })

  it('carries only the path in the account and the people lists', async () => {
    const { h } = await setup(store)
    const { image } = (await (await upload(h, 'u-ama', '/api/account/photo', PNG)).json()) as {
      image: string
    }
    const account = await (await h.app.request('/api/account', h.as('u-ama'))).json()
    expect(account.person.image).toBe(image)
    const members = await (await h.app.request('/api/members?org=acme', h.as('u-ama'))).text()
    expect(members).toContain(image)
    expect(members).not.toContain('data:')
  })

  it('lets the owners and admins set and clear the logo, and records it', async () => {
    const { h } = await setup(store)
    const set = await upload(h, 'u-ben', '/api/orgs/org-acme/logo', PNG)
    expect(set.status).toBe(200)
    const { logo } = (await set.json()) as { logo: string }
    expect(logoOf(h, 'org-acme')).toBe(logo)
    expect((await h.app.request(logo)).status).toBe(200)

    const cleared = await h.app.request(
      '/api/orgs/org-acme/logo',
      h.as('u-ama', { method: 'DELETE' }),
    )
    expect(await cleared.json()).toEqual({ logo: null })
    expect((await h.app.request(logo)).status).toBe(404)
    const events = h.sqlite
      .prepare(
        "SELECT detail FROM audit_events WHERE event = 'organization.update' ORDER BY created_at",
      )
      .all()
    expect(events).toEqual([
      { detail: 'New logo · Dashboard' },
      { detail: 'Logo removed · Dashboard' },
    ])
  })

  it('refuses the logo to a plain member (403) and to someone outside the org (404)', async () => {
    const { h } = await setup(store)
    const member = await upload(h, 'u-fay', '/api/orgs/org-acme/logo', PNG)
    expect(member.status).toBe(403)
    expect((await member.json()).error).toMatch(/owners and admins/i)
    const clear = await h.app.request(
      '/api/orgs/org-acme/logo',
      h.as('u-fay', { method: 'DELETE' }),
    )
    expect(clear.status).toBe(403)
    expect((await upload(h, 'u-cleo', '/api/orgs/org-acme/logo', PNG)).status).toBe(404)
    expect(imageRows(h)).toEqual([])
  })

  it('takes uploads from a session only', async () => {
    const { h } = await setup(store)
    const key = await h.seed.key(
      'k-org',
      'u-ama',
      { level: 'organization' },
      presetPermissions('organization', 'full'),
    )
    const res = await h.app.request('/api/orgs/org-acme/logo', {
      method: 'PUT',
      body: PNG,
      headers: { ...key.headers, 'Content-Type': 'image/png' },
    })
    expect(res.status).toBe(403)
  })

  it('answers 404 for an id it does not hold, or one that is not an id', async () => {
    const { h } = await setup(store)
    expect((await h.app.request('/api/images/img_00000000000000000000000000000000')).status).toBe(
      404,
    )
    expect((await h.app.request('/api/images/..%2Fsecret')).status).toBe(404)
  })

  it('limits uploads per person: the eleventh in a minute is a 429', async () => {
    const { h } = await setup(store)
    for (let i = 0; i < 10; i++) {
      expect((await upload(h, 'u-ama', '/api/account/photo', PNG)).status).toBe(200)
    }
    expect((await upload(h, 'u-ama', '/api/account/photo', PNG)).status).toBe(429)
    expect(imageRows(h)).toHaveLength(1)
  })

  it('deletes a deleted owner’s images and their bytes', async () => {
    const { h, bucket } = await setup(store)
    const { logo } = (await (await upload(h, 'u-ama', '/api/orgs/org-acme/logo', PNG)).json()) as {
      logo: string
    }
    h.sqlite.prepare('DELETE FROM organization WHERE id = ?').run('org-acme')
    expect((await h.app.request(logo)).status).toBe(404)
    const imageStore = bucket ?? databaseImageStore(h.adapter)
    await discardOwnerImages(h.adapter, imageStore, { kind: 'org', id: 'org-acme' })
    expect(imageRows(h)).toEqual([])
    expect(bucket?.objects.size ?? 0).toBe(0)
  })

  it('the reaper removes images nobody has named for an hour, with their bytes', async () => {
    const { h, bucket } = await setup(store)
    const { image } = (await (await upload(h, 'u-ama', '/api/account/photo', PNG)).json()) as {
      image: string
    }
    // An upload that failed before its owner was pointed at it.
    h.sqlite
      .prepare(
        "INSERT INTO image (id, owner_kind, owner_id, content_type, bytes_len, width, height, created_at) VALUES ('img_stray', 'user', 'u-ben', 'image/png', 4, 1, 1, ?)",
      )
      .run(new Date().toISOString())
    await bucket?.put('img_stray', new Uint8Array([1, 2, 3, 4]), 'image/png')
    const imageStore = bucket ?? databaseImageStore(h.adapter)

    await runMaintenance(h.adapter, new Date(), imageStore)
    expect(imageRows(h)).toHaveLength(2)
    await runMaintenance(h.adapter, new Date(Date.now() + 2 * 60 * 60 * 1000), imageStore)
    expect(imageRows(h).map((r) => r.id)).toEqual([image.split('/').at(-1)])
    expect(bucket ? [...bucket.objects.keys()] : []).toEqual(
      bucket ? [image.split('/').at(-1)] : [],
    )
    expect((await h.app.request(image)).status).toBe(200)
  })
})

describe('an upload that loses a race', () => {
  it('answers 409 and leaves the owner as it was when a cleanup claimed its row first', async () => {
    const bucket = new MemoryImageStore()
    const h = createSqliteApp({
      imageStore: {
        kind: 'bucket',
        // Another request's cleanup claims the new row between its put and its swap.
        put: async (id, bytes, type) => {
          await bucket.put(id, bytes, type)
          await h.adapter.claimImages([id], new Date().toISOString())
        },
        get: (id) => bucket.get(id),
        delete: (ids) => bucket.delete(ids),
      },
    })
    await seedAcme(h)
    const res = await upload(h, 'u-ama', '/api/account/photo', PNG)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'Another change to this image landed first. Try again.',
    })
    expect(photoOf(h, 'u-ama')).toBeNull()
    expect(imageRows(h)).toEqual([])
    expect(bucket.objects.size).toBe(0)
  })

  it('deletes its own bytes when another cleanup took its row before the put', async () => {
    const bucket = new MemoryImageStore()
    const h = createSqliteApp({
      imageStore: {
        kind: 'bucket',
        // Another upload's cleanup claims and deletes this row before the put lands.
        put: async (id, bytes, type) => {
          await h.adapter.claimImages([id], new Date().toISOString())
          await h.adapter.deleteImages([id])
          await bucket.put(id, bytes, type)
        },
        get: (id) => bucket.get(id),
        delete: (ids) => bucket.delete(ids),
      },
    })
    await seedAcme(h)
    expect((await upload(h, 'u-ama', '/api/account/photo', PNG)).status).toBe(409)
    expect(imageRows(h)).toEqual([])
    expect(bucket.objects.size).toBe(0)
  })
})

describe('the maintenance image jobs', () => {
  it('still sweeps when the inline migration fails', async () => {
    const h = createSqliteApp()
    await seedAcme(h)
    h.sqlite
      .prepare('UPDATE user SET image = ? WHERE id = ?')
      .run(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`, 'u-ama')
    h.sqlite
      .prepare(
        "INSERT INTO image (id, owner_kind, owner_id, content_type, bytes_len, width, height, created_at) VALUES ('img_stray', 'user', 'u-ben', 'image/png', 1, 1, 1, '2020-01-01T00:00:00.000Z')",
      )
      .run()
    const failingPuts: ImageStore = {
      kind: 'bucket',
      put: async () => {
        throw new Error('bucket refuses writes')
      },
      get: async () => null,
      delete: async () => {},
    }
    await runMaintenance(h.adapter, new Date(), failingPuts)
    expect(imageRows(h).map((r) => r.id)).not.toContain('img_stray')
    expect(photoOf(h, 'u-ama')).toMatch(/^data:image\/png/)
  })
})
