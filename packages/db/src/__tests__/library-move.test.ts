import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import type { CreateLibraryItemData } from '../library-types.js'
import {
  type Harness,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// Moving a workspace's item to its project: the same row (id, history and
// usages kept), refused when the project has the slug, is full, or lacks a
// module the item imports.

function item(id: string, over: Partial<CreateLibraryItemData> = {}): CreateLibraryItemData {
  return {
    id,
    projectId: 'p-101',
    workspaceId: 'ws-sales',
    kind: 'node',
    slug: id,
    name: id,
    description: '',
    createdBy: 'u-ama',
    files: [],
    ...over,
  }
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('moveLibraryItemToProject on %s', (_name, makeHarness) => {
  let h: Harness

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
  })

  afterEach(async () => {
    await (h as Harness & { dispose?: () => Promise<void> }).dispose?.()
  })

  async function add(data: CreateLibraryItemData) {
    expect(await h.adapter.createLibraryItem(data, 200)).not.toBeNull()
  }

  it('hands the item to the project, keeping its id', async () => {
    await add(item('say-hello'))
    const outcome = await h.adapter.moveLibraryItemToProject('say-hello', 'ws-sales', 200)
    expect(outcome).toMatchObject({ ok: true, item: { id: 'say-hello', workspaceId: null } })
    const access = await h.adapter.getLibraryItemForUser('u-ama', 'say-hello')
    expect(access?.owner).toMatchObject({ kind: 'project', id: 'p-101' })
  })

  it('refuses a slug the project already has for that kind', async () => {
    await add(item('ws-fmt', { kind: 'module', slug: 'fmt' }))
    await add(item('p-fmt', { kind: 'module', slug: 'fmt', workspaceId: null }))
    expect(await h.adapter.moveLibraryItemToProject('ws-fmt', 'ws-sales', 200)).toEqual({
      ok: false,
      reason: 'slug-taken',
    })
  })

  it('names the imported modules only the workspace has', async () => {
    await add(item('ws-dates', { kind: 'module', slug: 'dates' }))
    await add(item('p-fmt', { kind: 'module', slug: 'fmt', workspaceId: null }))
    await add(item('report', { usageSlugs: ['dates', 'fmt'] }))
    expect(await h.adapter.moveLibraryItemToProject('report', 'ws-sales', 200)).toEqual({
      ok: false,
      reason: 'unresolved',
      slugs: ['dates'],
    })
  })

  it('moves an item whose imports the project has', async () => {
    await add(item('p-fmt', { kind: 'module', slug: 'fmt', workspaceId: null }))
    await add(item('report', { usageSlugs: ['fmt'] }))
    const outcome = await h.adapter.moveLibraryItemToProject('report', 'ws-sales', 200)
    expect(outcome.ok).toBe(true)
    const usages = await h.adapter.getLibraryUsages('u-ama', 'report')
    expect(usages.uses.map((u) => u.id)).toEqual(['p-fmt'])
  })

  it('refuses when the project’s library is full', async () => {
    await add(item('p-one', { workspaceId: null }))
    await add(item('say-hello'))
    expect(await h.adapter.moveLibraryItemToProject('say-hello', 'ws-sales', 1)).toEqual({
      ok: false,
      reason: 'full',
    })
  })

  it('finds nothing once the item has left the workspace it was judged on', async () => {
    await add(item('say-hello'))
    expect(await h.adapter.moveLibraryItemToProject('say-hello', 'ws-ops', 200)).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(await h.adapter.moveLibraryItemToProject('nope', 'ws-sales', 200)).toEqual({
      ok: false,
      reason: 'missing',
    })
  })
})
