import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTestApp,
  resetStore,
  mockDb,
  TEST_USER_ID,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
} from './helpers.js'
import { hashApiKey } from '../lib/api-key-hash.js'

const OTHER_PROJECT_ID = 'test-project-2'
const PROJECT_KEY = 'ask_test-project-key'

async function seedProjectKey(scopes: string[] = ['read', 'write', 'deploy']) {
  await mockDb.createApiKey({
    id: 'key-1',
    organizationId: TEST_ORG_ID,
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'project key',
    keyHash: await hashApiKey(PROJECT_KEY),
    keyPrefix: PROJECT_KEY.slice(0, 8),
    scopes: JSON.stringify(scopes),
    expiresAt: null,
  })
}

function asKey(init?: { method?: string; body?: string }): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${PROJECT_KEY}`,
      'Content-Type': 'application/json',
    },
  }
}

function asSession(path: string, init: { method?: string; body?: string }): [string, RequestInit] {
  const url = `${path}${path.includes('?') ? '&' : '?'}organizationId=${TEST_ORG_ID}`
  return [url, { ...init, headers: { 'Content-Type': 'application/json' } }]
}

describe('project-scoped API keys cannot mutate org resources', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createProject({
      id: OTHER_PROJECT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Other Project',
      slug: 'other-project',
    })
    await mockDb.createConnection({
      id: 'conn-1',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
      name: 'CF',
    })
    await seedProjectKey()
  })

  it('cannot replace a connection its org deploys with', async () => {
    const res = await app.request(
      '/api/connections/conn-1',
      asKey({
        method: 'PATCH',
        body: JSON.stringify({
          credentials: { accountId: 'attacker', apiToken: 'attacker-token' },
        }),
      }),
    )
    expect(res.status).toBe(403)
    const conn = await mockDb.getProviderConnectionById('conn-1', TEST_ORG_ID)
    expect(conn?.credentials).toContain('"accountId":"acct"')
  })

  it('cannot rename a connection either — the guard is on the route, not the field', async () => {
    const res = await app.request(
      '/api/connections/conn-1',
      asKey({ method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) }),
    )
    expect(res.status).toBe(403)
    const conn = await mockDb.getProviderConnectionById('conn-1', TEST_ORG_ID)
    expect(conn?.name).toBe('CF')
  })

  it('cannot create or delete connections', async () => {
    const created = await app.request(
      '/api/connections',
      asKey({
        method: 'POST',
        body: JSON.stringify({ provider: 'cloudflare', credentials: { a: 'b' }, name: 'x' }),
      }),
    )
    expect(created.status).toBe(403)

    const deleted = await app.request('/api/connections/conn-1', asKey({ method: 'DELETE' }))
    expect(deleted.status).toBe(403)
    expect(await mockDb.getProviderConnectionById('conn-1', TEST_ORG_ID)).not.toBeNull()
  })

  it('cannot delete or rename another project — or its own', async () => {
    const deleted = await app.request(
      `/api/projects/${OTHER_PROJECT_ID}`,
      asKey({ method: 'DELETE' }),
    )
    expect(deleted.status).toBe(403)
    expect(await mockDb.getProjectById(OTHER_PROJECT_ID)).not.toBeNull()

    const renamed = await app.request(
      `/api/projects/${TEST_PROJECT_ID}`,
      asKey({ method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) }),
    )
    expect(renamed.status).toBe(403)

    const created = await app.request(
      '/api/projects',
      asKey({ method: 'POST', body: JSON.stringify({ name: 'new', slug: 'new' }) }),
    )
    expect(created.status).toBe(403)
  })

  it('cannot install, uninstall or update marketplace nodes', async () => {
    for (const action of ['install', 'uninstall', 'update']) {
      const res = await app.request(
        `/api/marketplace/${action}`,
        asKey({ method: 'POST', body: JSON.stringify({ nodeId: 'some-node' }) }),
      )
      expect(res.status, action).toBe(403)
    }
  })

  it('cannot move a workflow into another project', async () => {
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Movable',
    })
    const res = await app.request(
      '/api/workflows/wf-1/move',
      asKey({ method: 'PATCH', body: JSON.stringify({ targetProjectId: OTHER_PROJECT_ID }) }),
    )
    expect(res.status).toBe(403)
    expect((await mockDb.getWorkflowById('wf-1'))?.projectId).toBe(TEST_PROJECT_ID)

    const session = await app.request(`/api/workflows/wf-1/move?projectId=${TEST_PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProjectId: OTHER_PROJECT_ID }),
    })
    expect(session.status).toBe(200)
    expect((await mockDb.getWorkflowById('wf-1'))?.projectId).toBe(OTHER_PROJECT_ID)
  })

  it('sessions still manage org resources', async () => {
    const [url, init] = asSession('/api/connections/conn-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed CF' }),
    })
    const res = await app.request(url, init)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      name: string
      credentials: { apiToken: string }
    }
    expect(body.name).toBe('Renamed CF')
    expect(body.credentials.apiToken).not.toContain('token')
  })
})

