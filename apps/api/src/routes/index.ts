import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import {
  createAuthMiddleware,
  requireOrgLevelAuth,
  requireScope,
  requireSessionAuth,
} from '../middleware/auth.js'
import {
  requireProject,
  requireProjectParam,
  requireOrganization,
  requireWorkspace,
  resolveOptionalOrganization,
} from '../middleware/project.js'
import { createBudget, createRateLimiter } from '../middleware/rate-limit.js'
import {
  requireOrgCan,
  requireProjectCan,
  requireWorkspaceCan,
  requireWorkspaceCanWrite,
} from '../middleware/access.js'
import { requireWorkflowAccess, requireConnectionAccess } from '../middleware/ownership.js'
import { workflows } from './workflows.js'
import { versions } from './versions.js'
import { source } from './source.js'
import { projectFiles } from './project-files.js'
import { createConnectionRoutes } from './connections.js'
import { deploy } from './deploy.js'
import { runs } from './runs.js'
import { apiKeys } from './api-keys.js'
import { envVars } from './env-vars.js'
import { projects } from './projects.js'
import { nodes } from './nodes.js'
import { marketplace } from './marketplace.js'
import { localDev } from './local-dev.js'
import { testSessions, workflowTestSessions } from './test-sessions.js'
import { workspaces } from './workspaces.js'
import { scope } from './scope.js'
import { members, workspaceMembers } from './members.js'
import { invitations, myInvitations } from './invitations.js'
import { accessRequests, workspaceAccessRequests } from './access-requests.js'
import { runsQuerySchema, workspaceRunFilter } from './runs-query.js'

