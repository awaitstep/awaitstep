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
import { presetPermissions } from '@awaitstep/ir'
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

// better-auth owns its namespace and its own session rules; the health check answers everyone.
const OUT_OF_SCOPE = (path: string) => path.startsWith('/api/auth/') || path === '/api/health'

const READ_KEY = 'ask_route-guards-read'
const ORG_KEY = 'ask_route-guards-org'
const ORG_READ_KEY = 'ask_route-guards-org-read'
const EMPTY_KEY = 'ask_route-guards-empty'
const FULL_PROJECT_KEY = 'ask_route-guards-project-full'
const FULL_WORKSPACE_KEY = 'ask_route-guards-workspace-full'

// Routes that answer for a person only: every key is refused, for being a key.
function sessionOnly(method: string, path: string): boolean {
  if (/^\/api\/(members\/:userId|invitations|me\/|access-requests|api-keys)/.test(path)) return true
  if (path === '/api/scope' || path === '/api/orgs' || path === '/api/failing') return true
  if (/^\/api\/workspaces\/:id\/access-request/.test(path)) return true
  if (/^\/api\/workspaces\/:id\/members/.test(path)) return method !== 'GET'
  return path === '/api/projects/:id/move' || path === '/api/workflows/:id/move'
}

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
let allRoutes: { method: string; path: string }[]

// The keys the probes call as: the secret, where it is minted and its grid.
const KEYS = [
  {
    id: 'key-read',
    secret: READ_KEY,
    level: 'project',
    grid: presetPermissions('project', 'read'),
  },
  {
    id: 'key-org',
    secret: ORG_KEY,
    level: 'organization',
    grid: presetPermissions('organization', 'full'),
  },
  {
    id: 'key-org-read',
    secret: ORG_READ_KEY,
    level: 'organization',
    grid: presetPermissions('organization', 'read'),
  },
  { id: 'key-empty', secret: EMPTY_KEY, level: 'project', grid: {} },
  {
    id: 'key-project-full',
    secret: FULL_PROJECT_KEY,
    level: 'project',
    grid: presetPermissions('project', 'full'),
  },
  {
    id: 'key-workspace-full',
    secret: FULL_WORKSPACE_KEY,
    level: 'workspace',
    grid: presetPermissions('workspace', 'full'),
  },
] as const
const hashes = new Map<string, string>()

/** A fresh store with the workflow, connection and keys every probe expects. */
async function seedGuarded() {
  resetStore()
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
  for (const key of KEYS) {
    const common = {
      id: key.id,
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      name: key.id,
      keyHash: hashes.get(key.secret)!,
      keyPrefix: key.secret.slice(0, 8),
      scopes: '["read","write","deploy"]',
      permissions: JSON.stringify(key.grid),
    }
    await mockDb.createApiKey(
      key.level === 'organization'
        ? { ...common, level: 'organization' }
        : key.level === 'project'
          ? { ...common, level: 'project', projectId: TEST_PROJECT_ID }
          : {
              ...common,
              level: 'workspace',
              projectId: TEST_PROJECT_ID,
              workspaceId: TEST_WORKSPACE_ID,
            },
    )
  }
}

