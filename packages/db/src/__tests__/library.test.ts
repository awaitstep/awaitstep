import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import type { CreateLibraryItemData, LibraryVersionFile } from '../library-types.js'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  seedDeployAccount,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// The Library on every driver, over the shared seed: Ama owns Acme, Ben is
// its admin, Cleo is in Globex only. Dee is added here: an Acme member who
// holds only a viewer grant in Ops, so Sales is hidden from her.

function item(id: string, over: Partial<CreateLibraryItemData> = {}): CreateLibraryItemData {
  return {
    id,
    projectId: 'p-101',
    workspaceId: 'ws-sales',
    kind: 'module',
    slug: id,
    name: id,
    description: '',
    createdBy: 'u-ama',
    files: [
      { id: `${id}-f1`, itemId: id, path: 'index.ts', source: 'export {}', hash: 'h1', size: 9 },
    ],
    ...over,
  }
}

function files(n = 1): LibraryVersionFile[] {
  return Array.from({ length: n }, (_, k) => ({
    path: `f${k}.ts`,
    source: `export const v = ${k}`,
    hash: `h${k}`,
    size: 20,
  }))
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('library on %s', (_name, makeHarness) => {
  let h: Harness

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    const s = h.schema
    await h.db.insert(s.user).values({
      id: 'u-dee',
      name: 'Dee Ito',
      email: 'dee@acme.test',
      emailVerified: true,
      createdAt: T0,
      updatedAt: T0,
    })
    await h.db.insert(s.member).values({
      id: 'm-5',
      userId: 'u-dee',
      organizationId: 'org-acme',
      role: 'member',
      createdAt: T0,
    })
    await h.db.insert(s.workspaceMembers).values({
      workspaceId: 'ws-ops',
      userId: 'u-dee',
      role: 'viewer',
      createdBy: null,
      createdAt: T0,
    })
  })

  afterEach(async () => {
    await (h as Harness & { dispose?: () => Promise<void> }).dispose?.()
  })

  function create(data: CreateLibraryItemData, cap = 200) {
    return h.adapter.createLibraryItem(data, cap)
  }

  async function latestSeq(itemId: string) {
    return (await h.adapter.listLibraryVersionImports(itemId))[0]?.seq ?? 0
  }

  async function publish(itemId: string, version: string, imports: string[] = []) {
    return h.adapter.publishLibraryVersion(
      {
        id: `${itemId}@${version}`,
        item: { itemId, projectId: 'p-101', workspaceId: 'ws-sales' },
        version,
        expectedSeq: await latestSeq(itemId),
        files: files(2),
        imports,
        publishedBy: 'u-ama',
        removePaths: [],
        rewrite: null,
        usageSlugs: imports,
      },
      3,
    )
  }

  it('opens a workspace item for that workspace only, never for another one', async () => {
    await create(item('lead-scoring'))
    const access = await h.adapter.getLibraryItemForUser('u-ama', 'lead-scoring')
    expect(access).toMatchObject({
      item: { id: 'lead-scoring', kind: 'module', workspaceId: 'ws-sales' },
      organizationId: 'org-acme',
      owner: { kind: 'workspace', id: 'ws-sales', name: 'Sales' },
      latestVersion: null,
      orgRole: 'owner',
    })
    expect(await h.adapter.getLibraryItemForUser('u-dee', 'lead-scoring')).toBeNull()
    expect(await h.adapter.getLibraryItemForUser('u-cleo', 'lead-scoring')).toBeNull()
  })

  it('says why an update was refused: a taken slug, a used module, or no item', async () => {
    await create(item('a', { slug: 'fmt' }))
    await create(item('b', { slug: 'other' }))
    expect(await h.adapter.updateLibraryItem('u-ama', 'b', { slug: 'fmt' })).toEqual({
      ok: false,
      reason: 'slug-taken',
    })
    expect(await h.adapter.updateLibraryItem('u-ama', 'nope', { name: 'X' })).toEqual({
      ok: false,
      reason: 'missing',
    })
    // A project module used from Sales: Dee (a viewer in Ops only) sees the refusal, not who.
    await create(item('p-fmt', { slug: 'p-fmt', workspaceId: null }))
    await h.adapter.rewriteLibraryUsages(
      { itemId: 'a', projectId: 'p-101', workspaceId: 'ws-sales' },
      ['p-fmt'],
    )
    expect(await h.adapter.updateLibraryItem('u-dee', 'p-fmt', { slug: 'p-fmt-2' })).toEqual({
      ok: false,
      reason: 'in-use',
      consumers: { visible: [], hiddenCount: 1 },
    })
    expect(await h.adapter.updateLibraryItem('u-ama', 'p-fmt', { slug: 'p-fmt-2' })).toMatchObject({
      ok: false,
      consumers: { visible: [{ id: 'a' }], hiddenCount: 0 },
    })
  })

  it('keeps one slug per kind per owner, the project counting as one owner', async () => {
    await create(item('a', { slug: 'fmt' }))
    await expect(create(item('b', { slug: 'fmt' }))).rejects.toThrow()
    await create(item('c', { slug: 'fmt', workspaceId: 'ws-ops' }))
    await create(item('d', { slug: 'fmt', kind: 'node' }))
    await create(item('e', { slug: 'fmt', workspaceId: null }))
    await expect(create(item('f', { slug: 'fmt', workspaceId: null }))).rejects.toThrow()
    expect(await h.count('library_items')).toBe(4)
  })

  it('opens a project item for anyone in the project, a workspace-only person included', async () => {
    await create(item('p-fmt', { workspaceId: null }))
    expect(await h.adapter.getLibraryItemForUser('u-ben', 'p-fmt')).toMatchObject({
      owner: { kind: 'project', id: 'p-101', name: 'Project 101' },
    })
    // Dee holds only a grant in Ops: she reads it, with no project role to change it.
    expect(await h.adapter.getLibraryItemForUser('u-dee', 'p-fmt')).toMatchObject({
      item: { id: 'p-fmt' },
      projectGrant: null,
      workspaceGrant: null,
    })
    expect(await h.adapter.getLibraryItemForUser('u-cleo', 'p-fmt')).toBeNull()
  })

  it('publishes in order, keeps the three newest and refuses a repeated version', async () => {
    await create(item('m'))
    for (const version of ['1.0.0', '1.0.1', '1.0.2']) {
      expect(await publish('m', version)).toMatchObject({ ok: true, pruned: [] })
    }
    const fourth = await publish('m', '1.1.0')
    expect(fourth).toMatchObject({
      ok: true,
      version: { version: '1.1.0', seq: 4 },
      pruned: ['1.0.0'],
    })
    expect((await h.adapter.listLibraryVersions('m')).map((v) => v.version)).toEqual([
      '1.1.0',
      '1.0.2',
      '1.0.1',
    ])
    expect((await h.adapter.listLibraryVersions('m'))[0]!.publishedBy).toEqual({
      id: 'u-ama',
      name: 'Ama Mensah',
    })
    expect(await publish('m', '1.1.0')).toEqual({ ok: false, reason: 'conflict' })
    expect((await h.adapter.getLibraryItemForUser('u-ama', 'm'))!.latestVersion).toBe('1.1.0')
    expect(await h.adapter.getLibraryVersion('m', '1.0.2')).toMatchObject({
      version: '1.0.2',
      files: files(2),
      imports: [],
    })
  })

  it('moves a node folder out of the working copy on publish and lists it as published', async () => {
    await create(
      item('post', {
        kind: 'node',
        files: [
          { id: 'n1', itemId: 'post', path: '1.0.0/node.json', source: '{}', hash: 'a', size: 2 },
          { id: 'n2', itemId: 'post', path: '1.0.0/template.ts', source: 'x', hash: 'b', size: 1 },
          { id: 'n3', itemId: 'post', path: 'icon.svg', source: '<svg/>', hash: 'c', size: 6 },
        ],
      }),
    )
    const outcome = await h.adapter.publishLibraryVersion(
      {
        id: 'post@1',
        item: { itemId: 'post', projectId: 'p-101', workspaceId: 'ws-sales' },
        version: '1.0.0',
        expectedSeq: 0,
        files: [
          { path: 'node.json', source: '{}', hash: 'a', size: 2 },
          { path: 'template.ts', source: 'x', hash: 'b', size: 1 },
          { path: 'icon.svg', source: '<svg/>', hash: 'c', size: 6 },
        ],
        imports: [],
        publishedBy: 'u-ama',
        removePaths: ['1.0.0/node.json', '1.0.0/template.ts'],
        rewrite: null,
        usageSlugs: [],
      },
      3,
    )
    expect(outcome.ok).toBe(true)
    const tree = await h.adapter.getLibraryTree('post', 'node')
    expect(tree.files.map((f) => f.path)).toEqual(['icon.svg'])
    // The icon lives at the item root, so the published folders list the rest, in order.
    expect(tree.published.map((f) => `${f.version}/${f.path}`)).toEqual([
      '1.0.0/node.json',
      '1.0.0/template.ts',
    ])
    expect(tree.published[0]!.size).toBeTypeOf('number')
    expect(await h.adapter.getLibraryVersionFile('post', '1.0.0', 'template.ts')).toMatchObject({
      path: 'template.ts',
      source: 'x',
      hash: 'b',
      size: 1,
    })
    expect(await h.adapter.getLibraryVersionFile('post', '1.0.0', 'nope.ts')).toBeNull()
    expect(await h.adapter.libraryVersionExists('post', '1.0.0')).toBe(true)
    expect(await h.adapter.libraryVersionExists('post', '1.0.1')).toBe(false)
    // A module's versions are its history, not part of its tree.
    await create(item('m'))
    await publish('m', '1.0.0')
    expect((await h.adapter.getLibraryTree('m', 'module')).published).toEqual([])
  })

  it('writes a bumped file before the version, and refuses when it changed since read', async () => {
    await create(item('m'))
    const base = {
      id: 'm@2',
      item: { itemId: 'm', projectId: 'p-101', workspaceId: 'ws-sales' },
      version: '1.0.1',
      expectedSeq: 0,
      files: files(),
      imports: [],
      publishedBy: null,
      removePaths: [],
      usageSlugs: [],
    }
    const file = { id: 'x', itemId: 'm', path: 'index.ts', source: 'bumped', hash: 'h2', size: 6 }
    expect(
      await h.adapter.publishLibraryVersion(
        { ...base, rewrite: { file, expectedHash: 'stale' } },
        3,
      ),
    ).toEqual({ ok: false, reason: 'changed' })
    expect(
      await h.adapter.publishLibraryVersion({ ...base, rewrite: { file, expectedHash: 'h1' } }, 3),
    ).toMatchObject({ ok: true })
    expect((await h.adapter.getLibraryFile('m', 'index.ts'))!.source).toBe('bumped')
  })

  it('records uses by slug, own workspace first, and guards deletes and slug changes by them', async () => {
    await create(item('scoring', { slug: 'lead-scoring' }))
    await create(item('node-a', { kind: 'node', slug: 'node-a' }))
    await h.adapter.rewriteLibraryUsages(
      { itemId: 'node-a', projectId: 'p-101', workspaceId: 'ws-sales' },
      ['lead-scoring', 'missing'],
    )
    const usages = await h.adapter.getLibraryUsages('u-ama', 'scoring')
    expect(usages.usedBy).toEqual({
      visible: [
        {
          kind: 'item',
          id: 'node-a',
          itemKind: 'node',
          name: 'node-a',
          slug: 'node-a',
          owner: { kind: 'workspace', id: 'ws-sales', name: 'Sales' },
        },
      ],
      hiddenCount: 0,
    })
    expect((await h.adapter.getLibraryUsages('u-ama', 'node-a')).uses).toEqual([
      {
        id: 'scoring',
        kind: 'module',
        slug: 'lead-scoring',
        name: 'scoring',
        owner: { kind: 'workspace', id: 'ws-sales', name: 'Sales' },
      },
    ])

    expect(await h.adapter.deleteLibraryItemIfUnused('scoring')).toBe(false)
    expect(
      await h.adapter.updateLibraryItem('u-ama', 'scoring', { slug: 'renamed' }),
    ).toMatchObject({ ok: false, reason: 'in-use', consumers: { visible: [{ id: 'node-a' }] } })
    // Rewriting is idempotent and replaces the whole set.
    await h.adapter.rewriteLibraryUsages(
      { itemId: 'node-a', projectId: 'p-101', workspaceId: 'ws-sales' },
      [],
    )
    expect(await h.adapter.deleteLibraryItemIfUnused('scoring')).toBe(true)
  })

  it('resolves a slug to the consumer’s own workspace, then the project, never another workspace', async () => {
    await create(item('sales-fmt', { slug: 'fmt' }))
    await create(item('p-fmt', { slug: 'fmt', workspaceId: null }))
    await create(item('sales-node', { kind: 'node' }))
    await create(item('ops-node', { kind: 'node', workspaceId: 'ws-ops' }))
    await create(item('p-node', { kind: 'node', workspaceId: null }))
    for (const [itemId, workspaceId] of [
      ['sales-node', 'ws-sales'],
      ['ops-node', 'ws-ops'],
      ['p-node', null],
    ] as const) {
      await h.adapter.rewriteLibraryUsages({ itemId, projectId: 'p-101', workspaceId }, ['fmt'])
    }
    expect((await h.adapter.getLibraryUsages('u-ama', 'sales-fmt')).usedBy.visible).toMatchObject([
      { id: 'sales-node' },
    ])
    // Ops has no fmt of its own: it gets the project's, never Sales'.
    expect(
      (await h.adapter.getLibraryUsages('u-ama', 'p-fmt')).usedBy.visible.map((c) => c.id),
    ).toEqual(['ops-node', 'p-node'])
    expect(
      await h.adapter.resolveLibraryModules({ projectId: 'p-101', workspaceId: 'ws-ops' }, ['fmt']),
    ).toMatchObject([{ itemId: 'p-fmt' }])
  })

  it('keeps a project item from resolving to any workspace’s module', async () => {
    await create(item('sales-score', { slug: 'score' }))
    await create(item('p-node', { kind: 'node', workspaceId: null }))
    await h.adapter.rewriteLibraryUsages(
      { itemId: 'p-node', projectId: 'p-101', workspaceId: null },
      ['score'],
    )
    expect(
      await h.adapter.resolveLibraryModules({ projectId: 'p-101', workspaceId: null }, ['score']),
    ).toEqual([])
    expect((await h.adapter.getLibraryUsages('u-ama', 'p-node')).uses).toEqual([])
    expect(await h.adapter.deleteLibraryItemIfUnused('sales-score')).toBe(true)
  })

  it('names the consumers a viewer can open, counts the rest, and shows what each runs', async () => {
    await seedDeployAccount(h)
    await create(item('scoring', { slug: 'lead-scoring', workspaceId: null }))
    await h.db.insert(h.schema.libraryUsages).values([
      {
        id: 'u1',
        slug: 'lead-scoring',
        workflowId: 'wf-enrich',
        consumerItemId: null,
        createdAt: T0,
      },
    ])
    await h.db
      .insert(h.schema.deploymentLibraryVersions)
      .values({ deploymentId: 'd-2', itemId: 'scoring', slug: 'lead-scoring', version: '1.4.1' })
    expect((await h.adapter.getLibraryUsages('u-ama', 'scoring')).usedBy).toEqual({
      visible: [
        {
          kind: 'workflow',
          id: 'wf-enrich',
          name: 'Lead enrichment',
          workspace: { id: 'ws-sales', name: 'Sales' },
          runs: '1.4.1',
        },
      ],
      hiddenCount: 0,
    })
    expect((await h.adapter.getLibraryUsages('u-dee', 'scoring')).usedBy).toEqual({
      visible: [],
      hiddenCount: 1,
    })
  })

  it('builds the Library page from one statement for a workspace and for the project', async () => {
    await create(item('lead-scoring'))
    await create(item('post', { kind: 'node' }))
    await create(item('ops-fmt', { workspaceId: 'ws-ops' }))
    await create(item('p-mod', { workspaceId: null }))
    await publish('lead-scoring', '1.0.0')
    await h.db.insert(h.schema.installedNodes).values({
      id: 'in-1',
      organizationId: 'org-acme',
      nodeId: 'slack',
      version: '2.0.0',
      bundle: JSON.stringify({ definition: { name: 'Slack' } }),
      installedBy: 'u-ama',
      installedAt: T0,
      updatedAt: T0,
    })

    const sales = await h.adapter.getLibrarySummary({
      level: 'workspace',
      projectId: 'p-101',
      workspaceId: 'ws-sales',
      organizationId: 'org-acme',
    })
    expect(sales.own.map((r) => r.id)).toEqual(['lead-scoring', 'post'])
    expect(sales.own[0]).toMatchObject({
      kind: 'module',
      owner: { kind: 'workspace', id: 'ws-sales', name: 'Sales' },
      latestVersion: '1.0.0',
      usedBy: 0,
    })
    expect(sales.own[0]!.publishedAt).toMatch(/Z$/)
    expect(sales.own[0]!.updatedAt).toMatch(/Z$/)
    expect(sales.own[1]).toMatchObject({ latestVersion: null, publishedAt: null })
    // The project's own items, never another workspace's.
    expect(sales.fromProject.map((r) => r.id)).toEqual(['p-mod'])
    expect(sales.marketplace).toEqual([])
    expect(sales.counts).toEqual({ module: 2, node: 1, marketplace: 0 })

    const project = await h.adapter.getLibrarySummary({
      level: 'project',
      projectId: 'p-101',
      organizationId: 'org-acme',
    })
    expect(project.own.map((r) => r.id)).toEqual(['p-mod'])
    expect(project.fromProject).toEqual([])
    expect(project.marketplace).toEqual([{ nodeId: 'slack', name: 'Slack', version: '2.0.0' }])
    expect(project.counts).toEqual({ module: 1, node: 0, marketplace: 1 })
  })

  it('restores a version into the working copy and rewrites the uses in the same unit', async () => {
    await create(item('fmt', { slug: 'fmt' }))
    await create(item('m'))
    await h.adapter.restoreLibraryVersion({
      item: { itemId: 'm', projectId: 'p-101', workspaceId: 'ws-sales' },
      removePaths: ['index.ts'],
      files: [{ id: 'r1', itemId: 'm', path: 'lib/a.ts', source: 'a', hash: 'ha', size: 1 }],
      usageSlugs: ['fmt'],
    })
    expect((await h.adapter.listLibraryFileSummaries('m')).map((f) => f.path)).toEqual(['lib/a.ts'])
    expect((await h.adapter.getLibraryUsages('u-ama', 'fmt')).usedBy.visible).toMatchObject([
      { id: 'm' },
    ])
  })

  it('cascades a deleted consumer’s usage rows away', async () => {
    await create(item('scoring', { slug: 'lead-scoring' }))
    await h.db.insert(h.schema.libraryUsages).values({
      id: 'u1',
      slug: 'lead-scoring',
      workflowId: 'wf-draft',
      consumerItemId: null,
      createdAt: T0,
    })
    expect(await h.adapter.deleteLibraryItemIfUnused('scoring')).toBe(false)
    await h.adapter.deleteWorkflow('wf-draft')
    expect(await h.adapter.deleteLibraryItemIfUnused('scoring')).toBe(true)
  })

  it('resolves module slugs for a consumer with each one’s latest version', async () => {
    await create(item('fmt', { slug: 'fmt' }))
    await create(item('ops-score', { slug: 'score', workspaceId: 'ws-ops' }))
    await publish('fmt', '1.2.0', ['score'])
    expect(
      await h.adapter.resolveLibraryModules({ projectId: 'p-101', workspaceId: 'ws-sales' }, [
        'fmt',
        'score',
        'nope',
      ]),
    ).toEqual([{ slug: 'fmt', itemId: 'fmt', latestVersion: '1.2.0' }])
    expect(await h.adapter.listLibraryVersionImports('fmt')).toEqual([
      { version: '1.2.0', seq: 1, imports: ['score'] },
    ])
  })

  it('resolves usage when it is read: a module created or shadowed after its consumer still counts', async () => {
    await create(item('node-a', { kind: 'node', slug: 'node-a' }))
    await h.adapter.rewriteLibraryUsages(
      { itemId: 'node-a', projectId: 'p-101', workspaceId: 'ws-sales' },
      ['fmt'],
    )
    // The project gets an fmt first: the Sales node uses it.
    await create(item('p-fmt', { slug: 'fmt', workspaceId: null }))
    expect(await h.adapter.deleteLibraryItemIfUnused('p-fmt')).toBe(false)
    // Sales then gets its own fmt, which is what a deploy takes: it is the one in use now.
    await create(item('sales-fmt', { slug: 'fmt' }))
    expect(await h.adapter.deleteLibraryItemIfUnused('sales-fmt')).toBe(false)
    expect((await h.adapter.getLibraryUsages('u-ama', 'node-a')).uses).toMatchObject([
      { id: 'sales-fmt' },
    ])
    expect(await h.adapter.deleteLibraryItemIfUnused('p-fmt')).toBe(true)
  })

  it('refuses a publish judged against a latest that moved, and changes nothing else then', async () => {
    await create(
      item('post', {
        kind: 'node',
        files: [
          { id: 'n1', itemId: 'post', path: '1.0.1/node.json', source: '{}', hash: 'a', size: 2 },
        ],
      }),
    )
    await publish('post', '1.0.0')
    expect(
      await h.adapter.publishLibraryVersion(
        {
          id: 'post@late',
          item: { itemId: 'post', projectId: 'p-101', workspaceId: 'ws-sales' },
          version: '1.0.1',
          expectedSeq: 0,
          files: files(),
          imports: [],
          publishedBy: null,
          removePaths: ['1.0.1/node.json'],
          rewrite: null,
          usageSlugs: [],
        },
        1,
      ),
    ).toEqual({ ok: false, reason: 'conflict' })
    expect((await h.adapter.listLibraryVersions('post')).map((v) => v.version)).toEqual(['1.0.0'])
    expect((await h.adapter.listLibraryFileSummaries('post')).map((f) => f.path)).toEqual([
      '1.0.1/node.json',
    ])
  })

  it('moves a node’s slug freely, since workflows place it by id', async () => {
    await create(item('post', { kind: 'node', slug: 'post' }))
    await h.db.insert(h.schema.libraryUsages).values({
      id: 'u-node',
      workflowId: 'wf-enrich',
      consumerItemId: null,
      slug: null,
      nodeId: 'post',
      createdAt: T0,
    })
    expect(await h.adapter.updateLibraryItem('u-ama', 'post', { slug: 'post-v2' })).toMatchObject({
      ok: true,
      item: { slug: 'post-v2' },
    })
    expect(await h.adapter.deleteLibraryItemIfUnused('post')).toBe(false)
  })

  it('counts a node placement only from the node’s own workspace or the project', async () => {
    await create(item('ops-node', { kind: 'node', workspaceId: 'ws-ops' }))
    // A Sales workflow whose IR names Ops' node by id: out of reach, so it pins nothing.
    await h.db.insert(h.schema.libraryUsages).values({
      id: 'u-far',
      workflowId: 'wf-enrich',
      consumerItemId: null,
      slug: null,
      nodeId: 'ops-node',
      createdAt: T0,
    })
    expect((await h.adapter.getLibraryUsages('u-ama', 'ops-node')).usedBy.visible).toEqual([])
    expect(await h.adapter.deleteLibraryItemIfUnused('ops-node')).toBe(true)
  })

  it('names a publisher only while they are in the organization, and moves Updated on publish', async () => {
    await create(item('m'))
    const before = (
      await h.adapter.getLibrarySummary({
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        organizationId: 'org-acme',
      })
    ).own[0]!.updatedAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    await publish('m', '1.0.0')
    const after = (
      await h.adapter.getLibrarySummary({
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        organizationId: 'org-acme',
      })
    ).own[0]!.updatedAt
    expect(after > before).toBe(true)
    await h.db.delete(h.schema.member).where(eq(h.schema.member.id, 'm-1'))
    expect((await h.adapter.listLibraryVersions('m'))[0]!.publishedBy).toBeNull()
  })

  it('stops creating at the owner’s cap, writing neither the item nor its files', async () => {
    expect(await create(item('a'), 2)).toMatchObject({ id: 'a' })
    expect(await create(item('b'), 2)).toMatchObject({ id: 'b' })
    expect(await create(item('c'), 2)).toBeNull()
    expect(await h.count('library_items', "id = 'c'")).toBe(0)
    expect(await h.count('library_item_files', "item_id = 'c'")).toBe(0)
    // Another owner has its own room.
    expect(await create(item('d', { workspaceId: 'ws-ops' }), 2)).toMatchObject({ id: 'd' })
  })

  it('leaves the usage rows alone when a publish loses its race', async () => {
    await create(item('fmt', { slug: 'fmt' }))
    await create(item('m'))
    await h.adapter.rewriteLibraryUsages(
      { itemId: 'm', projectId: 'p-101', workspaceId: 'ws-sales' },
      [],
    )
    await publish('m', '1.0.0')
    const lost = await h.adapter.publishLibraryVersion(
      {
        id: 'm@late',
        item: { itemId: 'm', projectId: 'p-101', workspaceId: 'ws-sales' },
        version: '1.1.0',
        expectedSeq: 0,
        files: files(),
        imports: ['fmt'],
        publishedBy: null,
        removePaths: [],
        rewrite: null,
        usageSlugs: ['fmt'],
      },
      3,
    )
    expect(lost).toEqual({ ok: false, reason: 'conflict' })
    expect(await h.adapter.deleteLibraryItemIfUnused('fmt')).toBe(true)
  })
})
