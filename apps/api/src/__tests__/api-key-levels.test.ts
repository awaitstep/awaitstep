import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { presetPermissions, type KeyPermissions } from '@awaitstep/ir'
import {
  createTestApp,
  resetStore,
  mockDb,
  TEST_USER_ID,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_WORKSPACE_ID,
} from './helpers.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { stubCloudflare } from './fixtures/cloudflare.js'

// Keys at three levels (B3): what each level reaches, and what a key's grid
// lets it do there. Project and workspace keys never manage organization
// resources; organization keys never touch workflows; every route a key
// may call needs its cell; keys never manage keys.

const OTHER_PROJECT_ID = 'test-project-2'
const PROJECT_KEY = 'ask_test-project-key'
const ORG_KEY = 'ask_test-org-key'

async function seedProjectKey(permissions: KeyPermissions = presetPermissions('project', 'full')) {
  await mockDb.createApiKey({
    id: 'key-1',
    level: 'project',
    organizationId: TEST_ORG_ID,
    projectIds: [TEST_PROJECT_ID],
    createdBy: TEST_USER_ID,
    name: 'project key',
    keyHash: await hashApiKey(PROJECT_KEY),
    keyPrefix: PROJECT_KEY.slice(0, 8),
    scopes: '["read","write","deploy"]',
    permissions: JSON.stringify(permissions),
    expiresAt: null,
  })
}

async function seedOrgKey(
  permissions: KeyPermissions = presetPermissions('organization', 'full'),
  overrides: { id?: string; createdBy?: string; raw?: string; parentKeyId?: string } = {},
) {
  const raw = overrides.raw ?? ORG_KEY
  await mockDb.createApiKey({
    id: overrides.id ?? 'org-key-1',
    level: 'organization',
    organizationId: TEST_ORG_ID,
    createdBy: overrides.createdBy ?? TEST_USER_ID,
    name: 'org key',
    keyHash: await hashApiKey(raw),
    keyPrefix: raw.slice(0, 8),
    scopes: '["read","write"]',
    permissions: JSON.stringify(permissions),
    expiresAt: null,
    parentKeyId: overrides.parentKeyId ?? null,
  })
}

function asKey(init?: { method?: string; body?: string }): RequestInit {
  return {
    ...init,
    headers: { Authorization: `Bearer ${PROJECT_KEY}`, 'Content-Type': 'application/json' },
  }
}

function asOrgKey(init?: { method?: string; body?: string }): RequestInit {
  return {
    ...init,
    headers: { Authorization: `Bearer ${ORG_KEY}`, 'Content-Type': 'application/json' },
  }
}

function asSession(path: string, init: { method?: string; body?: string }): [string, RequestInit] {
  const url = `${path}${path.includes('?') ? '&' : '?'}organizationId=${TEST_ORG_ID}`
  return [url, { ...init, headers: { 'Content-Type': 'application/json' } }]
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error?: string }).error ?? ''
}

