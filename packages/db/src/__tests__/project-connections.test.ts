import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq, inArray } from 'drizzle-orm'
import type { ConnectionWrite, ProjectConnectionCreate } from '../types.js'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// A project's accounts (23a–23c) on every driver, over the shared seed —
// Acme (Ama owner, Ben admin) with Project 101 (Sales, Ops) and Project 202,
// Globex with its own project — plus Dan, a member who admins Sales only.
// Acme's accounts: Prod serves every project, Sandbox serves Project 101 by
// name, Data serves Project 202 only.

const CREDS = (suffix: string) => JSON.stringify({ accountId: suffix.repeat(32), apiToken: 'tok' })

function account(id: string, over: Partial<ConnectionWrite> = {}) {
  return {
    id,
    organizationId: 'org-acme',
    createdBy: 'u-ben',
    provider: 'cloudflare',
    name: id,
    credentials: CREDS('a'),
    ...over,
  }
}

function owned(over: Partial<ProjectConnectionCreate> = {}): ProjectConnectionCreate {
  return {
    id: 'c-own',
    projectId: 'p-101',
    organizationId: 'org-acme',
    createdBy: 'u-dan',
    provider: 'cloudflare',
    name: 'Checkout staging',
    credentials: CREDS('b'),
    makeDefault: false,
    ...over,
  }
}

