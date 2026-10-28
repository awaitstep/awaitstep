import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { headersForAuth } from '../lib/client-ip.js'
import { createLogger } from '../lib/logger.js'
import { parseOrgRole } from '../lib/org-role.js'

const log = createLogger('auth')

export type ApiKeyScope = 'read' | 'write' | 'deploy'

const scopesSchema = z.array(z.enum(['read', 'write', 'deploy']))

export function createAuthMiddleware(auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    // Try bearer token (API key) auth first
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const db = c.get('db')
      const keyHash = await hashApiKey(token)
      // One read resolves the key and its organization: a project key's
      // organization comes off its project, an org key carries its own.
      const apiKey = await db.getApiKeyAuthByHash(keyHash)

      if (!apiKey) {
        return c.json({ error: 'Invalid API key' }, 401)
      }

      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return c.json({ error: 'API key expired' }, 401)
      }

      let rawScopes: unknown
      try {
        rawScopes = JSON.parse(apiKey.scopes)
      } catch {
        return c.json({ error: 'Invalid API key scopes' }, 401)
      }
      const parsed = scopesSchema.safeParse(rawScopes)
      if (!parsed.success) {
        return c.json({ error: 'Invalid API key scopes' }, 401)
      }
      const scopes = parsed.data

      if (!apiKey.resolvedOrganizationId) {
        // A project key whose project is gone, or a malformed row.
        return c.json({ error: 'API key organization not found' }, 401)
      }

      // A key is the creator's standing in the organization, lent out: when
      // the creator leaves, every key they minted stops working.
      if (!apiKey.createdByIsMember) {
        return c.json({ error: 'API key creator is no longer a member of the organization' }, 401)
      }

      // A key minted by another key lives no longer than it: revoking a
      // leaked organization key takes everything it minted with it.
      if (!apiKey.parentKeyLive) {
        return c.json(
          { error: 'The API key that created this key has been revoked or expired' },
          401,
        )
      }

      c.set('userId', apiKey.createdBy)
      c.set('organizationId', apiKey.resolvedOrganizationId)
      // What the key may manage is what its creator may: the role is read in
      // the same statement as the membership above.
      c.set('orgRole', parseOrgRole(apiKey.createdByRole))
      // An organization-level key has no project: project-scoped routes
      // refuse it in requireProject.
      if (apiKey.projectId) {
        c.set('projectId', apiKey.projectId)
      }
      c.set('user', null)
      c.set('session', null)
      c.set('apiKeyId', apiKey.id)
      c.set('apiKeyScopes', scopes)
      c.set('apiKeyExpiresAt', apiKey.expiresAt)

      db.updateApiKeyLastUsed(apiKey.id, new Date().toISOString()).catch((err) => {
        log.error('Failed to update API key lastUsedAt', {
          apiKeyId: apiKey.id,
          error: err instanceof Error ? err.message : String(err),
        })
      })

      return next()
    }

    // Fall back to session cookie auth
    const session = await auth.api.getSession({
      headers: headersForAuth(c.req.raw.headers, c.get('clientIp')),
    })

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', session.user)
    c.set('session', session.session)
    c.set('userId', session.user.id)
    // The scope middleware sets the role once it has resolved which organization.
    c.set('orgRole', null)
    c.set('apiKeyId', null)
    c.set('apiKeyScopes', null)
    c.set('apiKeyExpiresAt', null)

    await next()
  })
}

/**
 * The project an API key is pinned to — null for a session, and for a key
 * that carries no project. Derived from what the auth middleware already set
 * (a key's `projectId` lands in context before any route runs), so no auth
 * path can forget to keep a second value in sync.
 */
export function apiKeyProjectPin(c: Context<AppEnv>): string | null {
  if (c.get('apiKeyScopes') === null) return null
  return (c.get('projectId') as string | undefined) ?? null
}

/**
 * Org-level resources — connections, projects, installed nodes — are managed
 * by sessions and organization-level keys. A key pinned to one project is
 * refused: every project in the organization depends on these resources.
 */
export const requireOrgLevelAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (apiKeyProjectPin(c) !== null) {
    return c.json({ error: 'A project-scoped API key cannot manage organization resources' }, 403)
  }
  return next()
})

export function requireScope(scope: ApiKeyScope) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const scopes = c.get('apiKeyScopes')
    // Session-based auth (no scopes) — full access
    if (scopes === null) return next()
    if (!scopes.includes(scope)) {
      return c.json({ error: `API key missing required scope: ${scope}` }, 403)
    }
    return next()
  })
}

export const requireSessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('apiKeyScopes') !== null) {
    return c.json({ error: 'This endpoint requires session authentication' }, 403)
  }
  return next()
})
