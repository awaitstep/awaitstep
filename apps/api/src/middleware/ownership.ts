import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

export const requireWorkflowAccess = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const projectId = c.get('projectId')
  const workflowId = c.req.param('workflowId') ?? c.req.param('id')

  if (!workflowId) return c.json({ error: 'Not found' }, 404)

  const workflow = await db.getWorkflowById(workflowId)
  if (!workflow || workflow.projectId !== projectId) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('workflow', workflow)
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