describe('project keys never manage organization resources', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createProject({
      id: OTHER_PROJECT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Other Project',
      slug: 'other-project',
      defaultWorkspaceId: `${OTHER_PROJECT_ID}-ws`,
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

  it('cannot change, create or delete connections, whatever its grid', async () => {
    const patched = await app.request(
      '/api/connections/conn-1',
      asKey({
        method: 'PATCH',
        body: JSON.stringify({ credentials: { accountId: 'attacker', apiToken: 'x' } }),
      }),
    )
    expect(patched.status).toBe(403)
    expect(await errorOf(patched)).toContain('organization resources')
    const conn = await mockDb.getProviderConnectionById('conn-1', TEST_ORG_ID)
    expect(conn?.credentials).toContain('"accountId":"acct"')

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

  it('still reads the connections and nodes it deploys with', async () => {
    expect((await app.request('/api/connections', asKey())).status).toBe(200)
    expect((await app.request('/api/nodes', asKey())).status).toBe(200)
    // Not with a grid that cannot read workflows, though.
    await mockDb.revokeApiKey('key-1', { level: 'project', projectId: TEST_PROJECT_ID })
    await seedProjectKey({ runs: ['read'] })
    const refused = await app.request('/api/connections', asKey())
    expect(refused.status).toBe(403)
    expect(await errorOf(refused)).toBe('API key lacks permission: workflows:read')
  })

  it('cannot delete or rename another project — or its own — nor list the organization’s', async () => {
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
    const listed = await app.request('/api/projects', asKey())
    expect(listed.status).toBe(403)
    expect(await errorOf(listed)).toContain('organization resources')
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

  it('cannot move a workflow into another project: a move is a person’s', async () => {
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
    const body = (await res.json()) as { name: string; credentials: { apiToken: string } }
    expect(body.name).toBe('Renamed CF')
    expect(body.credentials.apiToken).not.toContain('token')
  })
})

describe('a key’s grid', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Gridded',
    })
  })

  it('names the cell a refused call needs', async () => {
    await seedProjectKey({ workflows: ['read', 'deploy', 'run'], runs: ['read'] })
    const edit = await app.request(
      '/api/workflows/wf-1',
      asKey({ method: 'PATCH', body: JSON.stringify({ name: 'x' }) }),
    )
    expect(edit.status).toBe(403)
    expect(await errorOf(edit)).toBe('API key lacks permission: workflows:write')
    const workspace = await app.request(
      '/api/workspaces',
      asKey({ method: 'POST', body: JSON.stringify({ name: 'x' }) }),
    )
    expect(await errorOf(workspace)).toBe('API key lacks permission: workspaces:write')
    const variables = await app.request(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, asKey())
    expect(variables.status).toBe(403)
    expect(await errorOf(variables)).toBe('API key lacks permission: variables:read')
    expect((await app.request('/api/workflows/wf-1', asKey())).status).toBe(200)
    expect((await app.request('/api/runs', asKey())).status).toBe(200)
  })

  it('refuses a grid it cannot read', async () => {
    await mockDb.createApiKey({
      id: 'key-bad',
      level: 'project',
      organizationId: TEST_ORG_ID,
      projectIds: [TEST_PROJECT_ID],
      createdBy: TEST_USER_ID,
      name: 'bad grid',
      keyHash: await hashApiKey(PROJECT_KEY),
      keyPrefix: PROJECT_KEY.slice(0, 8),
      scopes: '["read"]',
      permissions: '{"workflows":["fly"]}',
    })
    const res = await app.request('/api/workflows', asKey())
    expect(res.status).toBe(401)
    expect(await errorOf(res)).toContain('Invalid API key permissions')
  })
})

