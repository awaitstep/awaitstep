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

// Where each version went is a record per account: what is live on each one,
// and a takedown that marks the account's rows instead of deleting them.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('per-account deployments on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  async function account(id: string, name: string) {
    await h.adapter.createConnection({
      id,
      organizationId: 'org-acme',
      createdBy: 'u-ama',
      provider: 'cloudflare',
      name,
      credentials: '{}',
    })
  }

  async function deploy(
    id: string,
    versionId: string,
    connectionId: string,
    createdAt: string,
    status = 'success',
  ) {
    await h.db.insert(h.schema.deployments).values({
      id,
      workflowId: 'wf-enrich',
      versionId,
      versionNumber: Number(versionId.split('-').pop()),
      connectionId,
      serviceName: id,
      status,
      createdBy: 'u-ben',
      createdAt,
    })
  }

  async function versions(...numbers: number[]) {
    await h.db.insert(h.schema.workflowVersions).values(
      numbers.map((n) => ({
        id: `v-enrich-${n}`,
        workflowId: 'wf-enrich',
        version: n,
        ir: '{}',
        createdAt: T0,
      })),
    )
  }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    // The seed's own deploys have no account; these tests deploy on two.
    await h.db.delete(h.schema.deployments).where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
    await account('c-a', 'Account A')
    await account('c-b', 'Account B')
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  describe('what is live on each account', () => {
    it('names each account’s newest successful deploy, with its version and who sent it', async () => {
      await deploy('d-a1', 'v-enrich-1', 'c-a', '2026-10-21T00:00:00.000Z')
      await deploy('d-b2', 'v-enrich-2', 'c-b', '2026-10-22T00:00:00.000Z')
      await deploy('d-b1', 'v-enrich-1', 'c-b', '2026-10-23T00:00:00.000Z')
      // A failed deploy on A changes nothing there.
      await deploy('d-a2', 'v-enrich-2', 'c-a', '2026-10-24T00:00:00.000Z', 'failed')

      expect(await h.adapter.listLiveDeployments('wf-enrich')).toEqual([
        {
          id: 'c-b',
          name: 'Account B',
          deploymentId: 'd-b1',
          serviceUrl: null,
          versionId: 'v-enrich-1',
          version: 1,
          versionLocked: false,
          deployedAt: '2026-10-23T00:00:00.000Z',
          deployedByName: 'Ben Okoro',
        },
        {
          id: 'c-a',
          name: 'Account A',
          deploymentId: 'd-a1',
          serviceUrl: null,
          versionId: 'v-enrich-1',
          version: 1,
          versionLocked: false,
          deployedAt: '2026-10-21T00:00:00.000Z',
          deployedByName: 'Ben Okoro',
        },
      ])
    })

    it('keeps the version number once the version is deleted', async () => {
      await versions(3)
      await deploy('d-a3', 'v-enrich-3', 'c-a', '2026-10-21T00:00:00.000Z')
      await h.db
        .delete(h.schema.workflowVersions)
        .where(eq(h.schema.workflowVersions.id, 'v-enrich-3'))
      expect(await h.adapter.listLiveDeployments('wf-enrich')).toMatchObject([
        { id: 'c-a', versionId: null, version: 3 },
      ])
    })

    it('knows whether the version live on one account is locked', async () => {
      await deploy('d-a1', 'v-enrich-1', 'c-a', '2026-10-21T00:00:00.000Z')
      await deploy('d-b2', 'v-enrich-2', 'c-b', '2026-10-22T00:00:00.000Z')
      await h.db
        .update(h.schema.workflowVersions)
        .set({ locked: 1 })
        .where(eq(h.schema.workflowVersions.id, 'v-enrich-1'))
      expect(await h.adapter.isLiveVersionLocked('wf-enrich', 'c-a')).toBe(true)
      expect(await h.adapter.isLiveVersionLocked('wf-enrich', 'c-b')).toBe(false)
    })
  })

  describe('one rule for live, everywhere', () => {
    it('counts a deploy on a deleted account as live nowhere, in the lists as on the page', async () => {
      await deploy('d-a2', 'v-enrich-2', 'c-a', '2026-10-21T00:00:00.000Z')
      await h.adapter.deleteConnection('c-a')
      expect(await h.adapter.listLiveDeployments('wf-enrich')).toEqual([])
      const { data } = await h.adapter.listWorkflowsWithStatus('p-101')
      expect(data.find((w) => w.id === 'wf-enrich')).toMatchObject({
        deployStatus: null,
        deployVersionId: null,
        deployedVersion: null,
      })
    })

    it('reads the lock of the version the account runs, unlocked once that version is gone', async () => {
      await versions(3)
      await deploy('d-a1', 'v-enrich-1', 'c-a', '2026-10-21T00:00:00.000Z')
      await deploy('d-a3', 'v-enrich-3', 'c-a', '2026-10-22T00:00:00.000Z')
      await h.db
        .update(h.schema.workflowVersions)
        .set({ locked: 1 })
        .where(eq(h.schema.workflowVersions.id, 'v-enrich-1'))
      // Deleted before the delete rule looked at every account: A still runs it.
      await h.db
        .delete(h.schema.workflowVersions)
        .where(eq(h.schema.workflowVersions.id, 'v-enrich-3'))
      expect(await h.adapter.isLiveVersionLocked('wf-enrich', 'c-a')).toBe(false)
    })

    it('names each deployment’s account in the list', async () => {
      await deploy('d-a1', 'v-enrich-1', 'c-a', '2026-10-21T00:00:00.000Z')
      const { data } = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
      expect(data.map((d) => d.connectionName)).toEqual(['Account A'])
    })

    it('never names another organization’s account', async () => {
      await h.adapter.createConnection({
        id: 'c-globex',
        organizationId: 'org-globex',
        createdBy: 'u-ama',
        provider: 'cloudflare',
        name: 'Globex prod',
        credentials: '{}',
      })
      await deploy('d-g', 'v-enrich-1', 'c-globex', '2026-10-21T00:00:00.000Z')
      const { data } = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
      expect(data.map((d) => [d.id, d.connectionName])).toEqual([['d-g', null]])
    })
  })

  describe('a takedown on one account', () => {
    beforeEach(async () => {
      await deploy('d-a1', 'v-enrich-1', 'c-a', '2026-10-21T00:00:00.000Z')
      await deploy('d-a2', 'v-enrich-2', 'c-a', '2026-10-22T00:00:00.000Z')
      await deploy('d-b2', 'v-enrich-2', 'c-b', '2026-10-23T00:00:00.000Z')
    })

    it('marks that account’s rows taken down, by whom and when, and keeps them listed', async () => {
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-a',
        '2026-11-01T00:00:00.000Z',
        'u-ama',
      )
      const { data } = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
      expect(data.map((d) => [d.id, d.status, d.version, d.connectionId, d.takenDownBy])).toEqual([
        ['d-b2', 'success', 2, 'c-b', null],
        ['d-a2', 'taken_down', 2, 'c-a', 'u-ama'],
        ['d-a1', 'taken_down', 1, 'c-a', 'u-ama'],
      ])
      expect(data.find((d) => d.id === 'd-a2')?.takenDownAt).toEqual(expect.any(String))
      expect((await h.adapter.listLiveDeployments('wf-enrich')).map((l) => l.id)).toEqual(['c-b'])
      // A trigger can no longer name A.
      expect(await h.adapter.getConnectionDeployedWith('c-a', 'org-acme', 'wf-enrich')).toBeNull()
    })

    it('leaves a deploy that finished after it started live, and a failed one failed', async () => {
      await deploy('d-a0', 'v-enrich-1', 'c-a', '2026-10-20T12:00:00.000Z', 'failed')
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-a',
        '2026-10-21T12:00:00.000Z',
        'u-ama',
      )
      const status = async (id: string) =>
        (
          await h.db
            .select({ status: h.schema.deployments.status })
            .from(h.schema.deployments)
            .where(eq(h.schema.deployments.id, id))
        )[0]?.status
      expect(await status('d-a1')).toBe('taken_down')
      expect(await status('d-a2')).toBe('success')
      expect(await status('d-a0')).toBe('failed')
    })

    it('keeps the workflow deployed in the lists while another account still runs it', async () => {
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-b',
        '2026-11-01T00:00:00.000Z',
        'u-ama',
      )
      let { data } = await h.adapter.listWorkflowsWithStatus('p-101')
      expect(data.find((w) => w.id === 'wf-enrich')).toMatchObject({
        deployStatus: 'success',
        deployVersionId: 'v-enrich-2',
        deployedVersion: 2,
      })
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-a',
        '2026-11-01T00:00:00.000Z',
        'u-ama',
      )
      ;({ data } = await h.adapter.listWorkflowsWithStatus('p-101'))
      expect(data.find((w) => w.id === 'wf-enrich')).toMatchObject({
        deployStatus: 'taken_down',
        deployVersionId: null,
        deployedVersion: null,
      })
    })
  })

  describe('what a save may overwrite', () => {
    beforeEach(async () => {
      await versions(3)
    })

    it('a latest version never deployed is saved over', async () => {
      await deploy('d-a2', 'v-enrich-2', 'c-a', '2026-10-21T00:00:00.000Z')
      const latest = await h.adapter.getLatestVersionForSave('wf-enrich')
      expect([latest?.version.id, latest?.everDeployed]).toEqual(['v-enrich-3', false])
    })

    it('a latest version deployed on any account is kept, even after another account rolled back', async () => {
      await deploy('d-a3', 'v-enrich-3', 'c-a', '2026-10-21T00:00:00.000Z')
      await deploy('d-b1', 'v-enrich-1', 'c-b', '2026-10-22T00:00:00.000Z')
      expect((await h.adapter.getLatestVersionForSave('wf-enrich'))?.everDeployed).toBe(true)
    })

    it('a latest version taken down everywhere is kept', async () => {
      await deploy('d-a3', 'v-enrich-3', 'c-a', '2026-10-21T00:00:00.000Z')
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-a',
        '2026-11-01T00:00:00.000Z',
        'u-ama',
      )
      expect((await h.adapter.getLatestVersionForSave('wf-enrich'))?.everDeployed).toBe(true)
    })

    it('a failed deploy of it does not count', async () => {
      await deploy('d-a3', 'v-enrich-3', 'c-a', '2026-10-21T00:00:00.000Z', 'failed')
      expect((await h.adapter.getLatestVersionForSave('wf-enrich'))?.everDeployed).toBe(false)
    })

    it('answers null for a workflow with no versions', async () => {
      expect(await h.adapter.getLatestVersionForSave('wf-draft')).toBeNull()
    })
  })

  describe('which version counts as live for a delete', () => {
    beforeEach(async () => {
      await versions(3)
    })

    it('one live on any account is live; one replaced or taken down is history', async () => {
      await deploy('d-a1', 'v-enrich-1', 'c-a', '2026-10-21T00:00:00.000Z')
      await deploy('d-b2', 'v-enrich-2', 'c-b', '2026-10-22T00:00:00.000Z')
      await deploy('d-b3', 'v-enrich-3', 'c-b', '2026-10-23T00:00:00.000Z')
      const live = async (id: string) =>
        (await h.adapter.getVersionDeleteCheck(id, 'wf-enrich'))?.isLive
      // v1 is older than the newest deploy, but still what A runs.
      expect(await live('v-enrich-1')).toBe(true)
      expect(await live('v-enrich-2')).toBe(false)
      expect(await live('v-enrich-3')).toBe(true)
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-a',
        '2026-11-01T00:00:00.000Z',
        'u-ama',
      )
      expect(await live('v-enrich-1')).toBe(false)
    })
  })
})