beforeAll(async () => {
  for (const key of KEYS) hashes.set(key.secret, await hashApiKey(key.secret))
  await seedGuarded()
  app = createTestApp({ enableLocalDev: true })

  const seen = new Set<string>()
  routes = []
  allRoutes = []
  for (const route of app.routes) {
    const id = `${route.method} ${route.path}`
    if (OUT_OF_SCOPE(route.path) || seen.has(id) || route.method === 'ALL') continue
    seen.add(id)
    allRoutes.push({ method: route.method, path: route.path })
    if (MUTATING.has(route.method)) routes.push({ method: route.method, path: route.path })
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

  it('refuses org-level mutations to a read-only org key by its missing cell', async () => {
    // A project key is refused on these by its level before its grid is even
    // read, so it cannot show a missing cell; a read-only org key can — and
    // the refusal has to be the cell's, not some other 403.
    const orgLevel = (path: string) =>
      !path.startsWith('/api/workflows') &&
      !path.startsWith('/api/test-sessions') &&
      !path.startsWith('/api/workspaces') &&
      !path.startsWith('/api/api-keys') &&
      // People, invitations and requests are session-only: a key is refused
      // for being a key, before any cell (checked above as a refusal).
      !path.startsWith('/api/members') &&
      !path.startsWith('/api/invitations') &&
      !path.startsWith('/api/access-requests') &&
      !path.startsWith('/api/projects/:id/move')
    expect(await refusals(ORG_READ_KEY, orgLevel, /lacks permission/)).toEqual([])
  })

  it('refuses a key with an empty grid on every route, reads included', async () => {
    // Every route a key may reach carries a cell, and one no mapping covers
    // is closed to keys by the catch-all: nothing answers an empty grid.
    // Its own router: the global limiter counts per instance, and the probes
    // above have spent most of this one's minute.
    const fresh = createTestApp({ enableLocalDev: true })
    const open: string[] = []
    for (const { method, path } of allRoutes) {
      const res = await fresh.request(concrete(path), {
        method,
        headers: { Authorization: `Bearer ${EMPTY_KEY}`, 'Content-Type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' }),
      })
      if (res.status !== 403) open.push(`${method} ${path} → ${res.status}`)
    }
    expect(open).toEqual([])
  })

  it('keeps the read-scope exemptions real routes', () => {
    // A renamed route would otherwise leave a stale exemption guarding
    // nothing — and the new name unexempted but unnoticed.
    const ids = new Set(routes.map((r) => `${r.method} ${r.path}`))
    for (const exempt of READ_SCOPE_BY_DESIGN.keys()) expect(ids.has(exempt), exempt).toBe(true)
  })

  it('reaches every mapped route with a full key at its level, and keeps the rest session-only', async () => {
    // The empty-grid sweep shows no route answers a grid with nothing in it;
    // this one shows the mappings are real. Every route either answers a
    // full key at some level with something other than a key refusal, or is
    // session-only by design and refuses all three for being keys. A mapping
    // with no handler behind it passes its gate and falls to Hono's bare 404,
    // which no handler of the app's own returns.
    interface Outcome {
      status: number
      body: string
    }
    const levels = [FULL_PROJECT_KEY, FULL_WORKSPACE_KEY, ORG_KEY].map((key) => ({
      key,
      // A router per key: the global limiter counts per instance. The
      // per-user write limiter may still answer 429 late in a sweep, which
      // is after the key's gate and so counts as reached.
      app: createTestApp({ enableLocalDev: true }),
    }))
    const bodyOf = (res: Response) =>
      Promise.race([res.text(), new Promise<string>((r) => setTimeout(() => r(''), 2000))])
    // Refused for being a key: by a cell, a level, the catch-all, or a
    // session-only route's own gate.
    const keyRefusal = (o: Outcome) =>
      o.status === 403 && /API key|session authentication/.test(o.body)
    const bare404 = (o: Outcome) => o.status === 404 && o.body === '404 Not Found'
    const wrong: string[] = []
    for (const { method, path } of allRoutes) {
      const outcomes: Outcome[] = []
      for (const level of levels) {
        // A fresh store per probe: a full key deletes what the next one needs.
        await seedGuarded()
        const res = await level.app.request(concrete(path), {
          method,
          headers: { Authorization: `Bearer ${level.key}`, 'Content-Type': 'application/json' },
          ...(method === 'GET' ? {} : { body: '{}' }),
        })
        outcomes.push({ status: res.status, body: await bodyOf(res) })
      }
      const id = `${method} ${path}`
      const statuses = outcomes.map((o) => o.status).join('/')
      if (sessionOnly(method, path)) {
        if (!outcomes.every(keyRefusal)) wrong.push(`${id} answered a key: ${statuses}`)
      } else if (outcomes.every(keyRefusal)) {
        wrong.push(`${id} refused every full key: ${outcomes.map((o) => o.body).join(' | ')}`)
      } else if (!path.endsWith('*') && outcomes.some(bare404)) {
        wrong.push(`${id} is mapped but no handler answers it`)
      }
    }
    expect(wrong).toEqual([])
  })
})
