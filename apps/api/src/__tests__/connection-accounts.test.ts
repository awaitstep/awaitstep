import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// `GET /api/connections/accounts`: the organization's own accounts with only
// what an accounts page shows, read by whoever reads the org list.

const ACCOUNT = 'a'.repeat(28) + 'f00d'
const TOKEN = 'secret-token-value'

describe('GET /api/connections/accounts', () => {
  let h: SqliteApp

  async function orgAccount(id: string, name: string, credentials: Record<string, string>) {
    await h.adapter.createConnection({
      id,
      organizationId: 'org-acme',
      createdBy: 'u-ben',
      provider: 'cloudflare',
      credentials: JSON.stringify(credentials),
      name,
      token: { status: 'active', expiresAt: null, checkedAt: '2026-11-01T00:00:00.000Z' },
    })
  }

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
    await orgAccount('c-token', 'Acme production', { accountId: ACCOUNT, apiToken: TOKEN })
    await h.adapter.createProjectConnection({
      id: 'c-own',
      projectId: 'p-101',
      organizationId: 'org-acme',
      createdBy: 'u-ben',
      provider: 'cloudflare',
      name: 'Checkout staging',
      credentials: JSON.stringify({ accountId: ACCOUNT, apiToken: TOKEN }),
      makeDefault: true,
    })
    await h.adapter.createConnection({
      id: 'c-globex',
      organizationId: 'org-globex',
      createdBy: 'u-cleo',
      provider: 'cloudflare',
      credentials: JSON.stringify({ accountId: ACCOUNT, apiToken: TOKEN }),
      name: 'Globex',
    })
  })

  async function accounts(user: string, query = '') {
    const res = await h.app.request(`/api/connections/accounts?org=acme${query}`, h.as(user))
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  it('lists only the organization’s own accounts with exactly the page’s fields', async () => {
    const { status, body } = await accounts('u-ama')
    expect(status).toBe(200)
    expect(body).toEqual({
      data: [
        {
          id: 'c-token',
          name: 'Acme production',
          accountSuffix: 'f00d',
          authKind: 'api-token',
          canDeploy: true,
          tokenStatus: 'active',
        },
      ],
      nextCursor: null,
    })
    const text = JSON.stringify(body)
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain(ACCOUNT)
    expect(text).not.toContain('credentials')
  })

  it('says an OAuth grant without a Workers scope cannot deploy', async () => {
    await orgAccount('c-oauth', 'Acme OAuth', {
      authKind: 'oauth',
      accountId: ACCOUNT,
      apiToken: 'access',
      refreshToken: 'refresh',
      scopes: 'account-settings.read',
    })
    const { body } = await accounts('u-ama')
    const rows = body.data as { id: string; authKind: string; canDeploy: boolean }[]
    expect(rows.find((r) => r.id === 'c-oauth')).toMatchObject({
      authKind: 'oauth',
      canDeploy: false,
    })
    expect(JSON.stringify(body)).not.toContain('refresh')
  })

  it('pages through the accounts newest first, as the list orders them', async () => {
    await orgAccount('c-second', 'Second', { accountId: ACCOUNT, apiToken: TOKEN })
    await orgAccount('c-third', 'Third', { accountId: ACCOUNT, apiToken: TOKEN })
    const list = await h.app.request('/api/connections?org=acme', h.as('u-ama'))
    const listed = ((await list.json()) as { data: { id: string }[] }).data.map((c) => c.id)

    const first = await accounts('u-ama', '&limit=2')
    const firstRows = first.body.data as { id: string }[]
    expect(firstRows).toHaveLength(2)
    expect(first.body.nextCursor).toEqual(expect.any(String))
    const second = await accounts(
      'u-ama',
      `&limit=2&cursor=${encodeURIComponent(first.body.nextCursor as string)}`,
    )
    expect(second.body.nextCursor).toBeNull()
    const paged = [...firstRows, ...(second.body.data as { id: string }[])].map((c) => c.id)
    expect(paged).toEqual(listed)
    expect(paged.sort()).toEqual(['c-second', 'c-third', 'c-token'])
  })

  it('answers whoever the list answers, and refuses whoever it refuses', async () => {
    // Owner, admin, a project member, a workspace viewer; another org's owner and a
    // stranger are both told the organization isn't there.
    for (const user of ['u-ama', 'u-ben', 'u-dan', 'u-eve', 'u-cleo', 'u-hal']) {
      const list = await h.app.request('/api/connections?org=acme', h.as(user))
      const res = await h.app.request('/api/connections/accounts?org=acme', h.as(user))
      expect({ user, status: res.status }).toEqual({ user, status: list.status })
    }
    expect((await accounts('u-dan')).status).toBe(200)
    expect((await accounts('u-cleo')).status).toBe(404)
    expect((await accounts('u-hal')).status).toBe((await accounts('u-cleo')).status)
    expect((await h.app.request('/api/connections/accounts?org=acme')).status).toBe(401)
  })

  it('takes the list’s key cells: connections:read at the org, workflows:read below', async () => {
    const cases = [
      [
        await h.seed.key('k-org', 'u-ben', { level: 'organization' }, { connections: ['read'] }),
        200,
      ],
      [
        await h.seed.key('k-org-none', 'u-ben', { level: 'organization' }, { projects: ['read'] }),
        403,
      ],
      [
        await h.seed.key(
          'k-proj',
          'u-ama',
          { level: 'project', projectId: 'p-101' },
          { workflows: ['read'] },
        ),
        200,
      ],
      [
        await h.seed.key(
          'k-proj-none',
          'u-ama',
          { level: 'project', projectId: 'p-101' },
          { variables: ['read'] },
        ),
        403,
      ],
    ] as const
    for (const [init, expected] of cases) {
      const list = await h.app.request('/api/connections?org=acme', init)
      const res = await h.app.request('/api/connections/accounts?org=acme', init)
      expect(res.status).toBe(list.status)
      expect(res.status).toBe(expected)
      if (res.status === 200) {
        const body = (await res.json()) as { data: { id: string }[] }
        expect(body.data.map((r) => r.id)).toEqual(['c-token'])
      }
    }
  })

  it('refuses a malformed cursor as the list does', async () => {
    const list = await h.app.request('/api/connections?org=acme&cursor=nope', h.as('u-ama'))
    const res = await accounts('u-ama', '&cursor=nope')
    expect(res.status).toBe(list.status)
    expect(res.status).toBe(422)
  })

  it('still finds no connection named "accounts" for a write', async () => {
    for (const method of ['PATCH', 'DELETE']) {
      const res = await h.app.request(
        '/api/connections/accounts?org=acme',
        h.as('u-ama', { method, body: JSON.stringify({ name: 'x' }) }),
      )
      expect({ method, status: res.status }).toEqual({ method, status: 404 })
    }
  })
})