describe('project-scoped API keys and env vars', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createProject({
      id: OTHER_PROJECT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Other Project',
      slug: 'other-project',
    })
    await seedProjectKey()
    await mockDb.createEnvVar({
      id: 'env-org',
      organizationId: TEST_ORG_ID,
      projectId: null,
      createdBy: TEST_USER_ID,
      name: 'ORG_WIDE',
      value: 'org-value',
      isSecret: false,
    })
    await mockDb.createEnvVar({
      id: 'env-own',
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'OWN_VAR',
      value: 'own-value',
      isSecret: false,
    })
  })

  it('creates variables only in its own project', async () => {
    const own = await app.request(
      '/api/env-vars',
      asKey({
        method: 'POST',
        body: JSON.stringify({ name: 'NEW_VAR', value: 'v', projectId: TEST_PROJECT_ID }),
      }),
    )
    expect(own.status).toBe(201)

    const orgWide = await app.request(
      '/api/env-vars',
      asKey({ method: 'POST', body: JSON.stringify({ name: 'NOPE', value: 'v' }) }),
    )
    expect(orgWide.status).toBe(403)

    const foreign = await app.request(
      '/api/env-vars',
      asKey({
        method: 'POST',
        body: JSON.stringify({ name: 'NOPE', value: 'v', projectId: OTHER_PROJECT_ID }),
      }),
    )
    expect(foreign.status).toBe(403)
  })

  it('updates and deletes only its own project variables', async () => {
    const ownPatch = await app.request(
      '/api/env-vars/env-own',
      asKey({ method: 'PATCH', body: JSON.stringify({ value: 'updated' }) }),
    )
    expect(ownPatch.status).toBe(200)

    const orgPatch = await app.request(
      '/api/env-vars/env-org',
      asKey({ method: 'PATCH', body: JSON.stringify({ value: 'hijacked' }) }),
    )
    expect(orgPatch.status).toBe(404)
    expect((await mockDb.getEnvVarById('env-org'))?.value).toBe('org-value')

    const orgDelete = await app.request('/api/env-vars/env-org', asKey({ method: 'DELETE' }))
    expect(orgDelete.status).toBe(404)
    expect(await mockDb.getEnvVarById('env-org')).not.toBeNull()
  })

  it('sessions still create variables at both levels', async () => {
    const orgWide = await app.request(
      ...asSession('/api/env-vars', {
        method: 'POST',
        body: JSON.stringify({ name: 'SESSION_ORG', value: 'v' }),
      }),
    )
    expect(orgWide.status).toBe(201)

    const project = await app.request(
      ...asSession('/api/env-vars', {
        method: 'POST',
        body: JSON.stringify({ name: 'SESSION_PROJ', value: 'v', projectId: TEST_PROJECT_ID }),
      }),
    )
    expect(project.status).toBe(201)
  })

  it('a stored secret never becomes readable by flipping its flag', async () => {
    await mockDb.createEnvVar({
      id: 'env-secret',
      organizationId: TEST_ORG_ID,
      projectId: null,
      createdBy: TEST_USER_ID,
      name: 'SECRET_VAR',
      value: 'sk-live-very-secret',
      isSecret: true,
    })

    const flip = await app.request(
      ...asSession('/api/env-vars/env-secret', {
        method: 'PATCH',
        body: JSON.stringify({ isSecret: false }),
      }),
    )
    expect(flip.status).toBe(422)
    expect(JSON.stringify(await flip.json())).not.toContain('sk-live-very-secret')
    expect((await mockDb.getEnvVarById('env-secret'))?.isSecret).toBe(true)

    const replaced = await app.request(
      ...asSession('/api/env-vars/env-secret', {
        method: 'PATCH',
        body: JSON.stringify({ isSecret: false, value: 'public-now' }),
      }),
    )
    expect(replaced.status).toBe(200)
    const body = (await replaced.json()) as { value: string; isSecret: boolean }
    expect(body.isSecret).toBe(false)
    expect(body.value).toBe('public-now')
  })

  it("cannot list another project's variables, but keeps its own views", async () => {
    const foreign = await app.request(
      `/api/env-vars?projectId=${OTHER_PROJECT_ID}`,
      asKey({ method: 'GET' }),
    )
    expect(foreign.status).toBe(404)

    const own = await app.request(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, asKey())
    expect(own.status).toBe(200)
    const ownBody = (await own.json()) as { data: { name: string }[] }
    expect(ownBody.data.map((v) => v.name)).toEqual(['OWN_VAR'])

    const orgWide = await app.request('/api/env-vars', asKey())
    expect(orgWide.status).toBe(200)
    const orgBody = (await orgWide.json()) as { data: { name: string }[] }
    expect(orgBody.data.map((v) => v.name)).toEqual(['ORG_WIDE'])
  })
})

