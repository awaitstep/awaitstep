import { createMiddleware } from 'hono/factory'
import {
  libraryItemCapabilities,
  libraryOwnerRole,
  resolveRoles,
  libraryCreateCapability,
  inheritedWorkspaceRole,
} from '@awaitstep/ir'
import type { AppEnv } from '../types.js'
import { parseOrgRole } from '../lib/org-role.js'
import { apiKeyLevel, apiKeyProjectScopes, apiKeyWorkspaceScopes, isSession } from './auth.js'
import { ORG_KEY_ON_PROJECT } from './key-permissions.js'

/**
 * `/library/items/:id` and below: the item, read together with the
 * caller's rows at its owner. An item they may not open is not found. A
 * project key reaches its projects' items; a workspace key only the items
 * its own workspaces own (the project's items reach it through the summary).
 */
export const requireLibraryItemAccess = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'Not found' }, 404)
  const level = apiKeyLevel(c)
  if (!isSession(c) && level === 'organization') return c.json({ error: ORG_KEY_ON_PROJECT }, 403)

  const found = await c.get('db').getLibraryItemForUser(c.get('userId'), id)
  if (
    !found ||
    (level === 'project' && !apiKeyProjectScopes(c).includes(found.item.projectId)) ||
    (level === 'workspace' &&
      (found.item.workspaceId === null ||
        !apiKeyWorkspaceScopes(c).includes(found.item.workspaceId)))
  ) {
    return c.json({ error: 'Not found' }, 404)
  }

  const roles = resolveRoles({
    orgRole: found.orgRole === null ? null : parseOrgRole(found.orgRole),
    projectGrant: found.projectGrant,
    workspaceGrant: found.workspaceGrant,
  })
  c.set('libraryItem', found)
  c.set('libraryRole', libraryOwnerRole(found.item, roles))
  c.set('projectId', found.item.projectId)
  c.set('organizationId', found.organizationId)
  c.set('workspaceId', found.item.workspaceId ?? undefined)
  c.set('orgRole', roles.orgRole)
  c.set('projectRole', roles.projectRole)
  c.set('workspaceRole', found.item.workspaceId === null ? null : roles.workspaceRole)
  await next()
})

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CHECK_PATH = /\/library\/items\/[^/]+\/check$/

/**
 * Writes to an item need an Editor at its owner; a project item is
 * read-only to the workspaces that use it. `check` is a POST that writes nothing, so it passes.
 */
export const requireLibraryWrite = createMiddleware<AppEnv>(async (c, next) => {
  if (!MUTATING.has(c.req.method) || (c.req.method === 'POST' && CHECK_PATH.test(c.req.path))) {
    return next()
  }
  const found = c.get('libraryItem')
  if (!found) return c.json({ error: 'Not found' }, 404)
  const can = libraryItemCapabilities(c.get('libraryRole')).edit
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
  return next()
})

/**
 * Creating an item where the request points: an Editor of the named
 * workspace, or a member of the project for the project's own library
 * (which anyone in one of its workspaces can see, and only use).
 */
export const requireLibraryCreate = createMiddleware<AppEnv>(async (c, next) => {
  const inWorkspace = Boolean(c.get('workspaceId'))
  const role = inWorkspace ? c.get('workspaceRole') : inheritedWorkspaceRole(c.get('projectRole'))
  if (!role && inWorkspace) return c.json({ error: 'Not found' }, 404)
  const can = libraryCreateCapability(role)
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
  return next()
})