describe('project keys and variables', () => {
  let app: ReturnType<typeof createTestApp>
  const atOrg = { level: 'organization' as const, organizationId: TEST_ORG_ID }
  const atProject = {
    level: 'project' as const,
    organizationId: TEST_ORG_ID,
    projectId: TEST_PROJECT_ID,
  }

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createProject({
      id: OTHER_PROJECT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Other Project',
      slug: 'other-project',
      defaultWorkspaceId: `${OTHER_PROJECT_ID}-ws`,
    })
    await seedProjectKey()
    await mockDb.createEnvVar({
      id: 'env-org',
      place: atOrg,
      createdBy: TEST_USER_ID,
      name: 'ORG_WIDE',
      value: 'org-value',
      isSecret: false,
    })
    await mockDb.createEnvVar({
      id: 'env-own',
      place: atProject,
      createdBy: TEST_USER_ID,
      name: 'OWN_VAR',
      value: 'own-value',
      isSecret: false,
    })
  })

  it('creates variables in its own project, where its pin addresses them', async () => {
    const own = await app.request(
      '/api/env-vars',
      asKey({ method: 'POST', body: JSON.stringify({ name: 'NEW_VAR', value: 'v' }) }),
    )
    expect(own.status).toBe(201)
    expect(await own.json()).toMatchObject({ level: 'project', projectId: TEST_PROJECT_ID })
    // The level is in the query (B4): a body naming a project is refused, not obeyed.
    const inBody = await app.request(
      '/api/env-vars',
      asKey({
        method: 'POST',
        body: JSON.stringify({ name: 'NOPE', value: 'v', projectId: TEST_PROJECT_ID }),
      }),
    )
    expect(inBody.status).toBe(400)
    expect(await errorOf(inBody)).toMatch(/Address the level in the query/)
    const foreign = await app.request(
      `/api/env-vars?projectId=${OTHER_PROJECT_ID}`,
      asKey({ method: 'POST', body: JSON.stringify({ name: 'NOPE', value: 'v' }) }),
    )
    expect(foreign.status).toBe(404)
  })

  it('updates and deletes only its own project variables', async () => {
    const ownPatch = await app.request(
      '/api/env-vars/env-own',
      asKey({ method: 'PATCH', body: JSON.stringify({ value: 'updated' }) }),
    )
    expect(ownPatch.status).toBe(200)
    // An org-wide row is not at the key's address.
    const orgPatch = await app.request(
      '/api/env-vars/env-org',
      asKey({ method: 'PATCH', body: JSON.stringify({ value: 'hijacked' }) }),
    )
    expect(orgPatch.status).toBe(404)
    const orgRow = async () =>
      (
        (await (await app.request(...asSession('/api/env-vars', {}))).json()) as {
          data: { id: string; value: string }[]
        }
      ).data.find((v) => v.id === 'env-org')
    expect((await orgRow())?.value).toBe('org-value')
    const orgDelete = await app.request('/api/env-vars/env-org', asKey({ method: 'DELETE' }))
    expect(orgDelete.status).toBe(404)
    expect(await orgRow()).toBeDefined()
  })

  it('sessions create variables at the level they address', async () => {
    const orgWide = await app.request(
      ...asSession('/api/env-vars', {
        method: 'POST',
        body: JSON.stringify({ name: 'SESSION_ORG', value: 'v' }),
      }),
    )
    expect(orgWide.status).toBe(201)
    expect(await orgWide.json()).toMatchObject({ level: 'organization', projectId: null })
    const project = await app.request(
      ...asSession(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, {
        method: 'POST',
        body: JSON.stringify({ name: 'SESSION_PROJ', value: 'v' }),
      }),
    )
    expect(project.status).toBe(201)
    expect(await project.json()).toMatchObject({ level: 'project', projectId: TEST_PROJECT_ID })
  })

  it('refuses a name already set at the level, naming the fix', async () => {
    const again = await app.request(
      ...asSession(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, {
        method: 'POST',
        body: JSON.stringify({ name: 'OWN_VAR', value: 'v' }),
      }),
    )
    expect(again.status).toBe(409)
    expect(await errorOf(again)).toBe('OWN_VAR is already set here. Edit it instead')
    // The same name one level up is another variable.
    const atOrgLevel = await app.request(
      ...asSession('/api/env-vars', {
        method: 'POST',
        body: JSON.stringify({ name: 'OWN_VAR', value: 'v' }),
      }),
    )
    expect(atOrgLevel.status).toBe(201)
  })

  it('a stored secret never becomes readable by flipping its flag', async () => {
    await mockDb.createEnvVar({
      id: 'env-secret',
      place: atOrg,
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
    const listed = (await (await app.request(...asSession('/api/env-vars', {}))).json()) as {
      data: { id: string; isSecret: boolean; value: string }[]
    }
    expect(listed.data.find((v) => v.id === 'env-secret')).toMatchObject({
      isSecret: true,
      value: '••••••••',
    })
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

  it("cannot list another project's variables; reads its own and what resolves into it", async () => {
    const foreign = await app.request(
      `/api/env-vars?projectId=${OTHER_PROJECT_ID}`,
      asKey({ method: 'GET' }),
    )
    expect(foreign.status).toBe(404)
    const own = await app.request(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, asKey())
    expect(own.status).toBe(200)
    const ownBody = (await own.json()) as { data: { name: string }[] }
    expect(ownBody.data.map((v) => v.name)).toEqual(['OWN_VAR'])
    // An empty parameter names nothing: the pin answers, as with no parameter.
    expect((await app.request('/api/env-vars?project=&projectId=', asKey())).status).toBe(200)
    // Its pin is its address: the plain list is its project's own rows …
    const pinned = await app.request('/api/env-vars', asKey())
    expect(pinned.status).toBe(200)
    expect(((await pinned.json()) as { data: { name: string }[] }).data.map((v) => v.name)).toEqual(
      ['OWN_VAR'],
    )
    // … and the resolved read is what its workflows resolve against (D-B3-14 re-cut).
    const resolved = await app.request('/api/env-vars/resolved', asKey())
    expect(resolved.status).toBe(200)
    const resolvedBody = (await resolved.json()) as {
      data: { name: string; level: string; setAt: { level: string } }[]
    }
    expect(resolvedBody.data.map((v) => [v.name, v.level, v.setAt.level])).toEqual([
      ['OWN_VAR', 'project', 'project'],
      ['ORG_WIDE', 'organization', 'organization'],
    ])
  })
})

async function installNode(organizationId: string, nodeId: string) {
  await mockDb.installNode({
    id: `inst-${organizationId}-${nodeId}`,
    organizationId,
    nodeId,
    version: '1.0.0',
    bundle: JSON.stringify({
      definition: { id: nodeId, name: nodeId, version: '1.0.0', category: 'Utilities' },
      templates: { cloudflare: 'export default async function () {}' },
    }),
    installedBy: TEST_USER_ID,
  })
}

describe('organization-level API keys', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await seedOrgKey()
  })

  it('manages org resources', async () => {
    stubCloudflare()
    const project = await app.request(
      '/api/projects',
      asOrgKey({ method: 'POST', body: JSON.stringify({ name: 'From key', slug: 'from-key' }) }),
    )
    expect(project.status).toBe(201)
    const connection = await app.request(
      '/api/connections',
      asOrgKey({
        method: 'POST',
        body: JSON.stringify({
          provider: 'cloudflare',
          credentials: { accountId: '0123456789abcdef0123456789abcdef', apiToken: 'tok' },
          name: 'c',
        }),
      }),
    )
    expect(connection.status).toBe(201)
    vi.unstubAllGlobals()
  })

  it('is refused on project and workflow routes, reads included', async () => {
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
    for (const path of ['/api/workflows', '/api/workflows/wf-1', '/api/runs', '/api/deployments']) {
      const res = await app.request(path, asOrgKey())
      expect(res.status, path).toBe(403)
      expect(await errorOf(res), path).toContain('organization-level API key')
    }
  })

  it('manages only org-wide variables', async () => {
    await mockDb.createEnvVar({
      id: 'env-proj',
      place: { level: 'project', organizationId: TEST_ORG_ID, projectId: TEST_PROJECT_ID },
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
    // A project address is a project route: refused for its level, before any cell.
    const intoProject = await app.request(
      `/api/env-vars?projectId=${TEST_PROJECT_ID}`,
      asOrgKey({ method: 'POST', body: JSON.stringify({ name: 'NOPE', value: 'v' }) }),
    )
    expect(intoProject.status).toBe(403)
    expect(await errorOf(intoProject)).toMatch(/organization-level API key cannot access project/)
    const patchProject = await app.request(
      '/api/env-vars/env-proj',
      asOrgKey({ method: 'PATCH', body: JSON.stringify({ value: 'x' }) }),
    )
    expect(patchProject.status).toBe(404)
    const listProject = await app.request(`/api/env-vars?projectId=${TEST_PROJECT_ID}`, asOrgKey())
    expect(listProject.status).toBe(403)
    const resolved = await app.request(
      `/api/env-vars/resolved?projectId=${TEST_PROJECT_ID}`,
      asOrgKey(),
    )
    expect(resolved.status).toBe(403)
    expect((await app.request('/api/env-vars/resolved', asOrgKey())).status).toBe(400)
  })

  it('with a read-only grid, reads org resources and writes none', async () => {
    await mockDb.revokeApiKey('org-key-1', { level: 'organization', organizationId: TEST_ORG_ID })
    await seedOrgKey(presetPermissions('organization', 'read'))
    expect((await app.request('/api/projects', asOrgKey())).status).toBe(200)
    const created = await app.request(
      '/api/projects',
      asOrgKey({ method: 'POST', body: JSON.stringify({ name: 'nope', slug: 'nope' }) }),
    )
    expect(created.status).toBe(403)
    expect(await errorOf(created)).toBe('API key lacks permission: projects:write')
  })

  it('never lists, mints or revokes keys: that is a person’s', async () => {
    for (const [path, init] of [
      ['/api/api-keys', asOrgKey()],
      [
        '/api/api-keys',
        asOrgKey({
          method: 'POST',
          body: JSON.stringify({ name: 'x', level: 'organization', permissions: {} }),
        }),
      ],
      ['/api/api-keys/org-key-1', asOrgKey({ method: 'DELETE' })],
    ] as const) {
      const res = await app.request(path, init)
      expect(res.status, path).toBe(403)
      expect(await errorOf(res), path).toContain('session authentication')
    }
    await seedProjectKey()
    const byProjectKey = await app.request('/api/api-keys', asKey())
    expect(byProjectKey.status).toBe(403)
  })

  it('a key minted before B3 by another key still dies with its parent', async () => {
    const CHILD = 'ask_test-child-key'
    await seedOrgKey(presetPermissions('organization', 'read'), {
      id: 'child',
      raw: CHILD,
      parentKeyId: 'org-key-1',
    })
    const asChild = { headers: { Authorization: `Bearer ${CHILD}` } }
    expect((await app.request('/api/projects', asChild)).status).toBe(200)
    const revoked = await app.request(...asSession('/api/api-keys/org-key-1', { method: 'DELETE' }))
    expect(revoked.status).toBe(200)
    const after = await app.request('/api/projects', asChild)
    expect(after.status).toBe(401)
    expect(await errorOf(after)).toContain('revoked or expired')
  })

  it('stops working when its creator leaves the organization', async () => {
    const GHOST_KEY = 'ask_test-ghost-key'
    await seedOrgKey(undefined, { id: 'org-key-ghost', createdBy: 'departed-user', raw: GHOST_KEY })
    const res = await app.request('/api/connections', {
      headers: { Authorization: `Bearer ${GHOST_KEY}` },
    })
    expect(res.status).toBe(401)
    expect(await errorOf(res)).toContain('no longer a member')
  })

  it('the nodes routes take the org from context, never from the query', async () => {
    // Before the fix, any authenticated principal could pass a victim org's
    // id and read its installed-node list and templates. The victim org has
    // a node installed, so the old query-param behaviour fails these.
    await seedProjectKey()
    await installNode('victim-org', 'victim_secret_node')
    await installNode(TEST_ORG_ID, 'own_node')

    const foreign = await app.request('/api/nodes?organizationId=victim-org')
    expect(foreign.status).toBe(404)

    const keyed = await app.request('/api/nodes?organizationId=victim-org', asKey())
    expect(keyed.status).toBe(200)
    const keyedIds = ((await keyed.json()) as { id: string }[]).map((d) => d.id)
    expect(keyedIds).not.toContain('victim_secret_node')
    expect(keyedIds).toContain('own_node')

    const templates = await app.request('/api/nodes/templates?organizationId=victim-org', asKey())
    expect(Object.keys((await templates.json()) as object)).not.toContain('victim_secret_node')
  })

  it('a session without an organization still gets the public registry', async () => {
    await installNode(TEST_ORG_ID, 'own_node')
    const res = await app.request('/api/nodes')
    expect(res.status).toBe(200)
    const ids = ((await res.json()) as { id: string }[]).map((d) => d.id)
    expect(ids).not.toContain('own_node')
  })

  it('a single node is found among the organization installs too', async () => {
    await installNode(TEST_ORG_ID, 'own_node')
    const found = await app.request(`/api/nodes/own_node?organizationId=${TEST_ORG_ID}`)
    expect(found.status).toBe(200)
    const foreign = await app.request('/api/nodes/own_node?organizationId=victim-org')
    expect(foreign.status).toBe(404)
  })

  it('sessions mint org keys with a grid and revoke within the org', async () => {
    const created = await app.request(
      ...asSession('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: 'session org key',
          level: 'organization',
          permissions: { projects: ['read'] },
        }),
      }),
    )
    expect(created.status).toBe(201)
    const body = (await created.json()) as {
      id: string
      key: string
      level: string
      permissions: KeyPermissions
      organizationId: string
      keyHash?: string
    }
    expect(body.level).toBe('organization')
    expect(body.permissions).toEqual({ projects: ['read'] })
    expect(body.organizationId).toBe(TEST_ORG_ID)
    expect(body.key).toMatch(/^ask_/)
    expect(body.keyHash).toBeUndefined()
    const revoked = await app.request(
      ...asSession(`/api/api-keys/${body.id}`, { method: 'DELETE' }),
    )
    expect(revoked.status).toBe(200)
  })

  it('refuses an expiry already past, and a workspace named without its project', async () => {
    // A key minted already expired would answer 401 to its first call.
    const stale = await app.request(
      ...asSession('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: 'dead on arrival',
          level: 'organization',
          permissions: { projects: ['read'] },
          expiresAt: '2001-01-01T00:00:00.000Z',
        }),
      }),
    )
    expect(stale.status).toBe(422)
    // `?workspace=` without `&project=` is a project address with its project
    // missing — it used to list (and would have revoked at) the organization.
    const bare = await app.request(
      `/api/api-keys?organizationId=${TEST_ORG_ID}&workspaceId=${TEST_WORKSPACE_ID}`,
    )
    expect(bare.status).toBe(400)
    expect(await errorOf(bare)).toMatch(/projectId/)
  })
})

