import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCESS_REASONS,
  PROJECT_CONNECTION_REASONS,
  type AvailableConnection,
  type ConnectionSummary,
  type DeployConnections,
  type ProjectConnections,
} from '@awaitstep/ir'
import { CONNECTION_NOT_SERVING, prepareDeploy } from '../lib/deploy-prepare.js'
import { stubCloudflare, type CloudflareAnswer } from './fixtures/cloudflare.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// A project's Cloudflare accounts on the API (23a–23c), on a real database:
// who may read and change them, adding shared accounts, connecting the
// project's own with the token checked first, the default and workspace
// overrides, removing, and what all of that holds Deploy to.
//
// Acme: Ama owner, Ben admin; Project 101 (Sales, Ops) with Dan a project
// member and Fay its project admin here; Project 202. Acme's org accounts:
// Prod (every project) and Data (Project 202 only).

const ACCOUNT = 'a'.repeat(32)
const OWN_ACCOUNT = 'b'.repeat(32)

describe('project connections on the API', () => {
  let h: SqliteApp
  let answer: CloudflareAnswer
  let prod: string
  let data: string

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
    await h.seed.projectGrant('p-101', 'u-fay', 'admin')
    answer = {
      status: 'active',
      accounts: [
        { id: ACCOUNT, name: 'Acme' },
        { id: OWN_ACCOUNT, name: 'Checkout' },
      ],
    }
    stubCloudflare(() => answer)
    prod = (await orgConnect('Acme production')).id
    data = (await orgConnect('Data platform', { projectIds: ['p-202'] })).id
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const call = (who: string, path: string, init: RequestInit = {}) =>
    h.app.request(`/api${path}`, h.as(who, init))
  const send = (who: string, path: string, body: unknown, method = 'POST') =>
    call(who, path, h.json(body, method))

  async function orgConnect(name: string, over: Record<string, unknown> = {}) {
    const res = await send('u-ben', '/connections?org=acme', {
      provider: 'cloudflare',
      name,
      credentials: { accountId: ACCOUNT, apiToken: 'tok' },
      ...over,
    })
    expect(res.status).toBe(201)
    return (await res.json()) as ConnectionSummary
  }

  async function page(who = 'u-fay'): Promise<ProjectConnections> {
    const res = await call(who, '/projects/p-101/connections')
    expect(res.status).toBe(200)
    return res.json()
  }

  const add = (connectionIds: string[], who = 'u-fay') =>
    send(who, '/projects/p-101/connections', { connectionIds })

  const connectOwn = (who = 'u-fay', over: Record<string, unknown> = {}) =>
    send(who, '/projects/p-101/connections/new', {
      name: 'Checkout staging',
      accountId: OWN_ACCOUNT,
      token: 'own-tok',
      ...over,
    })

  async function auditEvents(): Promise<{ event: string; target: string; detail: string }[]> {
    const res = await call('u-ama', '/audit-events?org=acme')
    return (await res.json()).data
  }

  describe('reading', () => {
    it('shows a project with no account yet, and its workspaces with nowhere to deploy', async () => {
      const listed = await page('u-dan')
      expect(listed.connections).toEqual([])
      expect(listed.workspaces.map((w) => [w.name, w.source])).toEqual([
        ['Ops', 'none'],
        ['Sales', 'none'],
      ])
    })

    it('lists the org’s accounts for Add connection: available, or restricted to another project', async () => {
      const res = await call('u-fay', '/projects/p-101/connections/available')
      const { data: rows } = (await res.json()) as { data: AvailableConnection[] }
      expect(rows.map((r) => [r.name, r.state, r.accountSuffix])).toEqual([
        ['Acme production', 'available', 'aaaa'],
        ['Data platform', 'restricted', 'aaaa'],
      ])
      expect(JSON.stringify(rows)).not.toMatch(/apiToken|"tok"/)
    })

    it('answers someone outside the project as not found', async () => {
      expect((await call('u-cleo', '/projects/p-101/connections')).status).toBe(404)
    })
  })

  describe('who may change them', () => {
    it('refuses a project member’s writes with the reason, and lets the project admin make them', async () => {
      const refused = await add([prod], 'u-dan')
      expect(refused.status).toBe(403)
      expect((await refused.json()).error).toBe(ACCESS_REASONS.projectAdmins)
      for (const res of [
        await connectOwn('u-dan'),
        await send('u-dan', '/projects/p-101/default-connection', { connectionId: prod }, 'PUT'),
        await send(
          'u-dan',
          '/projects/p-101/workspaces/ws-sales/connection',
          { connectionId: null },
          'PUT',
        ),
        await call('u-dan', `/projects/p-101/connections/${prod}`, { method: 'DELETE' }),
      ]) {
        expect(res.status).toBe(403)
      }
      expect((await add([prod])).status).toBe(201)
    })

    it('connects a new account as the project’s own only, never one for the whole org', async () => {
      // Not from a project, not even for an org admin: the org's page connects those.
      for (const who of ['u-fay', 'u-ben']) {
        expect((await connectOwn(who, { share: 'org' })).status).toBe(422)
      }
      const made = await connectOwn('u-ben')
      expect(made.status).toBe(201)
      expect(await made.json()).toMatchObject({ scope: 'project', isDefault: true })
    })
  })

  describe('adding and connecting', () => {
    it('adds an available account as the default, and refuses one restricted elsewhere', async () => {
      const res = await add([prod, data])
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({
        added: [{ id: prod, name: 'Acme production' }],
        defaultId: prod,
      })
      const restricted = await add([data])
      expect(restricted.status).toBe(400)
      expect((await restricted.json()).error).toBe(PROJECT_CONNECTION_REASONS.notAvailable)
      const listed = await page()
      expect(listed.connections).toMatchObject([
        {
          id: prod,
          scope: 'shared',
          isDefault: true,
          accountSuffix: 'aaaa',
          tokenStatus: 'active',
        },
      ])
      expect(listed.workspaces.every((w) => w.source === 'default')).toBe(true)
    })

    it('checks the token first, stores nothing it refuses, and keeps an own account off the org page', async () => {
      answer = { ...answer, status: 'refused' }
      const refused = await connectOwn()
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ field: 'token' })
      expect((await page()).connections).toEqual([])

      answer = { ...answer, status: 'active' }
      const made = await connectOwn()
      expect(made.status).toBe(201)
      expect(await made.json()).toMatchObject({ scope: 'project', isDefault: true })
      const listed = await page()
      expect(listed.connections).toMatchObject([
        {
          name: 'Checkout staging',
          scope: 'project',
          accountSuffix: 'bbbb',
          createdByName: 'Fay Lund',
        },
      ])
      const orgPage = await call('u-ama', '/connections?org=acme')
      const names = ((await orgPage.json()).data as ConnectionSummary[]).map((c) => c.name)
      expect(names).not.toContain('Checkout staging')
    })

    it('refuses a malformed account id before asking Cloudflare', async () => {
      const res = await connectOwn('u-fay', { accountId: 'nope' })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ field: 'accountId' })
    })

    it('replaces the token of an account the project owns, never a shared one', async () => {
      const { id } = await (await connectOwn()).json()
      const replaced = await send(
        'u-fay',
        `/projects/p-101/connections/${id}`,
        { token: 'own-tok-2' },
        'PATCH',
      )
      expect(replaced.status).toBe(200)
      expect(JSON.stringify(await replaced.json())).not.toContain('own-tok')
      await add([prod])
      const shared = await send(
        'u-fay',
        `/projects/p-101/connections/${prod}`,
        { token: 'x' },
        'PATCH',
      )
      expect(shared.status).toBe(404)
      expect((await shared.json()).error).toBe(PROJECT_CONNECTION_REASONS.ownedOnly)
    })
  })

  describe('renaming', () => {
    it('renames an account the project owns without touching its token, never a shared one', async () => {
      const { id } = await (await connectOwn()).json()
      const renamed = await send(
        'u-fay',
        `/projects/p-101/connections/${id}`,
        { name: '  Checkout prod  ' },
        'PATCH',
      )
      expect(renamed.status).toBe(200)
      expect(await renamed.json()).toMatchObject({ id, name: 'Checkout prod' })

      await add([prod])
      const shared = await send(
        'u-fay',
        `/projects/p-101/connections/${prod}`,
        { name: 'Mine now' },
        'PATCH',
      )
      expect(shared.status).toBe(404)
      expect((await shared.json()).error).toBe(PROJECT_CONNECTION_REASONS.ownedOnly)
    })

    it('refuses a blank name, an empty body, and an account ID without a token', async () => {
      const { id } = await (await connectOwn()).json()
      const path = `/projects/p-101/connections/${id}`
      expect((await send('u-fay', path, { name: '   ' }, 'PATCH')).status).toBe(422)
      expect((await send('u-fay', path, {}, 'PATCH')).status).toBe(422)
      expect(
        (await send('u-fay', path, { name: 'X', accountId: 'a'.repeat(32) }, 'PATCH')).status,
      ).toBe(422)
    })
  })

  describe('the default and each workspace', () => {
    it('moves the default, points a workspace elsewhere, and records each change', async () => {
      await add([prod])
      const { id: own } = await (await connectOwn()).json()
      expect(
        (await send('u-fay', '/projects/p-101/default-connection', { connectionId: own }, 'PUT'))
          .status,
      ).toBe(200)
      expect(
        (
          await send(
            'u-fay',
            '/projects/p-101/workspaces/ws-sales/connection',
            { connectionId: prod },
            'PUT',
          )
        ).status,
      ).toBe(200)
      const listed = await page()
      expect(listed.connections.find((c) => c.isDefault)?.id).toBe(own)
      expect(listed.workspaces).toMatchObject([
        { name: 'Ops', connectionId: own, source: 'default' },
        {
          name: 'Sales',
          connectionId: prod,
          connectionName: 'Acme production',
          source: 'override',
        },
      ])
      const events = await auditEvents()
      expect(events.map((e) => e.event)).toEqual(
        expect.arrayContaining([
          'project_connection.add',
          'project_connection.create',
          'project_connection.default',
          'workspace_connection.set',
        ]),
      )
      expect(events.find((e) => e.event === 'workspace_connection.set')).toMatchObject({
        target: 'Sales',
        detail: expect.stringContaining('Deploys to Acme production'),
      })
    })

    it('refuses an account that isn’t the project’s, and another project’s workspace', async () => {
      await add([prod])
      const notOurs = await send(
        'u-fay',
        '/projects/p-101/default-connection',
        { connectionId: data },
        'PUT',
      )
      expect(notOurs.status).toBe(400)
      expect((await notOurs.json()).error).toBe(PROJECT_CONNECTION_REASONS.notProjects)
      const elsewhere = await send(
        'u-fay',
        '/projects/p-101/workspaces/ws-202/connection',
        { connectionId: prod },
        'PUT',
      )
      expect(elsewhere.status).toBe(404)
    })
  })

  describe('removing', () => {
    it('takes a shared account off the project and deletes an owned one', async () => {
      await add([prod])
      const { id: own } = await (await connectOwn()).json()
      await send(
        'u-fay',
        '/projects/p-101/workspaces/ws-ops/connection',
        { connectionId: own },
        'PUT',
      )
      const removed = await call('u-fay', `/projects/p-101/connections/${own}`, {
        method: 'DELETE',
      })
      expect(removed.status).toBe(200)
      expect(await removed.json()).toMatchObject({ owned: true, workspacesCleared: 1 })
      expect(await h.adapter.getProviderConnectionById(own)).toBeNull()
      const off = await call('u-fay', `/projects/p-101/connections/${prod}`, { method: 'DELETE' })
      expect(off.status).toBe(200)
      expect(await h.adapter.getProviderConnectionById(prod)).not.toBeNull()
      expect((await page()).connections).toEqual([])
      expect(
        (await call('u-fay', `/projects/p-101/connections/${prod}`, { method: 'DELETE' })).status,
      ).toBe(404)
    })
  })

  describe('review round (2026-11-01)', () => {
    it('answers adding an account the project already has as done, not refused', async () => {
      await add([prod])
      const again = await add([prod])
      expect(again.status).toBe(200)
      expect(await again.json()).toEqual({ added: [], defaultId: null })
    })

    it('refuses deleting an own account a workflow is still deployed with, naming it', async () => {
      const { id: own } = await (await connectOwn()).json()
      const s = h.schema
      await h.db.insert(s.workflowVersions).values({
        id: 'v-sales-1',
        workflowId: 'wf-sales',
        version: 1,
        ir: '{}',
        createdAt: '2026-10-20T00:00:00.000Z',
      })
      await h.db.update(s.workflows).set({ currentVersionId: 'v-sales-1' })
      await h.db.insert(s.deployments).values({
        id: 'd-sales',
        workflowId: 'wf-sales',
        versionId: 'v-sales-1',
        connectionId: own,
        serviceName: 'svc',
        status: 'success',
        createdAt: '2026-10-21T00:00:00.000Z',
      })
      const refused = await call('u-fay', `/projects/p-101/connections/${own}`, {
        method: 'DELETE',
      })
      expect(refused.status).toBe(409)
      expect((await refused.json()).error).toBe(
        PROJECT_CONNECTION_REASONS.stillDeployed(['In sales']),
      )
      expect(await h.adapter.getProviderConnectionById(own)).not.toBeNull()

      // The trigger dialog lists it: the workflow went out with it.
      const offered = await call('u-ama', '/workflows/wf-sales/deploy-connections?projectId=p-101')
      expect(((await offered.json()) as DeployConnections).deployedWith).toEqual([
        {
          id: own,
          name: 'Checkout staging',
          deploymentId: 'd-sales',
          // Whether it can be called, never the URL itself (D-8).
          callable: false,
          versionId: 'v-sales-1',
          version: 1,
          versionLocked: false,
          deployedAt: '2026-10-21T00:00:00.000Z',
          deployedByName: null,
        },
      ])
    })

    it('answers a default change that lost a race with 409, not 500', async () => {
      await add([prod])
      const race = Object.assign(new Error('UNIQUE constraint failed: project_connections'), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      })
      const spy = vi.spyOn(h.adapter, 'setProjectDefaultConnection').mockRejectedValueOnce(race)
      const res = await send(
        'u-fay',
        '/projects/p-101/default-connection',
        { connectionId: prod },
        'PUT',
      )
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(PROJECT_CONNECTION_REASONS.defaultChanged)
      spy.mockRestore()
    })
  })

  describe('security review (2026-11-01)', () => {
    it('takes down only through an account the workflow deployed with', async () => {
      // Project 202's own account: a Project 101 workflow must not reach it.
      const other = await h.adapter.createProjectConnection({
        id: 'c-202',
        projectId: 'p-202',
        organizationId: 'org-acme',
        createdBy: 'u-ama',
        provider: 'cloudflare',
        name: 'Nightly account',
        credentials: JSON.stringify({ accountId: OWN_ACCOUNT, apiToken: 'secret-202' }),
        makeDefault: true,
      })
      const res = await send('u-ama', '/workflows/wf-sales/takedown?projectId=p-101', {
        connectionId: other!.id,
      })
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('This workflow isn’t deployed with that connection')
    })

    it('keeps the org’s connection routes off a project’s own account', async () => {
      const { id: own } = await (await connectOwn()).json()
      const patch = await send('u-ama', `/connections/${own}?org=acme`, { name: 'X' }, 'PATCH')
      expect(patch.status).toBe(404)
      const del = await call('u-ama', `/connections/${own}?org=acme`, { method: 'DELETE' })
      expect(del.status).toBe(404)
      expect(await h.adapter.getProviderConnectionById(own)).not.toBeNull()
    })

    it('names only this project’s workflows when an own account can’t be deleted', () => {
      expect(PROJECT_CONNECTION_REASONS.stillDeployed([], 1)).toMatch(
        /^1 workflow in another project is still deployed/,
      )
      expect(PROJECT_CONNECTION_REASONS.stillDeployed(['In sales'], 1)).toMatch(
        /^2 workflows are still deployed/,
      )
    })
  })

  describe('deploy', () => {
    it('offers only the project’s accounts, the workspace’s own chosen', async () => {
      const offered = async () => {
        const res = await call('u-ama', '/workflows/wf-sales/deploy-connections?projectId=p-101')
        expect(res.status).toBe(200)
        return (await res.json()) as DeployConnections
      }
      expect(await offered()).toEqual({ connections: [], defaultId: null, deployedWith: [] })
      await add([prod])
      const { id: own } = await (await connectOwn('u-fay', { makeDefault: false })).json()
      expect((await offered()).defaultId).toBe(prod)
      await send(
        'u-fay',
        '/projects/p-101/workspaces/ws-sales/connection',
        { connectionId: own },
        'PUT',
      )
      const sales = await offered()
      expect(sales.defaultId).toBe(own)
      expect(sales.connections.map((c) => c.name)).toEqual(['Acme production', 'Checkout staging'])
      // Which kind of token each is: an OAuth grant's short expiry is no warning.
      expect(sales.connections.map((c) => [c.authKind, c.canDeploy])).toEqual([
        ['api-token', true],
        ['api-token', true],
      ])
      expect(JSON.stringify(sales)).not.toMatch(/apiToken|own-tok|"tok"/)
    })

    it('refuses a deploy, a config read and a preview with an account the project hasn’t added', async () => {
      const workflow = (await h.adapter.getWorkflowById('wf-sales'))!
      const deployWith = () =>
        prepareDeploy({
          db: h.adapter,
          workflow,
          organizationId: 'org-acme',
          projectId: 'p-101',
          connectionId: prod,
        })
      // Prod serves every project, but Project 101 hasn't added it.
      expect(await deployWith()).toEqual({ error: CONNECTION_NOT_SERVING, status: 403 })
      const config = await call(
        'u-ama',
        `/workflows/wf-sales/deploy-config/${prod}?projectId=p-101`,
      )
      expect(config.status).toBe(403)
      expect((await config.json()).error).toBe(CONNECTION_NOT_SERVING)
      const preview = await send(
        'u-ama',
        '/workflows/wf-sales/deploy-config-preview?projectId=p-101',
        { connectionId: prod, config: {} },
      )
      expect(preview.status).toBe(403)

      await add([prod])
      expect(await deployWith()).not.toEqual({ error: CONNECTION_NOT_SERVING, status: 403 })
      const fresh = await call('u-ama', `/workflows/wf-sales/deploy-config/${prod}?projectId=p-101`)
      expect(fresh.status).toBe(200)
      // Nothing stored yet: the settings start at the provider's defaults, sent alongside.
      const freshBody = (await fresh.json()) as { config: unknown; defaults: unknown }
      // A workflow's own URL is off by default (D-9): the API runs it.
      expect(freshBody.defaults).toMatchObject({ workersDev: false, previewUrls: false })
      expect(freshBody.config).toEqual(freshBody.defaults)

      const withRoute = await send(
        'u-ama',
        `/workflows/wf-sales/deploy-config/${prod}?projectId=p-101`,
        { config: { routes: [{ pattern: 'example.com/*', zoneName: 'example.com' }] } },
        'PUT',
      )
      expect(withRoute.status).toBe(200)

      const saved = await send(
        'u-ama',
        `/workflows/wf-sales/deploy-config/${prod}?projectId=p-101`,
        { config: { bindings: { KV_USERS: { kind: 'kv', resourceId: 'namespace-1' } } } },
        'PUT',
      )
      expect(saved.status).toBe(200)
      expect(((await saved.json()) as { config: unknown }).config).toMatchObject({
        routes: [{ pattern: 'example.com/*', zoneName: 'example.com' }],
        bindings: { KV_USERS: { kind: 'kv', resourceId: 'namespace-1' } },
      })
      const reread = await call(
        'u-ama',
        `/workflows/wf-sales/deploy-config/${prod}?projectId=p-101`,
      )
      const rereadBody = (await reread.json()) as { config: unknown; defaults: unknown }
      expect(rereadBody.config).toMatchObject({
        routes: [{ pattern: 'example.com/*', zoneName: 'example.com' }],
        bindings: { KV_USERS: { kind: 'kv', resourceId: 'namespace-1' } },
      })
      // The defaults stay the provider's, whatever is stored.
      expect(rereadBody.defaults).not.toHaveProperty('routes')
    })
  })
})
