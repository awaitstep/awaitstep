import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import type { SelfHostedConnection } from '../app.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { requireWorkflowOwner, requireConnectionOwner } from '../middleware/ownership.js'
import { workflows } from './workflows.js'
import { versions } from './versions.js'
import { createConnectionRoutes } from './connections.js'
import { deploy } from './deploy.js'
import { runs } from './runs.js'
import { resources } from './resources.js'

export function createRouter(auth: Auth, selfHostedConnection?: SelfHostedConnection) {
  const router = new Hono<AppEnv>()

  // Auth — all API routes require authentication
  router.use('*', createAuthMiddleware(auth))

  // Ownership — workflow routes
  router.use('/workflows/:id', requireWorkflowOwner)
  router.use('/workflows/:workflowId/versions', requireWorkflowOwner)
  router.use('/workflows/:workflowId/versions/*', requireWorkflowOwner)
  router.use('/workflows/:workflowId/deploy', requireWorkflowOwner)
  router.use('/workflows/:workflowId/deploy-stream', requireWorkflowOwner)
  router.use('/workflows/:workflowId/trigger', requireWorkflowOwner)
  router.use('/workflows/:workflowId/takedown', requireWorkflowOwner)
  router.use('/workflows/:workflowId/runs', requireWorkflowOwner)
  router.use('/workflows/:workflowId/runs/*', requireWorkflowOwner)
  router.use('/workflows/:workflowId/deployments', requireWorkflowOwner)

  // Ownership — connection routes (skip non-ID sub-routes)
  router.use('/connections/:id', async (c, next) => {
    if (c.req.param('id') === 'verify-token' || c.req.param('id') === 'self-hosted') return next()
    return requireConnectionOwner(c, next)
  })

  // Routes
  router.route('/workflows', workflows)
  router.route('/workflows', versions)
  router.route('/workflows', deploy)
  router.route('/workflows', runs)
  router.route('/connections', createConnectionRoutes(selfHostedConnection))
  router.route('/resources', resources)

  // Global deployments list (across all user's workflows)
  router.get('/deployments', async (c) => {
    const db = c.get('db')
    const userId = c.get('userId')
    const list = await db.listRecentDeploymentsByUser(userId)
    return c.json(list)
  })

  return router
}
