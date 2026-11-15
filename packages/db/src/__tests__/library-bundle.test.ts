import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import type { CreateLibraryItemData, LibraryBundleRoots } from '../library-types.js'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  seedDeployAccount,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// What a Sales workflow's deploy bundles from the Library, and what a
// workflow save and a deploy record, on every driver over the shared seed.

function item(
  id: string,
  over: Partial<CreateLibraryItemData> & { slug?: string } = {},
): CreateLibraryItemData {
  return {
    id,
    projectId: 'p-101',
    workspaceId: 'ws-sales',
    kind: 'module',
    slug: id,
    name: id,
    description: '',
    createdBy: 'u-ama',
    files: [],
    ...over,
  }
}

const SALES: Omit<LibraryBundleRoots, 'slugs' | 'nodeItemIds'> = {
  projectId: 'p-101',
  workspaceId: 'ws-sales',
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('library bundle on %s', (_name, makeHarness) => {
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

  async function publish(
    data: CreateLibraryItemData,
    version: string,
    imports: string[] = [],
    source = `export const v = '${version}'`,
  ) {
    const seq = (await h.adapter.listLibraryVersionImports(data.id))[0]?.seq ?? 0
    const outcome = await h.adapter.publishLibraryVersion(
      {
        id: `${data.id}@${version}`,
        item: { itemId: data.id, projectId: data.projectId, workspaceId: data.workspaceId },
        version,
        expectedSeq: seq,
        files: [{ path: 'index.ts', source, hash: `h-${version}`, size: source.length }],
        imports,
        publishedBy: 'u-ama',
        removePaths: [],
        rewrite: null,
        usageSlugs: imports,
      },
      3,
    )
    expect(outcome).toMatchObject({ ok: true })
  }

  function bundle(slugs: string[], nodeItemIds: string[] = [], cap = 100) {
    return h.adapter.resolveLibraryBundle(
      { ...SALES, slugs, nodeItemIds },
      { items: cap, bytes: 1_000_000, files: 1_000 },
    )
  }

  function summary(result: Awaited<ReturnType<typeof bundle>>) {
    return result.items.map((i) => {
      const by = i.importers.map((importer) => importer ?? 'wf').sort()
      return `${i.slug}@${i.version ?? 'draft'} <- ${by.join(',')}`
    })
  }

  it('bundles what the workflow imports at its latest version, with its files', async () => {
    const scoring = item('scoring', { slug: 'lead-scoring' })
    await add(scoring)
    await publish(scoring, '1.4.1')
    await publish(scoring, '1.4.2', [], 'export const score = 2')
    const result = await bundle(['lead-scoring'])
    expect(result.truncated).toBe(false)
    expect(result.oversize).toBe(false)
    expect(result.items).toEqual([
      {
        id: 'scoring',
        kind: 'module',
        slug: 'lead-scoring',
        name: 'scoring',
        workspaceId: 'ws-sales',
        version: '1.4.2',
        files: [{ path: 'index.ts', source: 'export const score = 2', hash: 'h-1.4.2', size: 22 }],
        imports: [],
        importers: [null],
      },
    ])
  })

  it('follows imports through the latest versions, and ends on a cycle', async () => {
    const a = item('a')
    const b = item('b')
    const c = item('c', { workspaceId: null })
    for (const data of [a, b, c]) await add(data)
    await publish(a, '1.0.0', ['b'])
    await publish(b, '1.0.0', ['a', 'c'])
    await publish(c, '1.0.0')
    expect(summary(await bundle(['a']))).toEqual([
      'a@1.0.0 <- b,wf',
      'b@1.0.0 <- a',
      'c@1.0.0 <- b',
    ])
  })

  it('reports an unpublished module with no version, and leaves an unknown slug out', async () => {
    await add(item('draft-mod'))
    expect(summary(await bundle(['draft-mod', 'nope']))).toEqual(['draft-mod@draft <- wf'])
  })

  it('resolves the workflow’s slug to its own workspace first, a project item’s to the project only', async () => {
    const own = item('fmt-sales', { slug: 'fmt' })
    const project = item('fmt-project', { slug: 'fmt', workspaceId: null })
    const node = item('notify', { kind: 'node', slug: 'notify', workspaceId: null })
    for (const data of [own, project, node]) await add(data)
    await publish(own, '1.0.0')
    await publish(project, '2.0.0')
    await publish(node, '1.0.0', ['fmt'])
    // Two different `fmt`s in one bundle: the caller refuses it, naming both.
    expect(summary(await bundle(['fmt'], ['notify']))).toEqual([
      'fmt@2.0.0 <- notify',
      'fmt@1.0.0 <- wf',
      'notify@1.0.0 <- wf',
    ])
  })

  it('never reaches another workspace’s or another project’s items', async () => {
    const ops = item('ops-mod', { slug: 'shared', workspaceId: 'ws-ops' })
    const opsNode = item('ops-node', { kind: 'node', workspaceId: 'ws-ops' })
    const far = item('far-node', { kind: 'node', projectId: 'p-202', workspaceId: null })
    for (const data of [ops, opsNode, far]) await add(data)
    await publish(ops, '1.0.0')
    await publish(opsNode, '1.0.0')
    await publish(far, '1.0.0')
    expect((await bundle(['shared'], ['ops-node', 'far-node'])).items).toEqual([])
  })

  it('reaches the workspace’s own items only for a workspace-only reach, transitively too', async () => {
    const top = item('top')
    const base = item('base', { workspaceId: null })
    const crm = item('crm', { workspaceId: null })
    const node = item('notify', { kind: 'node', slug: 'notify', workspaceId: null })
    for (const data of [top, base, crm, node]) await add(data)
    await publish(top, '1.0.0', ['base'])
    await publish(base, '1.0.0')
    await publish(crm, '1.0.0')
    await publish(node, '1.0.0')
    const narrow = await h.adapter.resolveLibraryBundle(
      { ...SALES, slugs: ['top', 'crm'], nodeItemIds: ['notify'], reach: 'workspace-only' },
      { items: 100, bytes: 1_000_000, files: 1_000 },
    )
    expect(summary(narrow)).toEqual(['top@1.0.0 <- wf'])
    // The default reach still falls back to the project, as a deploy does.
    expect(summary(await bundle(['top', 'crm'], ['notify']))).toEqual([
      'base@1.0.0 <- top',
      'crm@1.0.0 <- wf',
      'top@1.0.0 <- wf',
      'notify@1.0.0 <- wf',
    ])
  })

  it('stops at the cap and says so', async () => {
    for (const id of ['m1', 'm2', 'm3']) {
      const data = item(id)
      await add(data)
      await publish(data, '1.0.0')
    }
    const result = await bundle(['m1', 'm2', 'm3'], [], 2)
    expect(result.items).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('sends no file bodies once the bundle passes its size or file limit, and says so', async () => {
    for (const id of ['m1', 'm2']) {
      const data = item(id)
      await add(data)
      await publish(data, '1.0.0', [], 'x'.repeat(400))
    }
    const roots = { ...SALES, slugs: ['m1', 'm2'], nodeItemIds: [] }
    const bySize = await h.adapter.resolveLibraryBundle(roots, {
      items: 100,
      bytes: 600,
      files: 100,
    })
    expect(bySize.oversize).toBe(true)
    expect(bySize.items.map((i) => [i.slug, i.version, i.files])).toEqual([
      ['m1', '1.0.0', []],
      ['m2', '1.0.0', []],
    ])
    const byCount = await h.adapter.resolveLibraryBundle(roots, {
      items: 100,
      bytes: 1e6,
      files: 1,
    })
    expect(byCount.oversize).toBe(true)
    const within = await h.adapter.resolveLibraryBundle(roots, { items: 100, bytes: 1e6, files: 2 })
    expect(within.oversize).toBe(false)
    expect(within.items.every((i) => i.files.length === 1)).toBe(true)
  })

  it('records a workflow’s uses, keeping only custom nodes in its reach', async () => {
    await add(item('scoring', { slug: 'lead-scoring' }))
    await add(item('notify', { kind: 'node', workspaceId: null }))
    await add(item('ops-node', { kind: 'node', workspaceId: 'ws-ops' }))
    await h.adapter.rewriteWorkflowLibraryUsages({
      workflowId: 'wf-enrich',
      slugs: ['lead-scoring'],
      // Many ids out of reach sorting first never crowd out a real one.
      nodeItemIds: [...Array.from({ length: 150 }, (_, k) => `aaa-${k}`), 'notify', 'ops-node'],
    })
    const usedBy = async (id: string) =>
      (await h.adapter.getLibraryUsages('u-ama', id)).usedBy.visible.map((c) => c.id)
    expect(await usedBy('scoring')).toEqual(['wf-enrich'])
    expect(await usedBy('notify')).toEqual(['wf-enrich'])
    expect(await usedBy('ops-node')).toEqual([])
    expect(await h.adapter.deleteLibraryItemIfUnused('notify')).toBe(false)
    expect(await h.adapter.deleteLibraryItemIfUnused('ops-node')).toBe(true)

    // A rewrite replaces the whole set.
    await h.adapter.rewriteWorkflowLibraryUsages({
      workflowId: 'wf-enrich',
      slugs: [],
      nodeItemIds: [],
    })
    expect(await usedBy('scoring')).toEqual([])
    expect(await h.adapter.deleteLibraryItemIfUnused('notify')).toBe(true)
  })

  it('writes a deployment with the library versions it bundled, read back as what it runs', async () => {
    await seedDeployAccount(h)
    const scoring = item('scoring', { slug: 'lead-scoring' })
    await add(scoring)
    await h.adapter.rewriteWorkflowLibraryUsages({
      workflowId: 'wf-enrich',
      slugs: ['lead-scoring'],
      nodeItemIds: [],
    })
    const connectionId = (
      await h.db.select({ id: h.schema.connections.id }).from(h.schema.connections).limit(1)
    )[0]!.id
    await h.adapter.createDeployment({
      id: 'd-lib',
      workflowId: 'wf-enrich',
      versionId: 'v-enrich-2',
      versionNumber: 2,
      connectionId,
      serviceName: 'svc',
      status: 'success',
      libraryVersions: [{ itemId: 'scoring', slug: 'lead-scoring', version: '1.4.1' }],
    })
    const usedBy = (await h.adapter.getLibraryUsages('u-ama', 'scoring')).usedBy.visible
    expect(usedBy).toEqual([expect.objectContaining({ id: 'wf-enrich', runs: '1.4.1' })])
    const rows = await h.db.select().from(h.schema.deploymentLibraryVersions)
    expect(rows).toEqual([
      { deploymentId: 'd-lib', itemId: 'scoring', slug: 'lead-scoring', version: '1.4.1' },
    ])
  })

  it('writes a deployment bundling 100 library items, past D1’s parameter cap per statement', async () => {
    await seedDeployAccount(h)
    const connectionId = (
      await h.db.select({ id: h.schema.connections.id }).from(h.schema.connections).limit(1)
    )[0]!.id
    const libraryVersions = Array.from({ length: 100 }, (_, k) => ({
      itemId: `item-${k}`,
      slug: `mod-${k}`,
      version: '1.0.0',
    }))
    await h.adapter.createDeployment({
      id: 'd-big',
      workflowId: 'wf-enrich',
      versionId: 'v-enrich-2',
      versionNumber: 2,
      connectionId,
      serviceName: 'svc',
      status: 'success',
      libraryVersions,
    })
    const rows = await h.db.select().from(h.schema.deploymentLibraryVersions)
    expect(rows).toHaveLength(100)
  })

  it('writes a deployment without library rows as before', async () => {
    await seedDeployAccount(h)
    const connectionId = (
      await h.db.select({ id: h.schema.connections.id }).from(h.schema.connections).limit(1)
    )[0]!.id
    await h.adapter.createDeployment({
      id: 'd-plain',
      workflowId: 'wf-enrich',
      versionId: 'v-enrich-2',
      versionNumber: 2,
      connectionId,
      serviceName: 'svc',
      status: 'success',
      createdBy: 'u-ama',
    })
    expect(await h.db.select().from(h.schema.deploymentLibraryVersions)).toEqual([])
    void T0
  })
})