describe('local-dev routes', () => {
  it('run control needs the run cell, not just read', async () => {
    resetStore()
    const app = createTestApp({ enableLocalDev: true })
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Local',
    })
    await seedProjectKey({ workflows: ['read', 'write'] })
    const res = await app.request('/api/workflows/wf-1/local-dev/start', asKey({ method: 'POST' }))
    expect(res.status).toBe(403)
    expect(await errorOf(res)).toBe('API key lacks permission: workflows:run')
  })
})

describe('router middleware', () => {
  // In afterEach, not the test body: a failed assertion must not leave the
  // database spies in place for every test that runs after it.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a refused request does not spend its owner’s rate budget', async () => {
    // Limiters ran before the key's cell was checked: a leaked read key
    // hammering deploy got 403s and still locked its owner out of deploying
    // for the window.
    resetStore()
    const app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Budget',
    })
    await seedProjectKey(presetPermissions('project', 'read'))
    for (let i = 0; i < 10; i++) {
      const refused = await app.request(
        '/api/workflows/wf-1/deploy',
        asKey({ method: 'POST', body: JSON.stringify({ connectionId: 'none' }) }),
      )
      expect(refused.status).toBe(403)
    }
    const owner = await app.request(`/api/workflows/wf-1/deploy?projectId=${TEST_PROJECT_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: 'none' }),
    })
    expect(owner.status).not.toBe(429)
  })

  it('runs each membership and ownership check once per request', async () => {
    // A `/x/*` pattern also matches `/x` in Hono; registering both ran every
    // check — and its query — twice on collection routes.
    resetStore()
    const app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Once',
    })
    const isOrgMember = vi.spyOn(mockDb, 'getOrganizationIfMember')
    const getProjectIfMember = vi.spyOn(mockDb, 'getProjectIfMember')
    const getWorkflowForUser = vi.spyOn(mockDb, 'getWorkflowForUser')

    await app.request(`/api/connections?organizationId=${TEST_ORG_ID}`)
    expect(isOrgMember).toHaveBeenCalledTimes(1)

    await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`)
    expect(getProjectIfMember).toHaveBeenCalledTimes(1)

    getProjectIfMember.mockClear()
    await app.request(`/api/workflows/wf-1/versions?projectId=${TEST_PROJECT_ID}`)
    expect(getProjectIfMember).toHaveBeenCalledTimes(1)
    expect(getWorkflowForUser).toHaveBeenCalledTimes(1)

    // The keys routes read the addressed level once — not the organization
    // and then the level, as a leftover `/api-keys/*` registration did.
    isOrgMember.mockClear()
    getProjectIfMember.mockClear()
    await app.request(`/api/api-keys?organizationId=${TEST_ORG_ID}`)
    expect(isOrgMember).toHaveBeenCalledTimes(1)
    expect(getProjectIfMember).not.toHaveBeenCalled()
    isOrgMember.mockClear()
    expect((await app.request(`/api/api-keys?projectId=${TEST_PROJECT_ID}`)).status).toBe(200)
    expect(isOrgMember).not.toHaveBeenCalled()
    expect(getProjectIfMember).toHaveBeenCalledTimes(1)
  })
})
