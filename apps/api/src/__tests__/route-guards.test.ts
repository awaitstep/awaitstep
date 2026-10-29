import { describe, it, expect, beforeAll } from 'vitest'
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

/**
 * Every route that changes state carries a guard — enumerated from the app's
 * real route table, so a mutation route added tomorrow without a scope rule
 * fails here instead of shipping. Probed behaviourally rather than by
 * inspecting middleware: what matters is that the request is refused.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// POSTs that read and change nothing — open to a read key by design.
const READ_SCOPE_BY_DESIGN = new Map([
  ['POST /api/workflows/:workflowId/source/check', 'checks a candidate, writes nothing'],
  ['POST /api/workflows/:workflowId/deploy-config-preview', 'computes a preview, writes nothing'],
  ['POST /api/connections/verify-token', 'asks Cloudflare whether a token is valid'],
])

// better-auth owns its namespace and its own session rules.
const OUT_OF_SCOPE = (path: string) => path.startsWith('/api/auth/')

const READ_KEY = 'ask_route-guards-read'
const ORG_KEY = 'ask_route-guards-org'
const ORG_READ_KEY = 'ask_route-guards-org-read'

function concrete(path: string): string {
  const owner = path.split('/')[2]
  const ids: Record<string, string> = {
    workflows: 'wf-1',
    connections: 'conn-1',
    // A real project: the guards, not existence, are what is probed.
    projects: TEST_PROJECT_ID,
    workspaces: TEST_WORKSPACE_ID,
    'env-vars': 'env-1',
    'api-keys': 'key-x',
  }
  return path
    .replace(/:path\{[^}]*\}|\*$/, 'lib/x.ts')
    .replace(/:workflowId/, 'wf-1')
    .replace(/:versionId/, 'v-1')
    .replace(/:runId/, 'run-1')
    .replace(/:sessionId/, 'sess-1')
    .replace(/:id/, ids[owner ?? ''] ?? 'x')
}

let app: ReturnType<typeof createTestApp>
let routes: { method: string; path: string }[]

beforeAll(async () => {
  resetStore()
  app = createTestApp({ enableLocalDev: true })
  await mockDb.createWorkflow({
    id: 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Guarded',
  })
  await mockDb.createConnection({
    id: 'conn-1',
    organizationId: TEST_ORG_ID,
    createdBy: TEST_USER_ID,
    provider: 'cloudflare',
    credentials: '{}',
    name: 'CF',
  })
  await mockDb.createApiKey({
    id: 'key-read',
    organizationId: TEST_ORG_ID,
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'read only',
    keyHash: await hashApiKey(READ_KEY),
    keyPrefix: READ_KEY.slice(0, 8),
    scopes: '["read"]',
  })
  await mockDb.createApiKey({
    id: 'key-org',
    organizationId: TEST_ORG_ID,
    projectId: null,
    createdBy: TEST_USER_ID,
    name: 'org writer',
    keyHash: await hashApiKey(ORG_KEY),
    keyPrefix: ORG_KEY.slice(0, 8),
    scopes: '["read","write","deploy"]',
  })

  await mockDb.createApiKey({
    id: 'key-org-read',
    organizationId: TEST_ORG_ID,
    projectId: null,
    createdBy: TEST_USER_ID,
    name: 'org reader',
    keyHash: await hashApiKey(ORG_READ_KEY),
    keyPrefix: ORG_READ_KEY.slice(0, 8),
    scopes: '["read"]',
  })

  const seen = new Set<string>()
  routes = []
  for (const route of app.routes) {
    const id = `${route.method} ${route.path}`
    if (!MUTATING.has(route.method) || OUT_OF_SCOPE(route.path) || seen.has(id)) continue
    seen.add(id)
    routes.push({ method: route.method, path: route.path })
  }
})

async function refusals(
  key: string,
  filter: (path: string) => boolean,
  reason?: RegExp,
): Promise<string[]> {
  const unguarded: string[] = []
  for (const { method, path } of routes) {
    if (!filter(path) || READ_SCOPE_BY_DESIGN.has(`${method} ${path}`)) continue
    const res = await app.request(concrete(path), {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (res.status !== 403) {
      unguarded.push(`${method} ${path} → ${res.status}`)
      continue
    }
    if (reason) {
      const body = (await res.json()) as { error?: string }
      if (!reason.test(body.error ?? '')) unguarded.push(`${method} ${path} → 403 "${body.error}"`)
    }
  }
  return unguarded
}

describe('mutation route guards', () => {
  it('finds the mutation routes — the enumeration itself still works', () => {
    // If the route table stops being readable, every check below passes
    // vacuously; this is the canary.
    expect(routes.length).toBeGreaterThan(30)
  })

  it('refuses every mutation to a read-only key', async () => {
    expect(await refusals(READ_KEY, () => true)).toEqual([])
  })

  it('refuses every project-scoped mutation to an organization-level key', async () => {
    const projectScoped = (path: string) =>
      path.startsWith('/api/workflows') || path.startsWith('/api/test-sessions')
    expect(await refusals(ORG_KEY, projectScoped)).toEqual([])
  })

  it('refuses org-level mutations to a read-only org key by scope', async () => {
    // A project key is refused on these by its level before scope is even
    // checked, so it cannot show a missing write rule; a read-only org key
    // can — and the refusal has to be the scope rule's, not some other 403.
    const orgLevel = (path: string) =>
      !path.startsWith('/api/workflows') &&
      !path.startsWith('/api/test-sessions') &&
      !path.startsWith('/api/workspaces') &&
      !path.startsWith('/api/api-keys/') &&
      // People, invitations and requests are session-only: a key is refused
      // for being a key, before any scope rule (checked above as a refusal).
      !path.startsWith('/api/members') &&
      !path.startsWith('/api/invitations') &&
      !path.startsWith('/api/access-requests') &&
      !path.startsWith('/api/projects/:id/move')
    expect(await refusals(ORG_READ_KEY, orgLevel, /missing required scope/)).toEqual([])
  })

  it('keeps the read-scope exemptions real routes', () => {
    // A renamed route would otherwise leave a stale exemption guarding
    // nothing — and the new name unexempted but unnoticed.
    const ids = new Set(routes.map((r) => `${r.method} ${r.path}`))
    for (const exempt of READ_SCOPE_BY_DESIGN.keys()) expect(ids.has(exempt), exempt).toBe(true)
  })
})
