import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { createLogger } from '../lib/logger.js'

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
      const apiKey = await db.getApiKeyByHash(keyHash)

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

      // API keys are project-scoped — derive organizationId from the project
      const project = await db.getProjectById(apiKey.projectId)
      if (!project) {
        return c.json({ error: 'API key project not found' }, 401)
      }

      c.set('userId', apiKey.createdBy)
      c.set('organizationId', project.organizationId)
      c.set('projectId', apiKey.projectId)
      c.set('user', null)
      c.set('session', null)
      c.set('apiKeyScopes', scopes)

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
      headers: c.req.raw.headers,
    })

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', session.user)
    c.set('session', session.session)
    c.set('userId', session.user.id)
    c.set('apiKeyScopes', null)

    await next()
  })
}

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
