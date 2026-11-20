import { createMiddleware } from 'hono/factory'
import { basePath } from 'hono/route'
import { RegExpRouter } from 'hono/router/reg-exp-router'
import { SmartRouter } from 'hono/router/smart-router'
import { TrieRouter } from 'hono/router/trie-router'
import {
  keyMay,
  resourceAtLevel,
  type KeyAction,
  type KeyLevel,
  type KeyResource,
} from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

// What a key may call (B3). Every route a key may reach is registered with
// the cell of the catalog it needs; a session passes every gate. A key at a
// level that does not offer the resource is refused for its level, so an
// organization key never touches a workflow and a project key never manages
// organization resources, whatever its grid says.

export const ORG_KEY_ON_PROJECT = 'An organization-level API key cannot access project resources'
export const PROJECT_KEY_ON_ORG = 'A project-scoped API key cannot manage organization resources'
export const KEYS_NOT_ALLOWED = 'This endpoint is not available to API keys'

export type KeyCell = [KeyResource, KeyAction]

function refusal(level: KeyLevel, [resource, action]: KeyCell): string {
  if (!resourceAtLevel(level, resource)) {
    if (level === 'organization') return ORG_KEY_ON_PROJECT
    if (level === 'project') return PROJECT_KEY_ON_ORG
    // A workspace key: the resource is a level above it (members, workspaces)
    // or the organization's; the refusal names the key, not another level.
    return `A workspace-level API key cannot ${action === 'read' ? 'read' : 'manage'} ${resource}`
  }
  return `API key lacks permission: ${resource}:${action}`
}

/**
 * The gate a route carries: the cell a key needs, and — where a lower level
 * reaches the same thing through another cell (a project key reads the
 * connections and nodes it deploys with through `workflows:read`) — the cell
 * for that level instead.
 */
export function requireKeyPermission(
  resource: KeyResource,
  action: KeyAction,
  below: Partial<Record<Exclude<KeyLevel, 'organization'>, KeyCell>> = {},
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = c.get('apiKey')
    if (key === null) return next()
    c.set('keyPermissionChecked', true)
    const cell: KeyCell =
      key.level === 'organization' ? [resource, action] : (below[key.level] ?? [resource, action])
    if (!keyMay(key.level, key.permissions, cell[0], cell[1])) {
      return c.json({ error: refusal(key.level, cell) }, 403)
    }
    return next()
  })
}

/** A route as Hono records it in `app.routes`. */
export interface RegisteredRoute {
  method: string
  path: string
  handler: { length: number }
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/**
 * The methods each path has a handler for. Built once, on the first refused
 * request (every route is registered by then), into a router of its own with
 * Hono's default routing, so strict paths, params and wildcards match as
 * dispatch does — without building, and so locking, the app's own router.
 * Middleware is not a handler, even when registered with a method
 * (`router.get('/nodes/*', key(…))`): Hono middleware takes `(c, next)`, a
 * handler only `c`. An `ALL` handler answers every method.
 */
function handlerMethods(routes: () => readonly RegisteredRoute[]): (path: string) => string[] {
  let matcher: SmartRouter<true> | null = null
  return (path) => {
    if (!matcher) {
      matcher = new SmartRouter<true>({ routers: [new RegExpRouter(), new TrieRouter()] })
      for (const route of routes()) {
        if (route.handler.length < 2) matcher.add(route.method, route.path, true)
      }
    }
    const built = matcher
    return METHODS.filter((method) => built.match(method, path)[0].length > 0).flatMap((method) =>
      method === 'GET' ? ['GET', 'HEAD'] : [method],
    )
  }
}

// Extension routes are the deployment's own, not the open-source table: an
// unjudged key gets the flat refusal there, so a key cannot map their shape.
const EXTENSION_PREFIX = '/ext/'

/**
 * Registered after every mapping: a key on a route no mapping judged is
 * refused, so a route added later is session-only until someone decides
 * which cell it needs. The refusal says what is actually wrong: a method the
 * path does not answer is `405` with `Allow`, a path nothing answers is `404`,
 * and only a real route a key may not use is `403`. A `403` for a mistyped
 * method reads as a missing permission and sends the caller after the key.
 * Whatever the answer, the request never reaches a handler. `routes` are the
 * ones of the router this middleware is registered on; paths are matched
 * below its mount.
 */
export function requireKeyMapped(routes: () => readonly RegisteredRoute[]) {
  const methodsFor = handlerMethods(routes)
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('apiKey') === null || c.get('keyPermissionChecked')) return next()
    const path = c.req.path.slice(basePath(c).length) || '/'
    if (path.startsWith(EXTENSION_PREFIX)) return c.json({ error: KEYS_NOT_ALLOWED }, 403)
    const methods = methodsFor(path)
    if (methods.length === 0) return c.json({ error: 'Not found' }, 404)
    if (!methods.includes(c.req.method)) {
      const allow = methods.join(', ')
      c.header('Allow', allow)
      return c.json({ error: `Method not allowed. Use ${allow}.` }, 405)
    }
    return c.json({ error: KEYS_NOT_ALLOWED }, 403)
  })
}
