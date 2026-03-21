import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

export const requireProject = createMiddleware<AppEnv>(async (c, next) => {
  // API key auth already sets projectId from the key's project
  if (c.get('apiKeyScopes') !== null) {
    return next()
  }

  // Session auth — projectId comes from query param
  const projectId = c.req.query('projectId')
  if (!projectId) {
    return c.json({ error: 'Missing projectId query parameter' }, 400)
  }

  const db = c.get('db')
  const project = await db.getProjectById(projectId)
  if (!project || project.organizationId !== c.get('organizationId')) {
    return c.json({ error: 'Project not found' }, 404)
  }

  c.set('projectId', projectId)
  await next()
})