const ORG_KEY = 'ask_test-org-key'

function asOrgKey(init?: { method?: string; body?: string }): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${ORG_KEY}`,
      'Content-Type': 'application/json',
    },
  }
}

describe('organization-level API keys', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createApiKey({
      id: 'org-key-1',
      organizationId: TEST_ORG_ID,
      projectId: null,
      createdBy: TEST_USER_ID,
      name: 'org key',
      keyHash: await hashApiKey(ORG_KEY),
      keyPrefix: ORG_KEY.slice(0, 8),
      scopes: JSON.stringify(['read', 'write']),
      expiresAt: null,
    })
  })

  it('manages org resources', async () => {
    const project = await app.request(
      '/api/projects',
      asOrgKey({ method: 'POST', body: JSON.stringify({ name: 'From key', slug: 'from-key' }) }),
    )
    expect(project.status).toBe(201)

    const connection = await app.request(
      '/api/connections',
      asOrgKey({
        method: 'POST',
        body: JSON.stringify({ provider: 'cloudflare', credentials: { a: 'b' }, name: 'c' }),
      }),
    )
    expect(connection.status).toBe(201)
  })

  it('is refused on project and workflow routes, reads included', async () => {
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })

    for (const [path, init] of [
      ['/api/workflows', asOrgKey()],
      ['/api/workflows/wf-1', asOrgKey()],
      ['/api/runs', asOrgKey()],
      ['/api/deployments', asOrgKey()],
    ] as const) {
      const res = await app.request(path, init)
      expect(res.status, path).toBe(403)
      const body = (await res.json()) as { error: string }
      expect(body.error, path).toContain('organization-level API key')
    }
  })

  it('manages only org-wide variables', async () => {
    await mockDb.createEnvVar({
      id: 'env-proj',
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'PROJ_VAR',
      value: 'v',
      isSecret: false,
    })

    const orgWide = await app.request(
      '/api/env-vars',
      asOrgKey({ method: 'POST', body: JSON.stringify({ name: 'ORG_NEW', value: 'v' }) }),
    )
    expect(orgWide.status).toBe(201)

    const intoProject = await app.request(
      '/api/env-vars',
      asOrgKey({
        method: 'POST',
        body: JSON.stringify({ name: 'NOPE', value: 'v', projectId: TEST_PROJECT_ID }),
      }),
    )
    expect(intoProject.status).toBe(403)

    const patchProject = await app.request(
      '/api/env-vars/env-proj',
      asOrgKey({ method: 'PATCH', body: JSON.stringify({ value: 'x' }) }),
    )
    expect(patchProject.status).toBe(404)

    const listProject = await app.request(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, asOrgKey())
    expect(listProject.status).toBe(404)
  })

  it('mints project keys, never org keys', async () => {
    const minted = await app.request(
      '/api/api-keys',
      asOrgKey({
        method: 'POST',
        body: JSON.stringify({
          name: 'ci key',
          projectId: TEST_PROJECT_ID,
          scopes: ['read', 'write'],
        }),
      }),
    )
    expect(minted.status).toBe(201)
    const body = (await minted.json()) as { key: string; projectId: string }
    expect(body.key).toMatch(/^ask_/)
    expect(body.projectId).toBe(TEST_PROJECT_ID)

    const peer = await app.request(
      '/api/api-keys',
      asOrgKey({
        method: 'POST',
        body: JSON.stringify({ name: 'peer', scopes: ['read', 'write'] }),
      }),
    )
    expect(peer.status).toBe(403)

    const listed = await app.request('/api/api-keys', asOrgKey())
    expect(listed.status).toBe(403)
  })

  it('never mints past itself: scopes and expiry are capped at its own', async () => {
    // The org key holds read+write — deploy would be an escalation.
    const escalated = await app.request(
      '/api/api-keys',
      asOrgKey({
        method: 'POST',
        body: JSON.stringify({
          name: 'escalated',
          projectId: TEST_PROJECT_ID,
          scopes: ['read', 'deploy'],
        }),
      }),
    )
    expect(escalated.status).toBe(403)
    expect(JSON.stringify(await escalated.json())).toContain('deploy')

    // An expiring caller cannot mint a key that outlives it.
    const EXPIRING_KEY = 'ask_test-expiring-org-key'
    const callerExpiry = new Date(Date.now() + 60 * 60_000).toISOString()
    await mockDb.createApiKey({
      id: 'org-key-2',
      organizationId: TEST_ORG_ID,
      projectId: null,
      createdBy: TEST_USER_ID,
      name: 'expiring org key',
      keyHash: await hashApiKey(EXPIRING_KEY),
      keyPrefix: EXPIRING_KEY.slice(0, 8),
      scopes: JSON.stringify(['read', 'write']),
      expiresAt: callerExpiry,
    })
    const outliving = await app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${EXPIRING_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'outliving',
        projectId: TEST_PROJECT_ID,
        scopes: ['read'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(),
      }),
    })
    expect(outliving.status).toBe(201)
    const capped = (await outliving.json()) as { expiresAt: string }
    expect(capped.expiresAt).toBe(callerExpiry)
  })

  it('stops working when its creator leaves the organization', async () => {
    const GHOST_KEY = 'ask_test-ghost-key'
    await mockDb.createApiKey({
      id: 'org-key-ghost',
      organizationId: TEST_ORG_ID,
      projectId: null,
      createdBy: 'departed-user',
      name: 'ghost key',
      keyHash: await hashApiKey(GHOST_KEY),
      keyPrefix: GHOST_KEY.slice(0, 8),
      scopes: JSON.stringify(['read', 'write']),
      expiresAt: null,
    })
    const res = await app.request('/api/connections', {
      headers: { Authorization: `Bearer ${GHOST_KEY}` },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('no longer a member')
  })

  it('a project key still cannot mint anything', async () => {
    await mockDb.createProject({
      id: OTHER_PROJECT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Other',
      slug: 'other',
    })
    await seedProjectKey()
    const res = await app.request(
      '/api/api-keys',
      asKey({
        method: 'POST',
        body: JSON.stringify({ name: 'x', projectId: TEST_PROJECT_ID, scopes: ['read'] }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('lists one project server-side, with names joined and revoked keys gone', async () => {
    await mockDb.createProject({
      id: OTHER_PROJECT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Other',
      slug: 'other',
    })
    await seedProjectKey()
    await mockDb.createApiKey({
      id: 'key-other',
      organizationId: TEST_ORG_ID,
      projectId: OTHER_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'other project key',
      keyHash: 'hash-other',
      keyPrefix: 'ask_othe',
      scopes: '["read"]',
      expiresAt: null,
    })
    await mockDb.revokeApiKey('key-other', TEST_ORG_ID)

    const [url, init] = asSession(`/api/api-keys?projectId=${TEST_PROJECT_ID}`, {})
    const res = await app.request(url, init)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { id: string; projectName: string }[] }
    expect(body.data.map((k) => k.id)).toEqual(['key-1'])
    expect(body.data[0]?.projectName).toBe('Test Project')

    const [allUrl, allInit] = asSession('/api/api-keys', {})
    const all = await app.request(allUrl, allInit)
    const allBody = (await all.json()) as { data: { id: string }[] }
    expect(allBody.data.map((k) => k.id)).toContain('key-1')
    expect(allBody.data.map((k) => k.id)).not.toContain('key-other')
  })

  it('sessions create org keys and revoke within the org', async () => {
    const created = await app.request(
      ...asSession('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'session org key', scopes: ['read', 'write'] }),
      }),
    )
    expect(created.status).toBe(201)
    const body = (await created.json()) as { id: string; projectId: null; organizationId: string }
    expect(body.projectId).toBeNull()
    expect(body.organizationId).toBe(TEST_ORG_ID)

    const revoked = await app.request(
      ...asSession(`/api/api-keys/${body.id}`, { method: 'DELETE' }),
    )
    expect(revoked.status).toBe(200)
  })
})
