import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { parseKeyPermissions } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { headersForAuth } from '../lib/client-ip.js'
import { createLogger } from '../lib/logger.js'
import { parseOrgRole } from '../lib/org-role.js'

const log = createLogger('auth')

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

      // The grid the key was minted with (B3); a row that is not one grants nothing.
      const permissions = parseKeyPermissions(apiKey.permissions)
      if (!permissions) {
        return c.json({ error: 'Invalid API key permissions' }, 401)
      }

      if (!apiKey.organizationId) {
        // A malformed row: every key carries its organization.
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

      // The key acts with its creator's standing. The scope set `getAuthByHash`
      // returns is already cut to the places the creator can STILL open; a
      // scoped key whose creator can open none of them reaches nothing — not
      // even the org-level reads it held through its cells — so it is refused
      // whole here. The addressed place is matched against the set, and
      // re-resolved with the creator's roles, per request by the scope
      // middleware (requireProject / requireWorkspace).
      if (apiKey.level === 'project' && apiKey.projectScopes.length === 0) {
        return c.json({ error: 'The API key’s creator can no longer access this project' }, 401)
      }
      if (apiKey.level === 'workspace' && apiKey.workspaceScopes.length === 0) {
        return c.json({ error: 'The API key’s creator can no longer access this workspace' }, 401)
      }

      const creatorOrgRole = parseOrgRole(apiKey.createdByRole)

      c.set('userId', apiKey.createdBy)
      c.set('organizationId', apiKey.organizationId)
      // What the key may manage is what its creator may: the role is read in
      // the same statement as the membership above; the scope middleware
      // resolves the project and workspace roles from the same creator.
      c.set('orgRole', creatorOrgRole)
      c.set('projectRole', null)
      c.set('workspaceRole', null)
      c.set('user', null)
      c.set('session', null)
      c.set('apiKey', {
        id: apiKey.id,
        name: apiKey.name,
        display: `${apiKey.keyPrefix}…${apiKey.keySuffix ?? ''}`,
        level: apiKey.level,
        permissions,
        projectScopes: apiKey.projectScopes,
        workspaceScopes: apiKey.workspaceScopes,
        keyProjectId: apiKey.keyProjectId,
        expiresAt: apiKey.expiresAt,
      })

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
    // The scope middleware sets the roles once it has resolved which place.
    c.set('orgRole', null)
    c.set('projectRole', null)
    c.set('workspaceRole', null)
    c.set('apiKey', null)

    await next()
  })
}

/** Whether the caller is a person (a session), not a key. */
export function isSession(c: Context<AppEnv>): boolean {
  return c.get('apiKey') === null
}

/** The calling key's level — `null` for a session. */
export function apiKeyLevel(c: Context<AppEnv>): 'organization' | 'project' | 'workspace' | null {
  return c.get('apiKey')?.level ?? null
}

/** The live project ids a project-level key reaches; empty for a session or the other levels. */
export function apiKeyProjectScopes(c: Context<AppEnv>): string[] {
  const key = c.get('apiKey')
  return key?.level === 'project' ? key.projectScopes : []
}

/** The live workspace ids a workspace-level key reaches; empty for a session or the other levels. */
export function apiKeyWorkspaceScopes(c: Context<AppEnv>): string[] {
  const key = c.get('apiKey')
  return key?.level === 'workspace' ? key.workspaceScopes : []
}

/** The sole project of a single-project key, for the "name none, default to it" convenience; null otherwise. */
export function apiKeySoleProject(c: Context<AppEnv>): string | null {
  const scopes = apiKeyProjectScopes(c)
  return scopes.length === 1 ? scopes[0]! : null
}

/** The sole workspace of a single-workspace key; null otherwise. */
export function apiKeySoleWorkspace(c: Context<AppEnv>): string | null {
  const scopes = apiKeyWorkspaceScopes(c)
  return scopes.length === 1 ? scopes[0]! : null
}

/** A workspace-level key's owning project; null for a session or the other levels. */
export function apiKeyProjectHome(c: Context<AppEnv>): string | null {
  const key = c.get('apiKey')
  return key?.level === 'workspace' ? key.keyProjectId : null
}

export const requireSessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!isSession(c)) {
    return c.json({ error: 'This endpoint requires session authentication' }, 403)
  }
  return next()
})
