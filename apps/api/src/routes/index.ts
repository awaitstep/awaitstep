import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { requireWorkflowOwner, requireConnectionOwner } from '../middleware/ownership.js'
import { workflows } from './workflows.js'
import { versions } from './versions.js'
import { connections } from './connections.js'
import { deploy } from './deploy.js'

export function createRouter(auth: Auth) {
  const router = new Hono<AppEnv>()

  // Auth — all API routes require authentication
  router.use('*', createAuthMiddleware(auth))

  // Ownership — workflow routes
  router.use('/workflows/:id', requireWorkflowOwner)
  router.use('/workflows/:workflowId/versions', requireWorkflowOwner)
  router.use('/workflows/:workflowId/versions/*', requireWorkflowOwner)
  router.use('/workflows/:workflowId/deploy', requireWorkflowOwner)
  router.use('/workflows/:workflowId/trigger', requireWorkflowOwner)

  // Ownership — connection routes
  router.use('/connections/:id', requireConnectionOwner)

  // Routes
  router.route('/workflows', workflows)
  router.route('/workflows', versions)
  router.route('/workflows', deploy)
  router.route('/connections', connections)

  return router
}
