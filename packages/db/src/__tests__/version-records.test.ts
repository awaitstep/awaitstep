import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// The workflow's version is ours (its latest save); which version went to which
// account is a record that outlives deleting the version. And the newest three
// versions stay, so a bad deploy can always be rolled back.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('version records on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  async function deleteVersion(id: string) {
    await h.db.delete(h.schema.workflowVersions).where(eq(h.schema.workflowVersions.id, id))
  }

  describe('once a deployed version is deleted', () => {
    it('the deployments list still names its number, with no version to roll back to', async () => {
      await deleteVersion('v-enrich-1')
      const { data } = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
      expect(data.map((d) => [d.id, d.version, d.versionId])).toEqual([
        ['d-2', 2, 'v-enrich-2'],
        ['d-1', 1, null],
      ])
    })

    it('the workflow list still names the deployed number', async () => {
      await deleteVersion('v-enrich-2')
      const { data } = await h.adapter.listWorkflowsWithStatus('p-101')
      expect(data.find((w) => w.id === 'wf-enrich')?.deployedVersion).toBe(2)
    })

    it('a trigger there still gets the number', async () => {
      await h.adapter.createConnection({
        id: 'c-1',
        organizationId: 'org-acme',
        createdBy: 'u-ama',
        provider: 'cloudflare',
        name: 'Prod',
        credentials: '{}',
      })
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-1' })
        .where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
      await deleteVersion('v-enrich-2')
      const deployed = await h.adapter.getConnectionDeployedWith('c-1', 'org-acme', 'wf-enrich')
      expect([deployed?.deployedVersionId, deployed?.deployedVersionNumber]).toEqual([null, 2])
    })
  })

  describe('what decides whether a version may be deleted', () => {
    beforeEach(async () => {
      await h.db.insert(h.schema.workflowVersions).values(
        [3, 4, 5].map((n) => ({
          id: `v-enrich-${n}`,
          workflowId: 'wf-enrich',
          version: n,
          ir: '{}',
          createdAt: T0,
        })),
      )
      await h.db
        .update(h.schema.workflows)
        .set({ currentVersionId: 'v-enrich-5' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
    })

    it('counts the newer versions and knows the current and the live one', async () => {
      // d-2 (v2) is wf-enrich's newest successful deploy.
      const check = (id: string) => h.adapter.getVersionDeleteCheck(id, 'wf-enrich')
      expect(await check('v-enrich-1')).toEqual({
        version: 1,
        locked: false,
        newerVersions: 4,
        isCurrent: false,
        isLive: false,
      })
      expect(await check('v-enrich-2')).toMatchObject({ newerVersions: 3, isLive: true })
      expect(await check('v-enrich-3')).toMatchObject({ newerVersions: 2, isLive: false })
      expect(await check('v-enrich-5')).toMatchObject({ newerVersions: 0, isCurrent: true })
    })

    it('sees a lock, and answers null for another workflow’s version', async () => {
      await h.db
        .update(h.schema.workflowVersions)
        .set({ locked: 1 })
        .where(eq(h.schema.workflowVersions.id, 'v-enrich-1'))
      expect((await h.adapter.getVersionDeleteCheck('v-enrich-1', 'wf-enrich'))?.locked).toBe(true)
      expect(await h.adapter.getVersionDeleteCheck('v-sync-1', 'wf-enrich')).toBeNull()
    })
  })
})
