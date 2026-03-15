import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

export const requireWorkflowOwner = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflowId = c.req.param('workflowId') ?? c.req.param('id')

  if (!workflowId) return c.json({ error: 'Not found' }, 404)

  const workflow = await db.getWorkflowById(workflowId)
  if (!workflow || workflow.userId !== userId) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('workflow', workflow)
  await next()
})

export const requireConnectionOwner = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const connectionId = c.req.param('connectionId') ?? c.req.param('id')

  if (!connectionId) return c.json({ error: 'Not found' }, 404)

  const connection = await db.getConnectionById(connectionId)
  if (!connection || connection.userId !== userId) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('connection', connection)
  await next()
})
