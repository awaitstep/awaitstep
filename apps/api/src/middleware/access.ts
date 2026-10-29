import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import {
  orgCapabilities,
  projectCapabilities,
  resolveRoles,
  workspaceCapabilities,
  type OrgCapability,
  type ProjectCapability,
  type WorkspaceCapability,
} from '@awaitstep/ir'
import type { GrantRows } from '@awaitstep/db'
import { parseOrgRole } from '../lib/org-role.js'
import type { AppEnv } from '../types.js'

/**
 * Turns the membership rows a scope read returned into the caller's roles on
 * the context: the one place the API resolves roles, with the table in
 * @awaitstep/ir. A workspace role is set only when the request named one.
 */
export function applyGrantRows(c: Context<AppEnv>, rows: GrantRows, hasWorkspace: boolean): void {
  const roles = resolveRoles({
    orgRole: rows.orgRole === null ? null : parseOrgRole(rows.orgRole),
    projectGrant: rows.projectGrant,
    workspaceGrant: rows.workspaceGrant,
  })
  c.set('orgRole', roles.orgRole)
  c.set('projectRole', roles.projectRole)
  c.set('workspaceRole', hasWorkspace ? roles.workspaceRole : null)
}

// The capability gates. Each reads the roles the scope middleware set and
// answers 403 with the reason the dashboard shows on the same action, so a
// refused call and a disabled button say one thing. Facts the tables take
// (locks, the last workspace) are the handlers' — here every fact is "no",
// so a gate passes anyone the role allows and the handler refuses the rest.

export function requireOrgCan(capability: OrgCapability) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const role = c.get('orgRole')
    const can = role ? orgCapabilities(role)[capability] : { allowed: false }
    if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
    return next()
  })
}

export function requireProjectCan(capability: ProjectCapability) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const can = projectCapabilities(c.get('projectRole'), false, c.get('orgRole'))[capability]
    if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
    return next()
  })
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * `requireWorkspaceCan` for a path's writes only, registered with `use` so
 * no method/path pair exists in the route table beyond the handlers' own
 * (a stray one would answer 404 after passing every gate).
 */
export function requireWorkspaceCanWrite(capability: WorkspaceCapability) {
  const gate = requireWorkspaceCan(capability)
  return createMiddleware<AppEnv>(async (c, next) =>
    MUTATING.has(c.req.method) ? gate(c, next) : next(),
  )
}

export function requireWorkspaceCan(capability: WorkspaceCapability) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const role = c.get('workspaceRole')
    if (!role) return c.json({ error: 'Not found' }, 404)
    const can = workspaceCapabilities(role, {
      ownLock: false,
      lockedByProject: null,
      isLastWorkspace: false,
      sharedInUse: false,
    })[capability]
    if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
    return next()
  })
}
