import { createMiddleware } from 'hono/factory'
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

/**
 * Registered after every mapping: a key on a route no mapping judged is
 * refused, so a route added later is session-only until someone decides
 * which cell it needs.
 */
export const requireKeyMapped = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('apiKey') !== null && !c.get('keyPermissionChecked')) {
    return c.json({ error: KEYS_NOT_ALLOWED }, 403)
  }
  return next()
})
