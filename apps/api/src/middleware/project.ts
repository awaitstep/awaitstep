import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

export const requireOrganization = createMiddleware<AppEnv>(async (c, next) => {
  // API key auth already sets organizationId (derived from project)
  if (c.get('apiKeyScopes') !== null) {
    return next()
  }

  const organizationId = c.req.query('organizationId')
  if (!organizationId) {
    return c.json({ error: 'Missing organizationId query parameter' }, 400)
  }

  const db = c.get('db')
  const userId = c.get('userId')
  const isMember = await db.isOrgMember(userId, organizationId)
  if (!isMember) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('organizationId', organizationId)
  await next()
})

export const requireProject = createMiddleware<AppEnv>(async (c, next) => {
  // API key auth already sets projectId and organizationId
  if (c.get('apiKeyScopes') !== null) {
    return next()
  }

  const projectId = c.req.query('projectId')
  if (!projectId) {
    return c.json({ error: 'Missing projectId query parameter' }, 400)
  }

  const db = c.get('db')
  const userId = c.get('userId')
  const project = await db.getProjectIfMember(userId, projectId)
  if (!project) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('projectId', projectId)
  c.set('organizationId', project.organizationId)
  await next()
})
