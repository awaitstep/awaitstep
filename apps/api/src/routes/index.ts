import { Hono } from 'hono'
import type { KeyAction, KeyResource } from '@awaitstep/ir'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { apiKeyLevel, createAuthMiddleware, requireSessionAuth } from '../middleware/auth.js'
import {
  requireKeyMapped,
  requireKeyPermission,
  type KeyCell,
} from '../middleware/key-permissions.js'
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
import { requireLevelCan } from '../middleware/level.js'
import { workflows } from './workflows.js'
import { versions } from './versions.js'
import { source } from './source.js'
import { projectFiles } from './project-files.js'
import { createConnectionRoutes } from './connections.js'
import { projectConnectionRoutes } from './project-connections.js'
import { audit } from './audit.js'
import { notifications } from './notifications.js'
import { releases } from './releases.js'
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
import { projectPeople, workspaceInvitations } from './place-people.js'
import { accessRequests, workspaceAccessRequests } from './access-requests.js'
import { runsQuerySchema, workspaceRunFilter } from './runs-query.js'
import { account } from './account.js'
import { orgLogo } from './org-logo.js'

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
  // Variables are addressed at their level (B4): a query naming a project or
  // a workspace, or a project key's pin, is a project address with that
  // level's one scope read; otherwise the organization's.
  router.use('/env-vars/*', async (c, next) =>
    ['project', 'projectId', 'workspace', 'workspaceId'].some((param) => c.req.query(param)) ||
    apiKeyLevel(c) === 'project' ||
    apiKeyLevel(c) === 'workspace'
      ? requireProject(c, next)
      : requireOrganization(c, next),
  )
  router.use('/projects', requireOrganization)
  router.use('/marketplace/*', requireOrganization)
  router.use('/audit-events', requireOrganization)
  router.use('/failing', requireOrganization)
  // Failing runs across the organization answer for a person; a key is pinned narrower.
  router.use('/failing', requireSessionAuth)
  // A project item carries its own organization; the read also brings the
  // caller's roles. `/x/*` matches `/x` too, so one registration covers both.
  router.use('/projects/:id/*', requireProjectParam)

  // People, invitations and requests answer for a person: session only —
  // except the two people lists, which a key holding `members:read` may
  // read: an organization key the organization's (`/members?org=`), a
  // project key its project's (`/members` reads the project's with
  // `&project=` or a project key's pin, else the org's); a workspace key
  // holds no `members` cell and is refused.
  router.use('/members/:userId/*', requireSessionAuth)
  router.use('/members', async (c, next) =>
    c.req.query('project') ||
    c.req.query('projectId') ||
    apiKeyLevel(c) === 'project' ||
    apiKeyLevel(c) === 'workspace'
      ? requireProject(c, next)
      : requireOrganization(c, next),
  )
  router.use('/members/:userId/*', requireOrganization)
  router.use('/invitations/*', requireSessionAuth)
  router.use('/invitations', requireOrganization)
  router.post('/invitations/:id/resend', requireOrganization)
  router.delete('/invitations/:id', requireOrganization)
  router.use('/me/*', requireSessionAuth)
  // The Inbox and What's new are a person's (B8): no key reads or marks them.
  router.use('/notifications/*', requireSessionAuth)
  router.use('/notifications/*', requireOrganization)
  router.use('/releases/*', requireSessionAuth)
  router.use('/access-requests/*', requireSessionAuth)
  router.post('/workspaces/:id/members', requireSessionAuth)
  router.post('/workspaces/:id/invitations', requireSessionAuth)
  router.post('/projects/:id/members', requireSessionAuth)
  router.post('/projects/:id/invitations', requireSessionAuth)
  router.patch('/workspaces/:id/members/:userId', requireSessionAuth)
  router.delete('/workspaces/:id/members/:userId', requireSessionAuth)
  router.use('/workspaces/:id/access-request', requireSessionAuth)
  router.use('/workspaces/:id/access-requests', requireSessionAuth)
  // API key management is a person's (D-B3-5): listing, minting and revoking
  // keys take a session, addressed at the level they manage — `?org=`,
  // `&project=`, `&workspace=` — with that level's one scope read. A
  // workspace named without its project is a project address with the
  // project missing (400), never the organization's keys.
  router.use('/api-keys/*', requireSessionAuth)
  router.use('/api-keys/*', async (c, next) =>
    ['project', 'projectId', 'workspace', 'workspaceId'].some((param) => c.req.query(param))
      ? requireProject(c, next)
      : requireOrganization(c, next),
  )
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
  // The org list, and an org's logo (`/orgs/:orgId/logo`).
  router.use('/orgs/*', requireSessionAuth)
  // Your account (B10) is the person's alone: no key reads or changes it.
  router.use('/account/*', requireSessionAuth)

  // What each role may do, from the capability tables in @awaitstep/ir —
  // the same answer the dashboard's disabled buttons give. After the scope
  // middleware set the roles, before the scope and limiter checks, so a
  // refused caller spends no write budget. Workflow routes are gated below
  // the ownership read, which is what resolves their workspace role.
  router.patch('/projects/:id', requireProjectCan('manageSettings'))
  router.delete('/projects/:id', requireProjectCan('delete'))
  router.post('/projects/:id/move', requireProjectCan('move'))
  router.put('/projects/:id/lock', requireProjectCan('toggleLock'))
  router.post('/workspaces', requireProjectCan('createWorkspace'))
  router.patch('/workspaces/:id', requireWorkspaceCan('manageSettings'))
  router.delete('/workspaces/:id', requireWorkspaceCan('delete'))
  router.put('/workspaces/:id/lock', requireWorkspaceCan('toggleLock'))
  router.post('/workspaces/:id/move-workflows', requireWorkspaceCan('manageSettings'))
  router.post('/workspaces/:id/members', requireWorkspaceCan('manageMembers'))
  // Adding people from a project or workspace (21a, 21b): its admins, never
  // wider than that place; an email becomes an org Member invite with it.
  router.post('/workspaces/:id/invitations', requireWorkspaceCan('manageMembers'))
  router.post('/projects/:id/members', requireProjectCan('manageMembers'))
  router.post('/projects/:id/invitations', requireProjectCan('manageMembers'))
  // A project's accounts (23a): its admins and the org's owners and admins
  // (D-PC-3); anyone who can open the project reads them. Sharing a new one
  // with the whole organization is refused in the handler for anyone else.
  router.post('/projects/:id/connections', requireProjectCan('manageSettings'))
  router.post('/projects/:id/connections/new', requireProjectCan('manageSettings'))
  router.patch('/projects/:id/connections/:connectionId', requireProjectCan('manageSettings'))
  router.delete('/projects/:id/connections/:connectionId', requireProjectCan('manageSettings'))
  router.put('/projects/:id/default-connection', requireProjectCan('manageSettings'))
  router.put(
    '/projects/:id/workspaces/:workspaceId/connection',
    requireProjectCan('manageSettings'),
  )
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
  // The audit log is the organization's owners' and admins' (D-P7-7); a key
  // reads it as its creator, who must still be one.
  router.get('/audit-events', requireOrgCan('manageSettings'))
  // Variables are set by whoever manages the addressed level (B4): org
  // owners and admins, project admins, workspace admins. A key acts with its
  // creator's standing here as everywhere.
  router.post('/env-vars', requireLevelCan('manageVariables'))
  router.patch('/env-vars/:id', requireLevelCan('manageVariables'))
  router.delete('/env-vars/:id', requireLevelCan('manageVariables'))

  // Ownership — workflow routes
  router.use('/workflows/:id', requireWorkflowAccess)
  router.use('/workflows/:id/full', requireWorkflowAccess)
  router.use('/workflows/:id/move', requireWorkflowAccess)
  router.use('/workflows/:id/share', requireWorkflowAccess)
  router.use('/workflows/:workflowId/versions/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/source/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/project/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/files/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy-config/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy-connections', requireWorkflowAccess)
  // The preview reads nothing of the workflow yet, but it is addressed by
  // one: a hidden workflow — another workspace's, for a workspace key — is
  // not found here as everywhere else.
  router.use('/workflows/:workflowId/deploy-config-preview', requireWorkflowAccess)
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
  // Sharing is its own capability in the workflow's own workspace (B6).
  router.put('/workflows/:id/share', requireWorkspaceCan('share'))
  for (const path of [
    '/workflows/:workflowId/trigger',
    '/workflows/:workflowId/runs/:runId/pause',
    '/workflows/:workflowId/runs/:runId/resume',
    '/workflows/:workflowId/runs/:runId/terminate',
  ]) {
    router.post(path, requireWorkspaceCan('run'))
  }

  // Connections are the organization's settings: changing them is an owner's
  // or admin's (D-B9-7); a key manages what its creator may.
  router.post('/connections', requireOrgCan('manageSettings'))
  router.patch('/connections/:id', requireOrgCan('manageSettings'))
  router.delete('/connections/:id', requireOrgCan('manageSettings'))

  // Ownership — connection routes (skip non-ID sub-routes)
  router.use('/connections/:id', async (c, next) => {
    if (c.req.param('id') === 'verify-token') return next()
    return requireConnectionAccess(c, next)
  })

  // What each route needs of an API key (B3): one cell of the catalog in
  // @awaitstep/ir, judged by requireKeyPermission; sessions pass. A route
  // with no mapping is closed to keys by the catch-all registered after the
  // last mapping (below the local-dev block). Reads of the organization's
  // connections, nodes and variables are open to project and workspace keys
  // through their own cells: they deploy with and resolve against them.
  const key = (
    resource: KeyResource,
    action: KeyAction,
    below?: Partial<Record<'project' | 'workspace', KeyCell>>,
  ) => requireKeyPermission(resource, action, below)
  const buildReads: KeyCell = ['workflows', 'read']
  const belowReads = { project: buildReads, workspace: buildReads }
  const variables = (action: KeyAction) => ({
    project: ['variables', action] as KeyCell,
    workspace: ['variables', action] as KeyCell,
  })

  // Organization level. Only routes that exist are mapped: a mapping with no
  // handler behind it would claim a route the API does not have (the sweep
  // in route-guards.test.ts checks).
  router.get('/projects', key('projects', 'read'))
  router.post('/projects', key('projects', 'write'))
  router.patch('/projects/:id', key('projects', 'write'))
  router.delete('/projects/:id', key('projects', 'delete'))
  router.post('/projects/:id/move', requireSessionAuth)
  // The deletion lock guards against a mistaken delete: a key that may
  // delete must not be able to lift it first (D-B5-3).
  router.put('/projects/:id/lock', requireSessionAuth)
  router.put('/workspaces/:id/lock', requireSessionAuth)
  // Everything under a project item is the project's (project keys are refused
  // there) and organization keys never touch workflows: the project's shared
  // library is a person's read. A workspace's "Shared with" list is a key's.
  router.get('/projects/:id/shared', requireSessionAuth)
  // The empty-project page's counts: a person's dashboard read (B9).
  router.get('/projects/:id/setup', requireSessionAuth)
  // A project's accounts: an organization key with the connections cells.
  router.get('/projects/:id/connections', key('connections', 'read'))
  router.get('/projects/:id/connections/available', key('connections', 'read'))
  router.post('/projects/:id/connections', key('connections', 'write'))
  router.post('/projects/:id/connections/new', key('connections', 'write'))
  router.patch('/projects/:id/connections/:connectionId', key('connections', 'write'))
  router.delete('/projects/:id/connections/:connectionId', key('connections', 'delete'))
  router.put('/projects/:id/default-connection', key('connections', 'write'))
  router.put('/projects/:id/workspaces/:workspaceId/connection', key('connections', 'write'))
  router.get('/connections', key('connections', 'read', belowReads))
  // Asks Cloudflare whether a token is valid; writes nothing.
  router.post('/connections/verify-token', key('connections', 'read', belowReads))
  router.post('/connections', key('connections', 'write'))
  router.patch('/connections/:id', key('connections', 'write'))
  router.delete('/connections/:id', key('connections', 'delete'))
  router.get('/nodes/*', key('resources', 'read', belowReads))
  router.get('/marketplace/*', key('resources', 'read', belowReads))
  router.post('/marketplace/install', key('resources', 'write'))
  router.post('/marketplace/update', key('resources', 'write'))
  router.post('/marketplace/uninstall', key('resources', 'delete'))
  router.get('/env-vars', key('resources', 'read', variables('read')))
  router.get('/env-vars/resolved', key('resources', 'read', variables('read')))
  router.post('/env-vars', key('resources', 'write', variables('write')))
  router.patch('/env-vars/:id', key('resources', 'write', variables('write')))
  router.delete('/env-vars/:id', key('resources', 'delete', variables('delete')))
  router.get('/members', key('members', 'read'))
  // Organization keys only: the audit log is no project's (B7).
  router.get('/audit-events', key('audit', 'read'))
  router.get('/workspaces/:id/members', key('members', 'read'))

  // Project level: workspaces (a workspace key holds no such cell)
  router.get('/workspaces', key('workspaces', 'read'))
  router.get('/workspaces/:id', key('workspaces', 'read'))
  router.post('/workspaces', key('workspaces', 'write'))
  router.patch('/workspaces/:id', key('workspaces', 'write'))
  router.post('/workspaces/:id/move-workflows', key('workspaces', 'write'))
  router.delete('/workspaces/:id', key('workspaces', 'delete'))
  router.get('/workspaces/:id/shared', key('workflows', 'read'))

  // Project and workspace level: workflows and runs
  for (const path of [
    '/workflows',
    '/workflows/:id',
    '/workflows/:id/full',
    '/workflows/:workflowId/versions',
    '/workflows/:workflowId/versions/:versionId',
    '/workflows/:workflowId/source',
    '/workflows/:workflowId/project',
    '/workflows/:workflowId/project/convert-handlers',
    '/workflows/:workflowId/files/*',
    '/workflows/:workflowId/deploy-config/:connectionId',
    '/workflows/:workflowId/deploy-connections',
    '/workflows/:workflowId/test-sessions',
    '/test-sessions/:sessionId/stream',
  ]) {
    router.get(path, key('workflows', 'read'))
  }
  // Checks and previews: read-only by design, whatever their method.
  router.post('/workflows/:workflowId/source/check', key('workflows', 'read'))
  router.post('/workflows/:workflowId/deploy-config-preview', key('workflows', 'read'))
  router.post('/workflows', key('workflows', 'write'))
  router.patch('/workflows/:id', key('workflows', 'write'))
  router.put('/workflows/:id/share', key('workflows', 'write'))
  // A move crosses projects: never a key's (the handler says so for the old clients too).
  router.patch('/workflows/:id/move', requireSessionAuth)
  router.post('/workflows/:workflowId/versions', key('workflows', 'write'))
  router.patch('/workflows/:workflowId/versions/:versionId', key('workflows', 'write'))
  router.post('/workflows/:workflowId/versions/:versionId/revert', key('workflows', 'write'))
  router.put('/workflows/:workflowId/files/*', key('workflows', 'write'))
  router.post('/workflows/:workflowId/project/convert-handlers', key('workflows', 'write'))
  router.post('/workflows/:workflowId/test-sessions', key('workflows', 'write'))
  router.delete('/workflows/:id', key('workflows', 'delete'))
  router.delete('/workflows/:workflowId/versions/:versionId', key('workflows', 'delete'))
  router.delete('/workflows/:workflowId/files/*', key('workflows', 'delete'))
  router.post('/workflows/:workflowId/deploy', key('workflows', 'deploy'))
  router.post('/workflows/:workflowId/deploy-stream', key('workflows', 'deploy'))
  router.post('/workflows/:workflowId/takedown', key('workflows', 'deploy'))
  router.post('/workflows/:workflowId/trigger', key('workflows', 'run'))
  router.post('/workflows/:workflowId/runs/:runId/pause', key('workflows', 'run'))
  router.post('/workflows/:workflowId/runs/:runId/resume', key('workflows', 'run'))
  router.post('/workflows/:workflowId/runs/:runId/terminate', key('workflows', 'run'))
  router.post('/test-sessions/:sessionId/trigger', key('workflows', 'run'))
  router.delete('/test-sessions/:sessionId', key('workflows', 'run'))
  for (const path of [
    '/runs',
    '/deployments',
    '/workflows/:workflowId/runs',
    '/workflows/:workflowId/runs/:runId',
    '/workflows/:workflowId/runs/:runId/steps',
    '/workflows/:workflowId/runs/:runId/stream',
    '/workflows/:workflowId/deployments',
  ]) {
    router.get(path, key('runs', 'read'))
  }

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
  const exportLimit = createRateLimiter({ windowMs: 60 * 60_000, max: 10, keyGenerator: userKey })
  // Every upload stores bytes; clearing one deletes them.
  const imageLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  // Every invitation sends an email to whatever address it names: requests
  // are limited here, and the emails themselves are budgeted per person in
  // the route (one request may name twenty addresses).
  const inviteLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  const emailBudget = createBudget({ windowMs: 60 * 60_000, max: 100 })
  // One budget per person wherever an invite is sent from: the org, a project or a workspace.
  const withEmailBudget = createMiddleware<AppEnv>(async (c, next) => {
    c.set('emailBudget', emailBudget)
    await next()
  })
  router.use('/invitations/*', withEmailBudget)
  router.post('/projects/:id/invitations', withEmailBudget)
  router.post('/workspaces/:id/invitations', withEmailBudget)

  router.post('/account/orgs/:orgId/leave', writeLimit)
  router.delete('/account/sessions', writeLimit)
  router.delete('/account/sessions/:id', writeLimit)
  router.post('/account/export', exportLimit)
  router.put('/account/photo', imageLimit)
  router.delete('/account/photo', imageLimit)
  router.put('/orgs/:orgId/logo', imageLimit)
  router.delete('/orgs/:orgId/logo', imageLimit)
  router.post('/projects', writeLimit)
  router.patch('/projects/:id', writeLimit)
  router.delete('/projects/:id', writeLimit)
  router.post('/projects/:id/move', writeLimit)
  router.put('/projects/:id/lock', writeLimit)
  router.put('/members/:userId/access', writeLimit)
  router.delete('/members/:userId', writeLimit)
  router.post('/workspaces/:id/members', writeLimit)
  router.patch('/workspaces/:id/members/:userId', writeLimit)
  router.delete('/workspaces/:id/members/:userId', writeLimit)
  router.post('/invitations', inviteLimit)
  router.post('/projects/:id/invitations', inviteLimit)
  router.post('/workspaces/:id/invitations', inviteLimit)
  router.post('/projects/:id/members', writeLimit)
  router.post('/invitations/:id/resend', inviteLimit)
  router.post('/invitations/:id/ask-again', inviteLimit)
  // Each decline (again after an Undo) puts a fresh row in the inviter's Inbox.
  router.post('/invitations/:id/decline', inviteLimit)
  router.post('/invitations/:id/undo-decline', inviteLimit)
  router.post('/workspaces/:id/access-requests', writeLimit)
  router.post('/access-requests/:id/approve', writeLimit)
  router.post('/access-requests/:id/decline', writeLimit)
  router.post('/workspaces', writeLimit)
  router.patch('/workspaces/:id', writeLimit)
  router.delete('/workspaces/:id', writeLimit)
  router.put('/workspaces/:id/lock', writeLimit)
  router.post('/workspaces/:id/move-workflows', writeLimit)
  router.put('/workflows/:id/share', writeLimit)
  router.post('/env-vars', writeLimit)
  router.patch('/env-vars/:id', writeLimit)
  router.delete('/env-vars/:id', writeLimit)
  router.use('/connections/verify-token', verifyLimit)
  // Every create, and an edit that replaces the token, asks Cloudflare: the verify budget.
  router.post('/connections', verifyLimit)
  router.patch('/connections/:id', verifyLimit)
  router.delete('/connections/:id', writeLimit)
  // Connecting a new account, or a new token for one the project owns, asks Cloudflare.
  router.post('/projects/:id/connections/new', verifyLimit)
  router.patch('/projects/:id/connections/:connectionId', verifyLimit)
  router.post('/projects/:id/connections', writeLimit)
  router.delete('/projects/:id/connections/:connectionId', writeLimit)
  router.put('/projects/:id/default-connection', writeLimit)
  router.put('/projects/:id/workspaces/:workspaceId/connection', writeLimit)
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
    // real deploys. The key's cell first, so a refused call spends nothing.
    const localDevStartLimit = createRateLimiter({
      windowMs: 60_000,
      max: 10,
      keyGenerator: userKey,
    })
    for (const action of ['start', 'stop', 'trigger']) {
      router.post(`/workflows/:workflowId/local-dev/${action}`, key('workflows', 'run'))
    }
    router.get('/workflows/:workflowId/local-dev/*', key('workflows', 'read'))
    router.post('/workflows/:workflowId/local-dev/start', localDevStartLimit)
    router.post('/workflows/:workflowId/local-dev/stop', writeLimit)
    router.post('/workflows/:workflowId/local-dev/trigger', writeLimit)
  }

  // After the last mapping and before the first handler: a key on a route
  // none judged is refused — the local-dev handlers included, so one added
  // there without a mapping is session-only like any other.
  router.use('*', requireKeyMapped)

  // Routes
  if (options?.enableLocalDev) router.route('/workflows', localDev)
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
  router.route('/workspaces/:id/invitations', workspaceInvitations)
  router.route('/projects/:id', projectPeople)
  router.route('/projects/:id', projectConnectionRoutes)
  router.route('/workspaces/:id', workspaceAccessRequests)
  router.route('/members', members)
  router.route('/invitations', invitations)
  router.route('/me/invitations', myInvitations)
  router.route('/access-requests', accessRequests)
  router.route('/', scope)
  router.route('/nodes', nodes)
  router.route('/marketplace', marketplace)
  router.route('/audit-events', audit)
  router.route('/notifications', notifications)
  router.route('/releases', releases)
  router.route('/account', account)
  router.route('/orgs', orgLogo)

  // Global deployments list (across all project's workflows)
  router.get('/deployments', zValidator('query', paginationQuerySchema), async (c) => {
    const db = c.get('db')
    const projectId = c.get('projectId')
    const { cursor, limit } = c.req.valid('query')
    const result = await db.listRecentDeploymentsByProject(
      projectId,
      { cursor, limit },
      c.get('userId'),
      c.get('workspaceId'),
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
      // One instant for the period and the hourly bars, so the bars add up to the count.
      const now = new Date()
      return c.json(await db.listWorkspaceRuns(workspaceId, workspaceRunFilter(query, now), now))
    }
    if (query.result || query.period || query.search || query.workflowId) {
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
