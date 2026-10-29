import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import {
  orgCapabilities,
  projectCapabilities,
  UNLOCKED_PROJECT,
  workspaceCapabilities,
  type Allowed,
  type ProjectCapability,
  type ScopeLevel,
  type WorkspaceCapability,
} from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

// The level a request is addressed at — `?org=` the organization, `&project=`
// a project, `&workspace=` a workspace — and what the caller may do there.
// Keys (B3) and variables (B4) are both managed this way: at the organization
// by its owners and admins, at a project by its admins, at a workspace by
// that workspace's admins. The scope middleware resolved the roles; this
// reads them, and a refusal says what the dashboard's disabled button says.

const NO_FACTS = {
  ownLock: false,
  lockedByProject: null,
  isLastWorkspace: false,
  sharedInUse: false,
}

/** The level the request is addressed at, from what the router resolved. */
export function addressedLevel(c: Context<AppEnv>): ScopeLevel {
  if (c.get('workspaceId')) return 'workspace'
  return (c.get('projectId') as string | undefined) ? 'project' : 'organization'
}

/**
 * A capability a project and a workspace both have. At the organization it
 * is its owners' and admins' (`manageSettings`): they manage everything there.
 */
export type LevelCapability = ProjectCapability & WorkspaceCapability

/** Whether the caller holds `capability` at the addressed level, with the dashboard's reason. */
export function levelCan(c: Context<AppEnv>, capability: LevelCapability): Allowed {
  const level = addressedLevel(c)
  const orgRole = c.get('orgRole')
  if (level === 'organization') {
    return orgRole ? orgCapabilities(orgRole).manageSettings : { allowed: false }
  }
  if (level === 'project') {
    return projectCapabilities(c.get('projectRole'), UNLOCKED_PROJECT, orgRole)[capability]
  }
  const role = c.get('workspaceRole')
  return role ? workspaceCapabilities(role, NO_FACTS)[capability] : { allowed: false }
}

/** The gate: `403` with the level's reason when the caller lacks `capability` there. */
export function requireLevelCan(capability: LevelCapability) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const can = levelCan(c, capability)
    if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
    return next()
  })
}
