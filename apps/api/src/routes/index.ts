import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { createAuthMiddleware, requireScope, requireSessionAuth } from '../middleware/auth.js'
import { requireProject, requireOrganization } from '../middleware/project.js'
import { createRateLimiter } from '../middleware/rate-limit.js'
import { requireWorkflowAccess, requireConnectionAccess } from '../middleware/ownership.js'
import { workflows } from './workflows.js'
import { versions } from './versions.js'
import { createConnectionRoutes } from './connections.js'
import { deploy } from './deploy.js'
import { runs } from './runs.js'
import { resources } from './resources.js'
import { apiKeys } from './api-keys.js'
import { envVars } from './env-vars.js'
import { projects } from './projects.js'
import { nodes } from './nodes.js'

export function createRouter(auth: Auth) {
  const router = new Hono<AppEnv>()

  // Global rate limit — 200 requests per minute per IP
  router.use('*', createRateLimiter({ windowMs: 60_000, max: 200 }))

  // Auth — all API routes require authentication
  router.use('*', createAuthMiddleware(auth))

  // Organization context — required for org-scoped routes
  router.use('/connections/*', requireOrganization)
  router.use('/connections', requireOrganization)
  router.use('/env-vars/*', requireOrganization)
  router.use('/env-vars', requireOrganization)
  router.use('/resources/*', requireOrganization)
  router.use('/projects/*', requireOrganization)
  router.use('/projects', requireOrganization)
  router.use('/api-keys/*', requireOrganization)
  router.use('/api-keys', requireOrganization)

  // Project context — required for project-scoped routes (also sets organizationId)
  router.use('/workflows/*', requireProject)
  router.use('/workflows', requireProject)
  router.use('/deployments', requireProject)
  router.use('/runs', requireProject)

  // Ownership — workflow routes
  router.use('/workflows/:id', requireWorkflowAccess)
  router.use('/workflows/:id/full', requireWorkflowAccess)
  router.use('/workflows/:id/move', requireWorkflowAccess)
  router.use('/workflows/:workflowId/versions', requireWorkflowAccess)
  router.use('/workflows/:workflowId/versions/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deploy-stream', requireWorkflowAccess)
  router.use('/workflows/:workflowId/trigger', requireWorkflowAccess)
  router.use('/workflows/:workflowId/takedown', requireWorkflowAccess)
  router.use('/workflows/:workflowId/runs', requireWorkflowAccess)
  router.use('/workflows/:workflowId/runs/*', requireWorkflowAccess)
  router.use('/workflows/:workflowId/deployments', requireWorkflowAccess)

  // Ownership — connection routes (skip non-ID sub-routes)
  router.use('/connections/:id', async (c, next) => {
    if (c.req.param('id') === 'verify-token') return next()
    return requireConnectionAccess(c, next)
  })

  // Stricter rate limits for sensitive endpoints (per user)
  const userKey = (c: { get: (key: 'userId') => string }): string => c.get('userId')
  const writeLimit = createRateLimiter({ windowMs: 60_000, max: 30, keyGenerator: userKey })
  const verifyLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  const deployLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: userKey })
  const queryLimit = createRateLimiter({ windowMs: 60_000, max: 20, keyGenerator: userKey })
  const apiKeyCreateLimit = createRateLimiter({ windowMs: 60_000, max: 5, keyGenerator: userKey })

  router.use('/connections/verify-token', verifyLimit)
  router.use('/workflows/:workflowId/deploy', deployLimit)
  router.use('/workflows/:workflowId/deploy-stream', deployLimit)
  router.use('/workflows/:workflowId/trigger', writeLimit)
  router.use('/workflows/:workflowId/takedown', writeLimit)
  router.use('/resources/d1/databases/:databaseId/query', queryLimit)
  router.post('/api-keys', apiKeyCreateLimit)

  // Scope enforcement for API key auth
  // All authenticated routes require at least 'read' scope
  router.use('*', requireScope('read'))

  // Write operations require 'write' scope
  router.post('/workflows/:workflowId/versions', requireScope('write'))
  router.patch('/workflows/:workflowId/versions/:versionId', requireScope('write'))
  router.post('/workflows/:workflowId/versions/:versionId/revert', requireScope('write'))
  router.delete('/workflows/:workflowId/versions/:versionId', requireScope('write'))
  router.post('/workflows', requireScope('write'))
  router.patch('/workflows/:id', requireScope('write'))
  router.patch('/workflows/:id/move', requireScope('write'))
  router.delete('/workflows/:id', requireScope('write'))
  router.post('/connections', requireScope('write'))
  router.patch('/connections/:id', requireScope('write'))
  router.delete('/connections/:id', requireScope('write'))

  // Deploy operations require 'deploy' scope
  router.post('/workflows/:workflowId/deploy', requireScope('deploy'))
  router.post('/workflows/:workflowId/deploy-stream', requireScope('deploy'))
  router.post('/workflows/:workflowId/trigger', requireScope('deploy'))
  router.post('/workflows/:workflowId/takedown', requireScope('deploy'))

  // Env var write operations require 'write' scope
  router.post('/env-vars', requireScope('write'))
  router.patch('/env-vars/:id', requireScope('write'))
  router.delete('/env-vars/:id', requireScope('write'))

  // API key management is session-only (no API key auth)
  router.use('/api-keys/*', requireSessionAuth)
  router.use('/api-keys', requireSessionAuth)

  // Routes
  router.route('/workflows', workflows)
  router.route('/workflows', versions)
  router.route('/workflows', deploy)
  router.route('/workflows', runs)
  router.route('/connections', createConnectionRoutes())
  router.route('/resources', resources)
  router.route('/api-keys', apiKeys)
  router.route('/env-vars', envVars)
  router.route('/projects', projects)
  router.route('/nodes', nodes)

  // Global deployments list (across all project's workflows)
  router.get('/deployments', async (c) => {
    const db = c.get('db')
    const projectId = c.get('projectId')
    const list = await db.listRecentDeploymentsByProject(projectId)
    return c.json(list)
  })

  // Global runs list (across all project's workflows)
  router.get('/runs', async (c) => {
    const db = c.get('db')
    const projectId = c.get('projectId')
    const list = await db.listRecentRunsByProject(projectId)
    return c.json(list)
  })

  return router
}
