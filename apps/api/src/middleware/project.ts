import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

// The one membership check for organization context. API key auth already
// set organizationId — a project key's comes off its project, an
// organization key carries its own. A session names one, and it is always
// membership-checked; `optional` only decides whether naming none is allowed.
function organizationContext(options: { optional: boolean }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('apiKeyScopes') !== null) return next()

    const organizationId = c.req.query('organizationId')
    if (!organizationId) {
      if (options.optional) return next()
      return c.json({ error: 'Missing organizationId query parameter' }, 400)
    }

    const isMember = await c.get('db').isOrgMember(c.get('userId'), organizationId)
    if (!isMember) {
      return c.json({ error: 'Not found' }, 404)
    }

    c.set('organizationId', organizationId)
    await next()
  })
}

export const requireOrganization = organizationContext({ optional: false })

/** A session may omit the organization and get no organization context. */
export const resolveOptionalOrganization = organizationContext({ optional: true })

export const requireProject = createMiddleware<AppEnv>(async (c, next) => {
  // A project key already carries projectId and organizationId. An
  // organization-level key carries no project — and gets none here: org
  // management and project work never share a key.
  if (c.get('apiKeyScopes') !== null) {
    if ((c.get('projectId') as string | undefined) === undefined) {
      return c.json({ error: 'An organization-level API key cannot access project resources' }, 403)
    }
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
