import { createMiddleware } from 'hono/factory'
import { ACCESS_REASONS, isOrgAdmin } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

/**
 * Managing projects and workspaces — creating, renaming, deleting, moving
 * workflows between them — is for the organization's owners and admins until
 * project and workspace roles arrive (B2). The role comes from the scope
 * middleware for a session and from the key's creator for a key, so this
 * runs after those and before the rate limiters, as every refusal must.
 */
export const requireOrgAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isOrgAdmin(c.get('orgRole'))) {
    return c.json({ error: ACCESS_REASONS.projectAdmins }, 403)
  }
  return next()
})