async function addDan(h: Harness) {
  const s = h.schema
  await h.db.insert(s.user).values([
    {
      id: 'u-dan',
      name: 'Dan Ito',
      email: 'dan@acme.test',
      emailVerified: true,
      createdAt: T0,
      updatedAt: T0,
    },
  ])
  await h.db
    .insert(s.member)
    .values([
      { id: 'm-dan', userId: 'u-dan', organizationId: 'org-acme', role: 'member', createdAt: T0 },
    ])
  await h.db.insert(s.workspaceMembers).values([
    {
      workspaceId: 'ws-sales',
      userId: 'u-dan',
      role: 'admin',
      createdBy: 'u-ama',
      createdAt: T0,
    },
  ])
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('project connections on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    await addDan(h)
    await h.adapter.createConnection(account('c-prod', { name: 'Acme production' }))
    await h.adapter.createConnection(
      account('c-sandbox', {
        name: 'Marketing sandbox',
        allProjects: false,
        projectIds: ['p-101'],
      }),
    )
    await h.adapter.createConnection(
      account('c-data', { name: 'Data platform', allProjects: false, projectIds: ['p-202'] }),
    )
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  const add = (connectionIds: string[], projectId = 'p-101', organizationId = 'org-acme') =>
    h.adapter.addProjectConnections({
      projectId,
      organizationId,
      connectionIds,
      createdBy: 'u-ama',
    })

  describe('adding organization accounts', () => {
    it('adds only accounts that serve the project, the first becoming its default', async () => {
      const result = await add(['c-sandbox', 'c-prod', 'c-data'])
      expect(result.added.map((a) => a.id).sort()).toEqual(['c-prod', 'c-sandbox'])
      // Picked by name: Acme production before Marketing sandbox.
      expect(result.defaultId).toBe('c-prod')
      expect(await h.count('project_connections', "project_id = 'p-101'")).toBe(2)
    })

    it('keeps the default it has, and adds nothing twice', async () => {
      await add(['c-sandbox'])
      const again = await add(['c-sandbox', 'c-prod'])
      expect(again.added.map((a) => a.id)).toEqual(['c-prod'])
      expect(again.defaultId).toBeNull()
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.find((c) => c.isDefault)?.id).toBe('c-sandbox')
    })

    it('never adds another organization’s account, or another project’s own', async () => {
      await h.adapter.createProjectConnection(owned({ projectId: 'p-202', id: 'c-202' }))
      expect((await add(['c-prod'], 'p-g', 'org-globex')).added).toEqual([])
      expect((await add(['c-202'])).added).toEqual([])
      expect((await add(['c-prod'], 'p-101', 'org-globex')).added).toEqual([])
    })
  })

  describe('connecting a new account from the project', () => {
    it('owns it, makes it the default when the project has none, and hides it from the org list', async () => {
      const made = await h.adapter.createProjectConnection(owned())
      expect(made).toEqual({ id: 'c-own', name: 'Checkout staging', isDefault: true })
      const conn = await h.adapter.getConnectionForProject('c-own', 'org-acme', 'p-101')
      expect(conn?.covered).toBe(true)
      expect(conn?.connection.projectId).toBe('p-101')
      expect((await h.adapter.getConnectionForProject('c-own', 'org-acme', 'p-202'))?.covered).toBe(
        false,
      )
      const orgList = await h.adapter.listConnections('org-acme', { visibleTo: 'all' })
      expect(orgList.data.map((c) => c.id)).not.toContain('c-own')
      const available = await h.adapter.listAvailableProjectConnections('p-202', 'org-acme')
      expect(available.map((c) => c.id)).not.toContain('c-own')
    })

    it('takes over the default when asked, and leaves it otherwise', async () => {
      await add(['c-prod'])
      await h.adapter.createProjectConnection(owned({ id: 'c-own-1' }))
      let listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.find((c) => c.isDefault)?.id).toBe('c-prod')
      await h.adapter.createProjectConnection(owned({ id: 'c-own-2', makeDefault: true }))
      listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.filter((c) => c.isDefault).map((c) => c.id)).toEqual(['c-own-2'])
    })

    it('writes nothing for a project of another organization', async () => {
      expect(await h.adapter.createProjectConnection(owned({ projectId: 'p-g' }))).toBeNull()
      expect(await h.count('connections', "id = 'c-own'")).toBe(0)
      expect(await h.count('project_connections', "connection_id = 'c-own'")).toBe(0)
    })
  })

  describe('the project’s page', () => {
    it('lists its accounts with scope, default, usage and where each workspace deploys', async () => {
      await add(['c-prod', 'c-sandbox'])
      await h.adapter.createProjectConnection(owned())
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-prod' })
        .where(inArray(h.schema.deployments.id, ['d-1', 'd-2', 'd-3']))
      await h.adapter.setWorkspaceConnection({
        projectId: 'p-101',
        workspaceId: 'ws-ops',
        connectionId: 'c-own',
        setBy: 'u-ama',
      })
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.map((c) => c.id)).toEqual(['c-prod', 'c-own', 'c-sandbox'])
      expect(listed?.connections[0]).toMatchObject({
        name: 'Acme production',
        scope: 'shared',
        isDefault: true,
        available: true,
        createdByName: 'Ben Okoro',
        credentials: CREDS('a'),
        // d-3 failed: only the successful two count.
        deployments: { count: 2, lastAt: '2026-10-22T00:00:00.000Z' },
        deployedFrom: ['Sales'],
      })
      expect(listed?.connections[1]).toMatchObject({
        scope: 'project',
        isDefault: false,
        createdByName: 'Dan Ito',
        deployments: { count: 0, lastAt: null },
        deployedFrom: [],
      })
      expect(listed?.workspaces).toEqual([
        {
          workspaceId: 'ws-ops',
          name: 'Ops',
          connectionId: 'c-own',
          connectionName: 'Checkout staging',
          source: 'override',
          lastDeployAt: null,
        },
        {
          workspaceId: 'ws-sales',
          name: 'Sales',
          connectionId: 'c-prod',
          connectionName: 'Acme production',
          source: 'default',
          lastDeployAt: '2026-10-22T00:00:00.000Z',
        },
      ])
    })

    it('shows a reader only the workspaces they can open', async () => {
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme', 'u-dan')
      expect(listed?.workspaces.map((w) => w.workspaceId)).toEqual(['ws-sales'])
      expect(listed?.workspaces[0]?.source).toBe('none')
    })

    it('keeps an account restricted away from the project listed, but no longer available', async () => {
      await add(['c-sandbox'])
      await h.adapter.updateConnection('c-sandbox', {
        organizationId: 'org-acme',
        projectIds: ['p-202'],
      })
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections[0]).toMatchObject({ id: 'c-sandbox', available: false })
      // An account it can't use is no default: Sales has nowhere to deploy.
      expect(listed?.workspaces.every((w) => w.source === 'none')).toBe(true)
      expect(
        (await h.adapter.getConnectionForProject('c-sandbox', 'org-acme', 'p-101'))?.covered,
      ).toBe(false)
    })

    it('answers nothing for another organization’s project', async () => {
      expect(await h.adapter.listProjectConnections('p-g', 'org-acme')).toBeNull()
    })
  })

  describe('what Add connection lists', () => {
    it('marks each organization account added, available or restricted, naming only visible projects', async () => {
      await add(['c-prod'])
      const forAma = await h.adapter.listAvailableProjectConnections('p-101', 'org-acme', 'u-ama')
      expect(forAma.map((c) => [c.id, c.state, c.restrictedTo])).toEqual([
        ['c-prod', 'added', []],
        ['c-data', 'restricted', ['Project 202']],
        ['c-sandbox', 'available', []],
      ])
      // Dan can't see Project 202: the account stays restricted, the project unnamed.
      const forDan = await h.adapter.listAvailableProjectConnections('p-101', 'org-acme', 'u-dan')
      expect(forDan.find((c) => c.id === 'c-data')?.restrictedTo).toEqual([])
    })
  })

  describe('the default and workspace overrides', () => {
    it('moves the default to another of the project’s accounts only', async () => {
      await add(['c-prod', 'c-sandbox'])
      expect(await h.adapter.setProjectDefaultConnection('p-101', 'c-sandbox')).toBe(
        'Marketing sandbox',
      )
      // Not the project's: refused, and the default it had stays.
      expect(await h.adapter.setProjectDefaultConnection('p-101', 'c-data')).toBeNull()
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.filter((c) => c.isDefault).map((c) => c.id)).toEqual(['c-sandbox'])
    })

    it('sets a workspace’s own account, clears it, and refuses what isn’t the project’s', async () => {
      await add(['c-prod', 'c-sandbox'])
      const set = (workspaceId: string, connectionId: string | null) =>
        h.adapter.setWorkspaceConnection({
          projectId: 'p-101',
          workspaceId,
          connectionId,
          setBy: 'u-ama',
        })
      expect(await set('ws-sales', 'c-sandbox')).toEqual({
        workspaceName: 'Sales',
        connectionName: 'Marketing sandbox',
        changed: true,
      })
      expect(await set('ws-sales', 'c-prod')).toMatchObject({ changed: true })
      expect(await h.count('workspace_connections')).toBe(1)
      expect(await set('ws-sales', 'c-data')).toEqual({
        workspaceName: 'Sales',
        connectionName: null,
        changed: false,
      })
      // Another project's workspace is not found.
      expect(await set('ws-202', 'c-prod')).toEqual({
        workspaceName: null,
        connectionName: null,
        changed: false,
      })
      expect(await set('ws-sales', null)).toMatchObject({ workspaceName: 'Sales', changed: true })
      expect(await h.count('workspace_connections')).toBe(0)
    })

    it('offers Deploy the project’s accounts, the workspace’s own chosen over the default', async () => {
      await add(['c-prod', 'c-sandbox'])
      await h.adapter.setWorkspaceConnection({
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        connectionId: 'c-sandbox',
        setBy: 'u-ama',
      })
      const sales = await h.adapter.listDeployTargets('p-101', 'ws-sales')
      expect(sales.map((t) => [t.id, t.chosen])).toEqual([
        ['c-prod', false],
        ['c-sandbox', true],
      ])
      const ops = await h.adapter.listDeployTargets('p-101', 'ws-ops')
      expect(ops.find((t) => t.chosen)?.id).toBe('c-prod')
      expect(await h.adapter.listDeployTargets('p-202', 'ws-202')).toEqual([])
    })
  })

  describe('removing an account', () => {
    it('takes an added one off the project, its workspaces back on the default', async () => {
      await add(['c-prod', 'c-sandbox'])
      await h.adapter.setWorkspaceConnection({
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        connectionId: 'c-sandbox',
        setBy: 'u-ama',
      })
      expect(await h.adapter.removeProjectConnection('p-101', 'c-sandbox')).toEqual({
        name: 'Marketing sandbox',
        owned: false,
        wasDefault: false,
        workspacesCleared: 1,
        blockedBy: [],
        blockedElsewhere: 0,
      })
      expect(await h.count('connections', "id = 'c-sandbox'")).toBe(1)
      expect(await h.count('workspace_connections')).toBe(0)
      expect(await h.adapter.removeProjectConnection('p-101', 'c-sandbox')).toBeNull()
    })

    it('deletes an owned one, and the one account left becomes the default', async () => {
      await add(['c-prod'])
      await h.adapter.createProjectConnection(owned({ makeDefault: true }))
      expect(await h.adapter.removeProjectConnection('p-101', 'c-own')).toMatchObject({
        owned: true,
        wasDefault: true,
      })
      expect(await h.count('connections', "id = 'c-own'")).toBe(0)
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.map((c) => [c.id, c.isDefault])).toEqual([['c-prod', true]])
    })

    it('leaves no default when the default goes and more than one is left', async () => {
      await add(['c-prod', 'c-sandbox'])
      await h.adapter.createProjectConnection(owned())
      await h.adapter.removeProjectConnection('p-101', 'c-prod')
      const listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.some((c) => c.isDefault)).toBe(false)
    })
  })

  describe('review round (2026-11-01)', () => {
    const deployWith = (connectionId: string) =>
      h.db
        .update(h.schema.deployments)
        .set({ connectionId })
        .where(inArray(h.schema.deployments.id, ['d-1', 'd-2']))

    it('names in deployedFrom only the workspaces the reader can open', async () => {
      await add(['c-prod'])
      await deployWith('c-prod')
      // d-1/d-2 are Sales's; move one workflow's deploy into Ops, which Dan can't open.
      await h.db
        .update(h.schema.workflows)
        .set({ workspaceId: 'ws-ops' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      const forAma = await h.adapter.listProjectConnections('p-101', 'org-acme', 'u-ama')
      expect(forAma?.connections[0]?.deployedFrom).toEqual(['Ops'])
      const forDan = await h.adapter.listProjectConnections('p-101', 'org-acme', 'u-dan')
      expect(forDan?.connections[0]?.deployedFrom).toEqual([])
    })

    it('keeps an owned account workflows are still deployed with, naming them', async () => {
      await h.adapter.createProjectConnection(owned())
      await deployWith('c-own')
      await h.db
        .update(h.schema.workflows)
        .set({ currentVersionId: 'v-enrich-2' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      const refused = await h.adapter.removeProjectConnection('p-101', 'c-own')
      expect(refused?.blockedBy).toEqual(['Lead enrichment'])
      expect(await h.count('connections', "id = 'c-own'")).toBe(1)
      expect(await h.count('project_connections', "connection_id = 'c-own'")).toBe(1)
      // Taken down: nothing is left running on it.
      await h.db
        .update(h.schema.workflows)
        .set({ currentVersionId: null })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      expect(await h.adapter.removeProjectConnection('p-101', 'c-own')).toMatchObject({
        owned: true,
        blockedBy: [],
        blockedElsewhere: 0,
      })
      expect(await h.count('connections', "id = 'c-own'")).toBe(0)
    })

    it('keeps an own account a workflow moved to another project still runs on, without naming it', async () => {
      await h.adapter.createProjectConnection(owned())
      await deployWith('c-own')
      await h.db
        .update(h.schema.workflows)
        .set({ currentVersionId: 'v-enrich-2', projectId: 'p-202', workspaceId: 'ws-202' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      expect(await h.adapter.removeProjectConnection('p-101', 'c-own')).toMatchObject({
        blockedBy: [],
        blockedElsewhere: 1,
      })
      expect(await h.count('connections', "id = 'c-own'")).toBe(1)
    })

    it('counts deployments only from the workspaces the reader can open', async () => {
      await add(['c-prod'])
      await deployWith('c-prod')
      await h.db
        .update(h.schema.workflows)
        .set({ workspaceId: 'ws-ops' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      const forAma = await h.adapter.listProjectConnections('p-101', 'org-acme', 'u-ama')
      expect(forAma?.connections[0]?.deployments.count).toBe(2)
      const forDan = await h.adapter.listProjectConnections('p-101', 'org-acme', 'u-dan')
      expect(forDan?.connections[0]?.deployments).toEqual({ count: 0, lastAt: null })
    })

    it('removes a shared account however it is deployed: its credentials stay in the org', async () => {
      await add(['c-prod'])
      await deployWith('c-prod')
      await h.db
        .update(h.schema.workflows)
        .set({ currentVersionId: 'v-enrich-2' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      expect(await h.adapter.removeProjectConnection('p-101', 'c-prod')).toMatchObject({
        owned: false,
        blockedBy: [],
      })
    })

    it('makes no default when every account asked for was already added', async () => {
      await add(['c-prod', 'c-sandbox'])
      await h.db
        .update(h.schema.projectConnections)
        .set({ isDefault: false })
        .where(eq(h.schema.projectConnections.projectId, 'p-101'))
      const again = await add(['c-sandbox'])
      expect(again).toEqual({ added: [], alreadyAdded: ['c-sandbox'], defaultId: null })
      expect(await h.count('project_connections', "project_id = 'p-101' and is_default")).toBe(0)
    })

    it('treats a default the project can no longer use as none', async () => {
      await add(['c-sandbox'])
      // Restricted away from Project 101: still flagged, no longer usable.
      await h.adapter.updateConnection('c-sandbox', {
        organizationId: 'org-acme',
        projectIds: ['p-202'],
      })
      let listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections[0]).toMatchObject({ isDefault: false, available: false })
      const result = await add(['c-prod'])
      expect(result.defaultId).toBe('c-prod')
      listed = await h.adapter.listProjectConnections('p-101', 'org-acme')
      expect(listed?.connections.filter((c) => c.isDefault).map((c) => c.id)).toEqual(['c-prod'])
      // A new own account with makeDefault off takes the dead default's place too.
      await h.adapter.updateConnection('c-prod', {
        organizationId: 'org-acme',
        projectIds: ['p-202'],
      })
      expect((await h.adapter.createProjectConnection(owned()))?.isDefault).toBe(true)
    })

    it('lists the accounts a workflow went out with, latest first, whether or not the project has them', async () => {
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-prod' })
        .where(eq(h.schema.deployments.id, 'd-1'))
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-sandbox' })
        .where(eq(h.schema.deployments.id, 'd-2'))
      const named = async (workflowId: string) =>
        (await h.adapter.listLiveDeployments(workflowId)).map(({ id, name }) => ({ id, name }))
      expect(await named('wf-enrich')).toEqual([
        { id: 'c-sandbox', name: 'Marketing sandbox' },
        { id: 'c-prod', name: 'Acme production' },
      ])
      // d-3 failed: a failed deploy names no account a trigger could use.
      expect(await named('wf-sync')).toEqual([])
    })
  })

  describe('taking a workflow down on one account', () => {
    it('marks that account’s deployments taken down and leaves the other account’s', async () => {
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-prod' })
        .where(eq(h.schema.deployments.id, 'd-1'))
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-sandbox' })
        .where(inArray(h.schema.deployments.id, ['d-2', 'd-3']))
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-sandbox',
        '2026-11-01T00:00:00.000Z',
        'u-ama',
      )
      expect(await h.count('deployments', "workflow_id = 'wf-enrich'")).toBe(2)
      expect(await h.count('deployments', "id = 'd-2' and status = 'taken_down'")).toBe(1)
      expect(await h.count('deployments', "id = 'd-1' and status = 'success'")).toBe(1)
      // Another workflow's row on the same account is untouched.
      expect(await h.count('deployments', "id = 'd-3' and status = 'failed'")).toBe(1)
      expect((await h.adapter.listLiveDeployments('wf-enrich')).map((l) => l.id)).toEqual([
        'c-prod',
      ])
    })

    it('keeps a deployment made after the takedown started', async () => {
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-sandbox' })
        .where(inArray(h.schema.deployments.id, ['d-1', 'd-2']))
      // d-1 is from 21 Oct, d-2 from 22 Oct: the takedown started in between.
      await h.adapter.takeDownDeploymentsOnConnection(
        'wf-enrich',
        'c-sandbox',
        '2026-10-21T12:00:00.000Z',
        'u-ama',
      )
      expect(await h.count('deployments', "id = 'd-1' and status = 'taken_down'")).toBe(1)
      expect(await h.count('deployments', "id = 'd-2' and status = 'success'")).toBe(1)
    })
  })

  describe('a project that moves or goes', () => {
    it('takes its own accounts to the new organization and leaves the old one’s behind', async () => {
      await add(['c-prod', 'c-sandbox'])
      await h.adapter.createProjectConnection(owned({ makeDefault: true }))
      // Ama runs Globex too, so she may move the project there.
      await h.db.update(h.schema.member).set({ role: 'admin' }).where(eq(h.schema.member.id, 'm-3'))
      await h.adapter.moveProjectToOrganization('p-101', 'org-acme', 'org-globex', 'u-ama')
      const listed = await h.adapter.listProjectConnections('p-101', 'org-globex')
      expect(listed?.connections.map((c) => c.id)).toEqual(['c-own'])
      expect(
        (await h.adapter.getConnectionForProject('c-own', 'org-globex', 'p-101'))?.covered,
      ).toBe(true)
      expect(await h.count('connection_projects', "project_id = 'p-101'")).toBe(0)
    })

    it('deletes its own accounts with it', async () => {
      await h.adapter.createProjectConnection(owned())
      expect(await h.adapter.deleteProject('p-101', 'org-acme')).toBe(true)
      expect(await h.count('connections', "id = 'c-own'")).toBe(0)
    })
  })
})
