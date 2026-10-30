import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { canSeeProject, keyLevelOf, parseKeyPermissions } from '@awaitstep/ir'
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

      // A project key reaches what its creator can open; a creator who lost
      // every way into the project takes the key's way in with them.
      const creatorOrgRole = parseOrgRole(apiKey.createdByRole)
      if (
        apiKey.projectId &&
        !canSeeProject(
          creatorOrgRole,
          apiKey.createdByProjectGrant,
          apiKey.createdByHasWorkspaceGrant,
        )
      ) {
        return c.json({ error: 'The API key’s creator can no longer access this project' }, 401)
      }
      // A workspace key the same: its creator must still open that workspace,
      // or the organization's reads it holds through its own cells stay open.
      if (apiKey.workspaceId && !apiKey.createdByCanOpenWorkspace) {
        return c.json({ error: 'The API key’s creator can no longer access this workspace' }, 401)
      }

      c.set('userId', apiKey.createdBy)
      c.set('organizationId', apiKey.resolvedOrganizationId)
      // What the key may manage is what its creator may: the role is read in
      // the same statement as the membership above; the scope middleware
      // resolves the project and workspace roles from the same creator.
      c.set('orgRole', creatorOrgRole)
      c.set('projectRole', null)
      c.set('workspaceRole', null)
      // An organization-level key has no project: project-scoped routes
      // refuse it in requireProject. A workspace key's workspace is applied
      // there too, as the pin every project-scoped read is cut to.
      if (apiKey.projectId) {
        c.set('projectId', apiKey.projectId)
      }
      c.set('user', null)
      c.set('session', null)
      c.set('apiKey', {
        id: apiKey.id,
        name: apiKey.name,
        display: `${apiKey.keyPrefix}…${apiKey.keySuffix ?? ''}`,
        level: keyLevelOf(apiKey),
        permissions,
        projectId: apiKey.projectId,
        workspaceId: apiKey.workspaceId,
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

/**
 * The project an API key is pinned to — null for a session, and for a key
 * that carries no project. Read off the key itself, not off the context's
 * `projectId`: a project item route sets that for an organization key too
 * (`requireProjectParam`), and a pin must never appear by that route.
 */
export function apiKeyProjectPin(c: Context<AppEnv>): string | null {
  return c.get('apiKey')?.projectId ?? null
}

/** The workspace a workspace key is pinned to — null for a session and for the other levels. */
export function apiKeyWorkspacePin(c: Context<AppEnv>): string | null {
  return c.get('apiKey')?.workspaceId ?? null
}

export const requireSessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!isSession(c)) {
    return c.json({ error: 'This endpoint requires session authentication' }, 403)
  }
  return next()
})
