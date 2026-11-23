import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowProvider } from '@awaitstep/codegen'
import type { AppExtension } from '../types.js'
import { deployConnections, MANAGED_CONNECTION } from '../lib/connection-fields.js'
import { useExtensionProviders } from '../lib/provider-registry.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  TEST_ORG_ID,
  TEST_ORG_SLUG,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

// A connection of a provider the instance operates itself (an extension's,
// not listed as connectable) is the instance's own record: every route that
// would change or remove it refuses, and the lists mark it.

const operated: AppExtension = {
  id: 'acme-ext',
  providers: {
    'instance-run': () =>
      ({
        name: 'instance-run',
        capabilities: { id: 'instance-run' },
      }) as unknown as WorkflowProvider,
  },
}

function request(
  app: ReturnType<typeof createTestApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(`${path}?organizationId=${TEST_ORG_ID}`, {
    method,
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
}

describe('connections of a provider the instance operates', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp({ extensions: [operated] })
    for (const [id, provider] of [
      ['conn-run', 'instance-run'],
      ['conn-own', 'cloudflare'],
    ] as const) {
      await mockDb.createConnection({
        id,
        organizationId: TEST_ORG_ID,
        createdBy: TEST_USER_ID,
        provider,
        name: id,
        credentials: JSON.stringify({ accountId: 'acct-1234', apiToken: 'token' }),
      })
    }
  })
  afterEach(() => {
    useExtensionProviders([])
    vi.restoreAllMocks()
  })

  it('refuses a rename, new credentials and a change of projects, changing nothing', async () => {
    const update = vi.spyOn(mockDb, 'updateConnection')
    for (const body of [
      { name: 'Renamed' },
      { credentials: { apiToken: 'other' } },
      { allProjects: false, projectIds: [TEST_PROJECT_ID] },
    ]) {
      const res = await request(app, 'PATCH', '/api/connections/conn-run', body)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: MANAGED_CONNECTION })
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a delete, and the connection stays', async () => {
    const res = await request(app, 'DELETE', '/api/connections/conn-run')
    expect(res.status).toBe(403)
    expect(await mockDb.getProviderConnectionById('conn-run')).not.toBeNull()
  })

  it('still renames and deletes a connection a person made', async () => {
    expect(
      (await request(app, 'PATCH', '/api/connections/conn-own', { name: 'Renamed' })).status,
    ).toBe(200)
    expect((await request(app, 'DELETE', '/api/connections/conn-own')).status).toBe(200)
  })

  it('refuses taking it off a project, asking the database to leave that provider alone', async () => {
    vi.spyOn(mockDb, 'getProjectOwnedConnection').mockResolvedValue(null)
    const remove = vi.spyOn(mockDb, 'removeProjectConnection').mockResolvedValue({
      name: 'conn-run',
      owned: false,
      wasDefault: true,
      workspacesCleared: 0,
      blockedBy: [],
      blockedElsewhere: 0,
      fixed: true,
    })
    const res = await request(
      app,
      'DELETE',
      `/api/projects/${TEST_PROJECT_ID}/connections/conn-run`,
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: MANAGED_CONNECTION })
    expect(remove).toHaveBeenCalledWith(TEST_PROJECT_ID, 'conn-run', {
      fixedProviders: ['instance-run'],
    })
  })

  it('refuses a project-level rename or new token the same way, before any other answer', async () => {
    const update = vi.spyOn(mockDb, 'updateConnection')
    for (const body of [{ name: 'x' }, { token: 'other' }]) {
      const res = await request(
        app,
        'PATCH',
        `/api/projects/${TEST_PROJECT_ID}/connections/conn-run`,
        body,
      )
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: MANAGED_CONNECTION })
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('answers a removal without the database’s own `fixed` flag', async () => {
    vi.spyOn(mockDb, 'getProjectOwnedConnection').mockResolvedValue(null)
    vi.spyOn(mockDb, 'removeProjectConnection').mockResolvedValue({
      name: 'conn-own',
      owned: false,
      wasDefault: false,
      workspacesCleared: 0,
      blockedBy: [],
      blockedElsewhere: 0,
      fixed: false,
    })
    const res = await request(
      app,
      'DELETE',
      `/api/projects/${TEST_PROJECT_ID}/connections/conn-own`,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('fixed')
  })

  it('marks it in the connection list, and leaves it out of the accounts', async () => {
    const list = (await (await request(app, 'GET', '/api/connections')).json()) as {
      data: { id: string; managed?: true }[]
    }
    expect(list.data.map((row) => [row.id, row.managed])).toEqual(
      expect.arrayContaining([
        ['conn-run', true],
        ['conn-own', undefined],
      ]),
    )
    const accounts = (await (await request(app, 'GET', '/api/connections/accounts')).json()) as {
      data: { id: string }[]
    }
    expect(accounts.data.map((row) => row.id)).toEqual(['conn-own'])
  })

  it('marks it among what Deploy offers', () => {
    const row = {
      name: 'n',
      credentials: '{}',
      scope: 'organization' as const,
      tokenStatus: 'unchecked',
      tokenExpiresAt: null,
      chosen: false,
    }
    const { connections } = deployConnections(
      [
        { ...row, id: 'conn-run', provider: 'instance-run' },
        { ...row, id: 'conn-own', provider: 'cloudflare' },
      ] as never,
      null as never,
    )
    expect(connections.map((c) => (c as { managed?: true }).managed)).toEqual([true, undefined])
  })

  it('marks nothing once the provider is one people connect accounts to', async () => {
    createTestApp({ extensions: [{ ...operated, connectableProviders: ['instance-run'] }] })
    const list = (await (await request(app, 'GET', '/api/connections')).json()) as {
      data: { managed?: true }[]
    }
    expect(list.data.some((row) => row.managed)).toBe(false)
  })

  it('refuses an OAuth reconnect of one, even if its credentials read as OAuth', async () => {
    await mockDb.createConnection({
      id: 'conn-run-oauth',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'instance-run',
      name: 'Run',
      credentials: JSON.stringify({ accountId: 'acct-1234', authKind: 'oauth' }),
    })
    const withOAuth = createTestApp({
      extensions: [operated],
      cloudflareOAuth: {
        stub: false,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        authorizeUrl: 'https://cf.test/oauth2/auth',
        tokenUrl: 'https://cf.test/oauth2/token',
        revokeUrl: 'https://cf.test/oauth2/revoke',
        apiBaseUrl: 'https://cf.test/client/v4',
        redirectUri: 'http://api.test/api/oauth/cloudflare/callback',
        scopes: ['account.read'],
      },
      webUrl: 'http://web.test',
    })
    const res = await withOAuth.request('/api/oauth/cloudflare/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: TEST_ORG_SLUG, connection: 'conn-run-oauth' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: MANAGED_CONNECTION })
  })
})