export function createRouter(auth: Auth, options?: { enableLocalDev?: boolean }) {
  const router = new Hono<AppEnv>()

  // Global rate limit — 200 requests per minute per IP
  router.use('*', createRateLimiter({ windowMs: 60_000, max: 200 }))

  // Auth — all API routes require authentication
  router.use('*', createAuthMiddleware(auth))

  // A `/x/*` pattern also matches `/x` itself in Hono, so one registration
  // covers a collection and everything under it. Registering both ran each
  // middleware — and its membership or ownership query — twice per request.

  // Organization context — required for org-scoped routes
  router.use('/connections/*', requireOrganization)
  router.use('/env-vars/*', requireOrganization)
  router.use('/projects', requireOrganization)
  router.use('/api-keys/*', requireOrganization)
  router.use('/marketplace/*', requireOrganization)
  router.use('/failing', requireOrganization)
  // Failing runs across the organization answer for a person; a key is pinned narrower.
  router.use('/failing', requireSessionAuth)
  // A project item carries its own organization; the read also brings the
  // caller's roles. `/x/*` matches `/x` too, so one registration covers both.
  router.use('/projects/:id/*', requireProjectParam)

  // People, invitations and requests answer for a person: session only.
  // `/members` reads a project's members with `&project=`, else the org's.
  router.use('/members/*', requireSessionAuth)
  router.use('/members', async (c, next) =>
    c.req.query('project') || c.req.query('projectId')
      ? requireProject(c, next)
      : requireOrganization(c, next),
  )
  router.use('/members/:userId/*', requireOrganization)
  router.use('/invitations/*', requireSessionAuth)
  router.use('/invitations', requireOrganization)
  router.post('/invitations/:id/resend', requireOrganization)
  router.delete('/invitations/:id', requireOrganization)
  router.use('/me/*', requireSessionAuth)
  router.use('/access-requests/*', requireSessionAuth)
  router.use('/workspaces/:id/members/*', requireSessionAuth)
  router.use('/workspaces/:id/access-request', requireSessionAuth)
  router.use('/workspaces/:id/access-requests', requireSessionAuth)
  // The node palette also loads before an organization is chosen: without
  // one it gets the public registry, with one the organization's installs —
  // membership checked either way, never an arbitrary id.
  router.use('/nodes/*', resolveOptionalOrganization)

  // Project context — required for project-scoped routes (also sets organizationId)
  router.use('/workflows/*', requireProject)
  router.use('/deployments', requireProject)
  router.use('/runs', requireProject)
  router.use('/test-sessions/*', requireProject)
  // The collection is addressed by project; an item carries its own project.
  router.use('/workspaces', requireProject)
  router.use('/workspaces/:id/*', requireWorkspace)

  // The dashboard's own reads answer for a person: session only.
  router.use('/scope', requireSessionAuth)
  router.use('/orgs', requireSessionAuth)

  // What each role may do, from the capability tables in @awaitstep/ir —
  // the same answer the dashboard's disabled buttons give. After the scope
  // middleware set the roles, before the scope and limiter checks, so a
  // refused caller spends no write budget. Workflow routes are gated below
  // the ownership read, which is what resolves their workspace role.
  router.patch('/projects/:id', requireProjectCan('manageSettings'))
  router.delete('/projects/:id', requireProjectCan('delete'))
  router.post('/projects/:id/move', requireProjectCan('move'))
  router.post('/workspaces', requireProjectCan('createWorkspace'))
  router.patch('/workspaces/:id', requireWorkspaceCan('manageSettings'))
  router.delete('/workspaces/:id', requireWorkspaceCan('delete'))
  router.post('/workspaces/:id/move-workflows', requireWorkspaceCan('manageSettings'))
  router.post('/workspaces/:id/members', requireWorkspaceCan('manageMembers'))
  router.patch('/workspaces/:id/members/:userId', requireWorkspaceCan('manageMembers'))
  router.delete('/workspaces/:id/members/:userId', requireWorkspaceCan('manageMembers'))
  router.get('/members/:userId/access', requireOrgCan('manageSettings'))
  router.put('/members/:userId/access', requireOrgCan('manageSettings'))
  router.delete('/members/:userId', requireOrgCan('manageSettings'))
  // The list carries each invitation's id, which is its link.
  router.get('/invitations', requireOrgCan('manageSettings'))
  router.post('/invitations', requireOrgCan('manageSettings'))
  router.post('/invitations/:id/resend', requireOrgCan('manageSettings'))
  router.delete('/invitations/:id', requireOrgCan('manageSettings'))

  // Ownership — workflow routes
  router.use('/workflows/:id', requireWorkflowAccess)
  router.use('/workflows/:id/full', requireWorkflowAccess)
  router.use('/workflows/:id/move', requireWorkflowAccess)
  router.use('/workflows/:workflowId/versions/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/source/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/project/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/files/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy-config/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy-stream', requireWorkflowAccess)
  router.use('/workflows/:workflowId/trigger', requireWorkflowAccess)
  router.use('/workflows/:workflowId/takedown', requireWorkflowAccess)
  router.use('/workflows/:workflowId/runs/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deployments', requireWorkflowAccess)
  router.use('/workflows/:workflowId/test-sessions', requireWorkflowAccess)

  // Workflow writes by the caller's role in the workflow's workspace: a
  // Viewer reads and runs; an Editor builds and deploys; keys act as their
  // creator. The ownership read above set the role.
  for (const path of [
    '/workflows/:id',
    '/workflows/:id/move',
    '/workflows/:workflowId/versions',
    '/workflows/:workflowId/versions/:versionId',
    '/workflows/:workflowId/versions/:versionId/revert',
    '/workflows/:workflowId/files/*',
    '/workflows/:workflowId/project/convert-handlers',
    '/workflows/:workflowId/test-sessions',
  ]) {
    router.use(path, requireWorkspaceCanWrite('edit'))
  }
  for (const path of [
    '/workflows/:workflowId/deploy',
    '/workflows/:workflowId/deploy-stream',
    '/workflows/:workflowId/takedown',
    '/workflows/:workflowId/deploy-config/*',
  ]) {
    router.use(path, requireWorkspaceCanWrite('deploy'))
  }
  for (const path of [
    '/workflows/:workflowId/trigger',
    '/workflows/:workflowId/runs/:runId/pause',
    '/workflows/:workflowId/runs/:runId/resume',
    '/workflows/:workflowId/runs/:runId/terminate',
  ]) {
    router.post(path, requireWorkspaceCan('run'))
  }

  // Ownership — connection routes (skip non-ID sub-routes)
  router.use('/connections/:id', async (c, next) => {
    if (c.req.param('id') === 'verify-token') return next()
    return requireConnectionAccess(c, next)
  })

  // Scope enforcement for API key auth
  // All authenticated routes require at least 'read' scope
  router.use('*', requireScope('read'))

  // Write operations require 'write' scope
  router.post('/workflows/:workflowId/versions', requireScope('write'))
  router.patch('/workflows/:workflowId/versions/:versionId', requireScope('write'))
  router.post('/workflows/:workflowId/versions/:versionId/revert', requireScope('write'))
  router.delete('/workflows/:workflowId/versions/:versionId', requireScope('write'))
  router.put('/workflows/:workflowId/files/*', requireScope('write'))
  router.delete('/workflows/:workflowId/files/*', requireScope('write'))
  router.post('/workflows/:workflowId/project/convert-handlers', requireScope('write'))
  router.post('/workflows/:workflowId/test-sessions', requireScope('write'))
  router.post('/test-sessions/:sessionId/trigger', requireScope('write'))
  router.delete('/test-sessions/:sessionId', requireScope('write'))
  router.post('/workflows', requireScope('write'))
  router.patch('/workflows/:id', requireScope('write'))
  router.patch('/workflows/:id/move', requireScope('write'))
  router.delete('/workflows/:id', requireScope('write'))
  router.post('/workspaces', requireScope('write'))
  router.patch('/workspaces/:id', requireScope('write'))
  router.delete('/workspaces/:id', requireScope('write'))
  router.post('/workspaces/:id/move-workflows', requireScope('write'))
  router.post('/projects/:id/move', requireScope('write'))
  router.post('/connections', requireScope('write'))
  router.patch('/connections/:id', requireScope('write'))
  router.delete('/connections/:id', requireScope('write'))

  // Project mutations require 'write' scope
  router.post('/projects', requireScope('write'))
  router.patch('/projects/:id', requireScope('write'))
  router.delete('/projects/:id', requireScope('write'))

  // Deploy operations require 'deploy' scope
  router.post('/workflows/:workflowId/deploy', requireScope('deploy'))
  router.post('/workflows/:workflowId/deploy-stream', requireScope('deploy'))
  router.post('/workflows/:workflowId/trigger', requireScope('deploy'))
  router.post('/workflows/:workflowId/takedown', requireScope('deploy'))

  // Run lifecycle control requires 'deploy' scope
  router.post('/workflows/:workflowId/runs/:runId/pause', requireScope('deploy'))
  router.post('/workflows/:workflowId/runs/:runId/resume', requireScope('deploy'))
  router.post('/workflows/:workflowId/runs/:runId/terminate', requireScope('deploy'))

  // Marketplace write operations require 'write' scope
  router.post('/marketplace/install', requireScope('write'))
  router.post('/marketplace/uninstall', requireScope('write'))
  router.post('/marketplace/update', requireScope('write'))

  // Env var write operations require 'write' scope
  router.post('/env-vars', requireScope('write'))
  router.patch('/env-vars/:id', requireScope('write'))
  router.delete('/env-vars/:id', requireScope('write'))

  // Org-level mutations are closed to project-scoped API keys: a project key
  // must not rewrite the connections, projects or installed nodes every other
  // project depends on. Env vars are handled in their routes instead — a
  // project key may still manage its own project's variables.
  router.post('/connections', requireOrgLevelAuth)
  router.patch('/connections/:id', requireOrgLevelAuth)
  router.delete('/connections/:id', requireOrgLevelAuth)
  router.post('/projects', requireOrgLevelAuth)
  router.patch('/projects/:id', requireOrgLevelAuth)
  router.delete('/projects/:id', requireOrgLevelAuth)
  router.post('/projects/:id/move', requireSessionAuth)
  router.post('/marketplace/install', requireOrgLevelAuth)
  router.post('/marketplace/uninstall', requireOrgLevelAuth)
  router.post('/marketplace/update', requireOrgLevelAuth)

  // API key management is session-only, with one exemption: POST /api-keys
  // also accepts an organization-level key, which may mint project keys (the
  // handler refuses minting past the caller: level, scopes, expiry). A
  // catch-all, so a route added here later is closed by default.
  const apiKeysGuard = createMiddleware<AppEnv>(async (c, next) => {
    const isCreate = c.req.method === 'POST' && /\/api-keys\/?$/.test(c.req.path)
    if (isCreate) return requireOrgLevelAuth(c, next)
    return requireSessionAuth(c, next)
  })
  router.use('/api-keys/*', apiKeysGuard)
  router.post('/api-keys', requireScope('write'))

  // Stricter rate limits for sensitive endpoints (per user). Registered after
  // every scope and level check: a request those refuse must not spend its
  // owner's budget — a leaked read key hammering deploy would otherwise lock
  // the owner out of deploying for the window.
  const userKey = (c: { get: (key: 'userId') => string }): string => c.get('userId')
  const writeLimit = createRateLimiter({ windowMs: 60_000, max: 30, keyGenerator: userKey })
  const verifyLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  const deployLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  const apiKeyCreateLimit = createRateLimiter({ windowMs: 60_000, max: 5, keyGenerator: userKey })
  const marketplaceLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  // Every invitation sends an email to whatever address it names: requests
  // are limited here, and the emails themselves are budgeted per person in
  // the route (one request may name twenty addresses).
  const inviteLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  const emailBudget = createBudget({ windowMs: 60 * 60_000, max: 100 })
  router.use('/invitations/*', async (c, next) => {
    c.set('emailBudget', emailBudget)
    await next()
  })

  router.post('/projects', writeLimit)
  router.patch('/projects/:id', writeLimit)
  router.delete('/projects/:id', writeLimit)
  router.post('/projects/:id/move', writeLimit)
  router.put('/members/:userId/access', writeLimit)
  router.delete('/members/:userId', writeLimit)
  router.post('/workspaces/:id/members', writeLimit)
  router.patch('/workspaces/:id/members/:userId', writeLimit)
  router.delete('/workspaces/:id/members/:userId', writeLimit)
  router.post('/invitations', inviteLimit)
  router.post('/invitations/:id/resend', inviteLimit)
  router.post('/invitations/:id/ask-again', inviteLimit)
  router.post('/workspaces/:id/access-requests', writeLimit)
  router.post('/access-requests/:id/approve', writeLimit)
  router.post('/access-requests/:id/decline', writeLimit)
  router.post('/workspaces', writeLimit)
  router.patch('/workspaces/:id', writeLimit)
  router.delete('/workspaces/:id', writeLimit)
  router.post('/workspaces/:id/move-workflows', writeLimit)
  router.use('/connections/verify-token', verifyLimit)
  router.use('/workflows/:workflowId/deploy', deployLimit)
  router.use('/workflows/:workflowId/deploy-stream', deployLimit)
  router.use('/workflows/:workflowId/trigger', writeLimit)
  // Starting a session is the expensive verb; reading one is a poll, and
  // sharing the deploy limiter let polling spend the budget for deploys.
  router.post('/workflows/:workflowId/test-sessions', deployLimit)
  router.use('/workflows/:workflowId/takedown', writeLimit)
  router.post('/api-keys', apiKeyCreateLimit)
  router.post('/marketplace/install', marketplaceLimit)
  router.post('/marketplace/uninstall', marketplaceLimit)
  router.post('/marketplace/update', marketplaceLimit)

  // Local dev routes (opt-in via ENABLE_LOCAL_DEV)
  if (options?.enableLocalDev) {
    router.use('/workflows/:workflowId/local-dev/*', requireWorkflowAccess)
    // Running the workflow's code on the host is building it: an Editor's
    // act, like every other workflow write; reading its logs is not.
    router.use('/workflows/:workflowId/local-dev/*', requireWorkspaceCanWrite('edit'))
    // Starting, stopping and triggering a local wrangler process is run
    // control — not something a read key does. Its own budget for starts
    // (spawning a process on the host), the write budget for stop and
    // trigger: sharing the deploy limiter let a few local triggers block
    // real deploys. Scope first, so a refused call spends nothing.
    const localDevStartLimit = createRateLimiter({
      windowMs: 60_000,
      max: 10,
      keyGenerator: userKey,
    })
    for (const action of ['start', 'stop', 'trigger']) {
      router.post(`/workflows/:workflowId/local-dev/${action}`, requireScope('deploy'))
    }
    router.post('/workflows/:workflowId/local-dev/start', localDevStartLimit)
    router.post('/workflows/:workflowId/local-dev/stop', writeLimit)
    router.post('/workflows/:workflowId/local-dev/trigger', writeLimit)
    router.route('/workflows', localDev)
  }

  // Routes
  router.route('/workflows', workflows)
  router.route('/workflows', versions)
  router.route('/workflows', source)
  router.route('/workflows', projectFiles)
  router.route('/workflows', deploy)
  router.route('/workflows', runs)
  router.route('/workflows', workflowTestSessions)
  router.route('/', testSessions)
  router.route('/connections', createConnectionRoutes())
  router.route('/api-keys', apiKeys)
  router.route('/env-vars', envVars)
  router.route('/projects', projects)
  router.route('/workspaces', workspaces)
  router.route('/workspaces/:id/members', workspaceMembers)
  router.route('/workspaces/:id', workspaceAccessRequests)
  router.route('/members', members)
  router.route('/invitations', invitations)
  router.route('/me/invitations', myInvitations)
  router.route('/access-requests', accessRequests)
  router.route('/', scope)
  router.route('/nodes', nodes)
  router.route('/marketplace', marketplace)

  // Global deployments list (across all project's workflows)
  router.get('/deployments', zValidator('query', paginationQuerySchema), async (c) => {
    const db = c.get('db')
    const projectId = c.get('projectId')
    const { cursor, limit } = c.req.valid('query')
    const result = await db.listRecentDeploymentsByProject(
      projectId,
      { cursor, limit },
      c.get('userId'),
    )
    return c.json(result)
  })

  // Global runs list: across the project's workflows, or — with a workspace
  // named — that workspace's, with the filters and counts its Runs page shows.
  router.get('/runs', zValidator('query', runsQuerySchema), async (c) => {
    const db = c.get('db')
    const query = c.req.valid('query')
    const workspaceId = c.get('workspaceId')
    if (workspaceId) {
      return c.json(await db.listWorkspaceRuns(workspaceId, workspaceRunFilter(query)))
    }
    if (query.result || query.period || query.search) {
      return c.json({ error: 'Filtering runs needs a workspace' }, 400)
    }
    const result = await db.listRecentRunsByProject(
      c.get('projectId'),
      { cursor: query.cursor, limit: query.limit },
      c.get('userId'),
    )
    return c.json(result)
  })

  return router
}
