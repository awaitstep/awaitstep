import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import type { ImageInsert } from '../types.js'
import {
  type Harness,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// Uploaded photos and logos on every driver, over the shared seed (Ama,
// Ben, Cleo; Acme and Globex). An image is served and kept only while its
// owner's column names it; the reads and the swap are single statements.

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 255])
const EARLY = '2026-10-30T10:00:00.000Z'
const LATE = '2026-10-30T12:00:00.000Z'

function row(id: string, over: Partial<ImageInsert> = {}): ImageInsert {
  return {
    id,
    ownerKind: 'user',
    ownerId: 'u-ama',
    contentType: 'image/png',
    bytesLen: BYTES.length,
    width: 3,
    height: 2,
    createdAt: EARLY,
    ...over,
  }
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('images on %s', (_name, makeHarness) => {
  let h: Harness

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
  })

  afterEach(async () => {
    await (h as Harness & { dispose?: () => Promise<void> }).dispose?.()
  })

  async function imageOf(userId: string): Promise<string | null> {
    const rows = await h.db
      .select({ image: h.schema.user.image })
      .from(h.schema.user)
      .where(eq(h.schema.user.id, userId))
    return rows[0]?.image ?? null
  }

  async function logoOf(orgId: string): Promise<string | null> {
    const rows = await h.db
      .select({ logo: h.schema.organization.logo })
      .from(h.schema.organization)
      .where(eq(h.schema.organization.id, orgId))
    return rows[0]?.logo ?? null
  }

  it('serves an image only once its owner names it, with the bytes the row holds', async () => {
    await h.adapter.insertImage(row('img_a', { data: BYTES }))
    expect(await h.adapter.getImage('img_a')).toBeNull()

    expect(await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_a')).toEqual({
      set: true,
      others: [],
    })
    expect(await imageOf('u-ama')).toBe('/api/images/img_a')
    expect(await h.adapter.getImage('img_a')).toEqual({
      contentType: 'image/png',
      bytesLen: BYTES.length,
      data: BYTES,
    })
  })

  it('writes and reads the bytes of a row on their own (the database store)', async () => {
    await h.adapter.insertImage(row('img_a'))
    expect(await h.adapter.getImageData('img_a')).toBeNull()
    await h.adapter.setImageData('img_a', BYTES)
    expect(await h.adapter.getImageData('img_a')).toEqual(BYTES)
  })

  it('serves a bucket image with no bytes in its row', async () => {
    await h.adapter.insertImage(row('img_a', { ownerKind: 'org', ownerId: 'org-acme' }))
    await h.adapter.setOwnerImage({ kind: 'org', id: 'org-acme' }, 'img_a')
    expect(await logoOf('org-acme')).toBe('/api/images/img_a')
    expect(await h.adapter.getImage('img_a')).toEqual({
      contentType: 'image/png',
      bytesLen: BYTES.length,
      data: null,
    })
  })

  it('a replaced image stops being served, and is listed for deletion', async () => {
    await h.adapter.insertImage(row('img_old'))
    await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_old')
    await h.adapter.insertImage(row('img_new', { createdAt: LATE }))

    const swap = await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_new')
    expect(swap).toEqual({ set: true, others: ['img_old'] })
    expect(await h.adapter.getImage('img_old')).toBeNull()
    expect(await h.adapter.claimImages(swap.others, LATE)).toEqual(['img_old'])
    await h.adapter.deleteImages(['img_old'])
    expect(await h.count('image')).toBe(1)
  })

  it('never points an owner at another owner’s image, or at one that is gone', async () => {
    await h.adapter.insertImage(row('img_ben', { ownerId: 'u-ben' }))
    expect(await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_ben')).toEqual({
      set: false,
      others: [],
    })
    expect(await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_none')).toEqual({
      set: false,
      others: [],
    })
    expect(await imageOf('u-ama')).toBeNull()
  })

  it('clears the column and lists every image the owner stored', async () => {
    await h.adapter.insertImage(row('img_a'))
    await h.adapter.insertImage(row('img_b'))
    await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_a')
    const stored = await h.adapter.clearOwnerImage({ kind: 'user', id: 'u-ama' })
    expect(stored.sort()).toEqual(['img_a', 'img_b'])
    expect(await imageOf('u-ama')).toBeNull()
    expect(await h.adapter.getImage('img_a')).toBeNull()
  })

  it('never claims an image its owner names, and deletes only claimed rows', async () => {
    await h.adapter.insertImage(row('img_a'))
    await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_a')
    await h.adapter.insertImage(row('img_b'))
    expect(await h.adapter.claimImages(['img_a', 'img_b'], LATE)).toEqual(['img_b'])
    expect(await h.adapter.claimImages([], LATE)).toEqual([])
    // An unclaimed row survives a delete that names it.
    await h.adapter.deleteImages(['img_a', 'img_b'])
    expect(await h.count('image')).toBe(1)
    expect(await h.adapter.getImage('img_a')).not.toBeNull()
  })

  it('never points an owner at a row claimed for deletion', async () => {
    // A second upload's cleanup claimed this one before its own swap ran.
    await h.adapter.insertImage(row('img_racing'))
    expect(await h.adapter.claimImages(['img_racing'], LATE)).toEqual(['img_racing'])
    expect(await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_racing')).toEqual({
      set: false,
      others: [],
    })
    expect(await imageOf('u-ama')).toBeNull()
  })

  it('lists the images an owner has, for deleting the account or org', async () => {
    await h.adapter.insertImage(row('img_a', { ownerKind: 'org', ownerId: 'org-acme' }))
    await h.adapter.insertImage(row('img_b', { ownerKind: 'org', ownerId: 'org-globex' }))
    expect(await h.adapter.listOwnerImages({ kind: 'org', id: 'org-acme' })).toEqual(['img_a'])
    expect(await h.adapter.listOwnerImages({ kind: 'user', id: 'org-acme' })).toEqual([])
  })

  it('finds images nothing names that are older than the cutoff, oldest first', async () => {
    await h.adapter.insertImage(row('img_named'))
    await h.adapter.setOwnerImage({ kind: 'user', id: 'u-ama' }, 'img_named')
    await h.adapter.insertImage(row('img_late', { ownerId: 'u-ben', createdAt: LATE }))
    await h.adapter.insertImage(row('img_early', { ownerId: 'u-ben' }))
    // A deleted owner's image is named by nobody.
    await h.adapter.insertImage(row('img_orphan', { ownerId: 'u-gone', createdAt: EARLY }))
    const cutoff = '2026-10-30T11:00:00.000Z'
    expect((await h.adapter.listUnreferencedImages(cutoff, 10)).sort()).toEqual([
      'img_early',
      'img_orphan',
    ])
    expect(await h.adapter.listUnreferencedImages(cutoff, 1)).toHaveLength(1)
  })

  it('moves inline images and clears what can’t be stored, only where still inline', async () => {
    const at = { createdAt: EARLY, updatedAt: EARLY }
    await h.db
      .update(h.schema.user)
      .set({ image: 'data:image/png;base64,iVBORw0KGgo=', ...at })
      .where(eq(h.schema.user.id, 'u-ama'))
    await h.db
      .update(h.schema.user)
      .set({ image: 'data:image/png;base64,AAAA' })
      .where(eq(h.schema.user.id, 'u-ben'))
    await h.db
      .update(h.schema.organization)
      .set({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' })
      .where(eq(h.schema.organization.id, 'org-acme'))

    const inline = await h.adapter.listInlineImages(10)
    expect(inline.map((r) => `${r.ownerKind}:${r.ownerId}`).sort()).toEqual([
      'org:org-acme',
      'user:u-ama',
      'user:u-ben',
    ])
    expect(inline.find((r) => r.ownerId === 'u-ama')?.value).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    )

    // Ben uploaded a new photo meanwhile: his column no longer holds data.
    await h.db
      .update(h.schema.user)
      .set({ image: '/api/images/img_ben_new' })
      .where(eq(h.schema.user.id, 'u-ben'))
    await h.adapter.insertImage(row('img_moved'))
    await h.adapter.insertImage(row('img_ben_moved', { ownerId: 'u-ben' }))
    await h.adapter.replaceInlineImages(
      [
        { owner: { kind: 'user', id: 'u-ama' }, imageId: 'img_moved' },
        { owner: { kind: 'user', id: 'u-ben' }, imageId: 'img_ben_moved' },
      ],
      [{ kind: 'org', id: 'org-acme' }],
    )
    expect(await imageOf('u-ama')).toBe('/api/images/img_moved')
    expect(await imageOf('u-ben')).toBe('/api/images/img_ben_new')
    expect(await logoOf('org-acme')).toBeNull()
    expect(await h.adapter.listInlineImages(10)).toEqual([])
  })

  it('clears remote images but keeps stored paths, inline data and provider avatars', async () => {
    const set = (id: string, image: string) =>
      h.db.update(h.schema.user).set({ image }).where(eq(h.schema.user.id, id))
    await set('u-ama', 'https://avatars.githubusercontent.com/u/1?v=4')
    await set('u-ben', 'https://evil.example/pixel.png')
    await set('u-cleo', 'https://lh3.googleusercontent.com/a/abc=s96-c')
    await h.db
      .update(h.schema.organization)
      .set({ logo: '' })
      .where(eq(h.schema.organization.id, 'org-acme'))
    await h.db
      .update(h.schema.organization)
      .set({ logo: '/api/images/img_kept' })
      .where(eq(h.schema.organization.id, 'org-globex'))

    await h.adapter.clearRemoteImages()
    expect(await imageOf('u-ama')).toBe('https://avatars.githubusercontent.com/u/1?v=4')
    expect(await imageOf('u-ben')).toBeNull()
    expect(await imageOf('u-cleo')).toBe('https://lh3.googleusercontent.com/a/abc=s96-c')
    expect(await logoOf('org-acme')).toBeNull()
    expect(await logoOf('org-globex')).toBe('/api/images/img_kept')
  })

  it('claims and deletes more images than D1 binds in one statement', async () => {
    // 150 ids: over D1's 100 bound parameters if sent as one statement.
    const ids = Array.from({ length: 150 }, (_, n) => `img_bulk_${n}`)
    await h.adapter.insertImages(ids.map((id) => row(id, { ownerId: 'u-ben' })))
    expect(await h.adapter.existingImages(ids)).toHaveLength(150)
    expect(await h.adapter.claimImages(ids, LATE)).toHaveLength(150)
    await h.adapter.deleteImages(ids)
    expect(await h.count('image')).toBe(0)
    expect(await h.adapter.existingImages(ids)).toEqual([])
  })

  it('points a moved inline image only at a row no cleanup has claimed', async () => {
    await h.db
      .update(h.schema.user)
      .set({ image: 'data:image/png;base64,iVBORw0KGgo=' })
      .where(eq(h.schema.user.id, 'u-ama'))
    await h.adapter.insertImage(row('img_moved'))
    await h.adapter.claimImages(['img_moved'], LATE)
    await h.adapter.replaceInlineImages(
      [{ owner: { kind: 'user', id: 'u-ama' }, imageId: 'img_moved' }],
      [],
    )
    expect(await imageOf('u-ama')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })
})
