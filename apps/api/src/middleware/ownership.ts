import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'
import { apiKeyProjectPin } from './auth.js'
import { applyGrantRows } from './access.js'

/**
 * A workflow item route: the workflow, read together with the caller's rows
 * in its workspace. One they may not open — a hidden workspace, another
 * project — is not found, and the roles set here are what the capability
 * gates on edit, deploy and run read.
 */
export const requireWorkflowAccess = createMiddleware<AppEnv>(async (c, next) => {
  const workflowId = c.req.param('workflowId') ?? c.req.param('id')
  if (!workflowId) return c.json({ error: 'Not found' }, 404)

  const found = await c.get('db').getWorkflowForUser(c.get('userId'), workflowId)
  if (!found || found.workflow.projectId !== c.get('projectId')) {
    return c.json({ error: 'Not found' }, 404)
  }
  // requireProject already pinned a key to its project; the equality above holds it.
  const pin = apiKeyProjectPin(c)
  if (pin !== null && found.workflow.projectId !== pin) return c.json({ error: 'Not found' }, 404)

  c.set('workflow', found.workflow)
  c.set('workspaceId', found.workflow.workspaceId)
  applyGrantRows(c, found, true)
  await next()
})

export const requireConnectionAccess = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const connectionId = c.req.param('connectionId') ?? c.req.param('id')

  if (!connectionId) return c.json({ error: 'Not found' }, 404)

  const connection = await db.getProviderConnectionById(connectionId)
  if (!connection || connection.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('connection', connection)
  await next()
})
