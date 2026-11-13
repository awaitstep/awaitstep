import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import type { CreateLibraryItemData } from '../library-types.js'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// What a workflow reads of the Library: the custom nodes its palette offers,
// their templates, and the Overview's "redeploy to pick it up" lines.

const NOW = new Date('2026-10-28T12:00:00.000Z')

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
])('library reads for a workflow on %s', (_name, makeHarness) => {
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
    files: { path: string; source: string }[] = [],
  ) {
    const seq = (await h.adapter.listLibraryVersionImports(data.id))[0]?.seq ?? 0
    const outcome = await h.adapter.publishLibraryVersion(
      {
        id: `${data.id}@${version}`,
        item: { itemId: data.id, projectId: data.projectId, workspaceId: data.workspaceId },
        version,
        expectedSeq: seq,
        files: files.map((f) => ({ ...f, hash: `h-${f.path}`, size: f.source.length })),
        imports: [],
        publishedBy: 'u-ama',
        removePaths: [],
        rewrite: null,
        usageSlugs: [],
      },
      3,
    )
    expect(outcome).toMatchObject({ ok: true })
  }

  function nodeFiles(version: string, icon = true) {
    return [
      { path: 'node.json', source: `{"version":"${version}"}` },
      { path: 'template.ts', source: `export default async () => '${version}'` },
      ...(icon ? [{ path: 'icon.svg', source: '<svg/>' }] : []),
    ]
  }

  async function account(id: string, name: string, organizationId = 'org-acme') {
    await h.db.insert(h.schema.connections).values({
      id,
      organizationId,
      provider: 'cloudflare',
      name,
      credentials: '{}',
      createdBy: 'u-ama',
      createdAt: T0,
      updatedAt: T0,
    })
  }

  async function deploy(
    id: string,
    connectionId: string,
    libraryVersions: { itemId: string; slug: string; version: string }[],
    status = 'success',
  ) {
    await h.adapter.createDeployment({
      id,
      workflowId: 'wf-enrich',
      versionId: 'v-enrich-2',
      versionNumber: 2,
      connectionId,
      serviceName: 'svc',
      status,
      libraryVersions,
    })
  }

  async function updates() {
    return (await h.adapter.workflowPageSummary('wf-enrich', NOW))!.libraryUpdates
  }

  describe('custom nodes', () => {
    it('lists published nodes of the workspace and the project at their latest version', async () => {
      const digest = item('digest', { name: 'Sales digest' })
      const crm = item('crm', { name: 'Acme CRM', workspaceId: null })
      await add(digest)
      await add(crm)
      await publish(digest, '1.0.0', nodeFiles('1.0.0'))
      await publish(digest, '1.0.1', nodeFiles('1.0.1', false))
      await publish(crm, '1.2.0', nodeFiles('1.2.0'))
      expect(await h.adapter.listWorkflowCustomNodes('wf-enrich', 'workspace-and-project')).toEqual(
        [
          {
            itemId: 'crm',
            owner: 'project',
            version: '1.2.0',
            manifest: '{"version":"1.2.0"}',
            icon: '<svg/>',
          },
          {
            itemId: 'digest',
            owner: 'workspace',
            version: '1.0.1',
            manifest: '{"version":"1.0.1"}',
            icon: null,
          },
        ],
      )
      const templates = (ids: string[]) =>
        h.adapter
          .listWorkflowCustomNodeTemplates('wf-enrich', ids, 'workspace-and-project')
          .then((rows) => rows.map(({ itemId, template }) => ({ itemId, template })))
      expect(await templates(['crm', 'digest', 'crm'])).toEqual([
        { itemId: 'crm', template: "export default async () => '1.2.0'" },
        { itemId: 'digest', template: "export default async () => '1.0.1'" },
      ])
      // Only the nodes asked for, and nothing for an empty ask.
      expect(await templates(['digest'])).toEqual([
        { itemId: 'digest', template: "export default async () => '1.0.1'" },
      ])
      expect(
        await h.adapter.listWorkflowCustomNodeTemplates('wf-enrich', [], 'workspace-and-project'),
      ).toEqual([])
    })

    it('leaves out unpublished nodes, modules, and other workspaces’ and projects’ nodes', async () => {
      await add(item('draft'))
      const ops = item('ops-node', { workspaceId: 'ws-ops' })
      const other = item('other', { projectId: 'p-202', workspaceId: 'ws-202' })
      const mod = item('mod', { kind: 'module' })
      for (const data of [ops, other, mod]) {
        await add(data)
        await publish(data, '1.0.0', nodeFiles('1.0.0'))
      }
      expect(await h.adapter.listWorkflowCustomNodes('wf-enrich', 'workspace-and-project')).toEqual(
        [],
      )
      expect(
        await h.adapter.listWorkflowCustomNodeTemplates(
          'wf-enrich',
          ['draft', 'ops-node', 'other', 'mod'],
          'workspace-and-project',
        ),
      ).toEqual([])
      expect(await h.adapter.listWorkflowCustomNodes('wf-202', 'workspace-and-project')).toEqual([
        expect.objectContaining({ itemId: 'other' }),
      ])
    })

    it('leaves the project’s nodes out for a workspace-only reach', async () => {
      const digest = item('digest')
      const crm = item('crm', { workspaceId: null })
      for (const data of [digest, crm]) {
        await add(data)
        await publish(data, '1.0.0', nodeFiles('1.0.0'))
      }
      const nodes = await h.adapter.listWorkflowCustomNodes('wf-enrich', 'workspace-only')
      expect(nodes.map((n) => n.itemId)).toEqual(['digest'])
      const templates = await h.adapter.listWorkflowCustomNodeTemplates(
        'wf-enrich',
        ['digest', 'crm'],
        'workspace-only',
      )
      expect(templates.map((t) => t.itemId)).toEqual(['digest'])
    })

    it('returns nothing for an unknown workflow', async () => {
      const digest = item('digest')
      await add(digest)
      await publish(digest, '1.0.0', nodeFiles('1.0.0'))
      expect(await h.adapter.listWorkflowCustomNodes('nope', 'workspace-and-project')).toEqual([])
    })
  })

  describe('library updates on the page summary', () => {
    const scoring = () =>
      item('scoring', { kind: 'module', slug: 'lead-scoring', name: 'Lead scoring' })

    it('is empty when nothing was deployed with library code', async () => {
      expect(await updates()).toEqual([])
    })

    it('names the account whose live deployment runs an older version', async () => {
      await account('c-prod', 'Acme production')
      await account('c-stage', 'Acme staging')
      await add(scoring())
      await publish(scoring(), '1.4.1')
      await deploy('d-prod', 'c-prod', [{ itemId: 'scoring', slug: 'scoring', version: '1.4.1' }])
      await publish(scoring(), '1.4.2')
      await deploy('d-stage', 'c-stage', [{ itemId: 'scoring', slug: 'scoring', version: '1.4.2' }])
      expect(await updates()).toEqual([
        {
          itemId: 'scoring',
          name: 'lead-scoring',
          kind: 'module',
          latest: '1.4.2',
          runs: '1.4.1',
          accountId: 'c-prod',
          accountName: 'Acme production',
        },
      ])
    })

    it('reads only each account’s live deployment', async () => {
      await account('c-prod', 'Acme production')
      await add(scoring())
      await publish(scoring(), '1.4.1')
      await deploy('d-a', 'c-prod', [{ itemId: 'scoring', slug: 'scoring', version: '1.4.0' }])
      await deploy('d-b', 'c-prod', [{ itemId: 'scoring', slug: 'scoring', version: '1.4.1' }])
      // A newer failed deploy does not replace what the account runs.
      await deploy(
        'd-c',
        'c-prod',
        [{ itemId: 'scoring', slug: 'scoring', version: '1.3.0' }],
        'failed',
      )
      expect(await updates()).toEqual([])
    })

    it('still compares a version that was pruned, and covers every item the deploy bundled', async () => {
      await account('c-prod', 'Acme production')
      const helper = item('helper', {
        kind: 'module',
        slug: 'fmt',
        name: 'Formatting',
        workspaceId: null,
      })
      await add(scoring())
      await add(helper)
      await publish(scoring(), '1.0.0')
      await publish(helper, '2.0.0')
      await deploy('d-prod', 'c-prod', [
        { itemId: 'scoring', slug: 'scoring', version: '1.0.0' },
        { itemId: 'helper', slug: 'fmt', version: '2.0.0' },
      ])
      for (const v of ['1.0.1', '1.0.2', '1.0.3']) await publish(scoring(), v)
      await publish(helper, '2.1.0')
      expect((await updates()).map((u) => `${u.name} ${u.runs}→${u.latest}`)).toEqual([
        'fmt 2.0.0→2.1.0',
        'lead-scoring 1.0.0→1.0.3',
      ])
    })

    it('leaves out items no longer in the workflow’s reach, and deleted accounts', async () => {
      await account('c-prod', 'Acme production')
      await account('c-gone', 'Gone')
      const ops = item('ops-mod', { kind: 'module', workspaceId: 'ws-ops' })
      await add(scoring())
      await add(ops)
      await publish(scoring(), '1.0.0')
      await publish(ops, '1.0.0')
      await deploy('d-prod', 'c-prod', [{ itemId: 'ops-mod', slug: 'ops-mod', version: '0.9.0' }])
      await deploy('d-gone', 'c-gone', [{ itemId: 'scoring', slug: 'scoring', version: '0.9.0' }])
      await h.db.delete(h.schema.connections).where(eq(h.schema.connections.id, 'c-gone'))
      expect(await updates()).toEqual([])
    })
  })
})
