import { getDb, type MockDb, type OrgRow, type ProjectRow, type WorkspaceRow } from '../db'
import { type MockContext, forbiddenError, invalidError } from '../scenario'
import { orgScope, projectScope, workspaceScope } from './records'
import { requireScope } from './resolve'
import type { LevelSlugs } from '../../../types/dashboard/scope'

/** The org, after checking the viewer runs it (owner or admin). */
export function managedOrg(ctx: MockContext, orgSlug: string): { db: MockDb; org: OrgRow } {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const can = orgScope(db, ctx, org).viewerCan.manageSettings
  if (!can.allowed) throw forbiddenError(can.reason!)
  return { db, org }
}

export type ResolvedLevel =
  | { level: 'organization'; org: OrgRow; target: { id: string; name: string } }
  | { level: 'project'; org: OrgRow; project: ProjectRow; target: { id: string; name: string } }
  | {
      level: 'workspace'
      org: OrgRow
      project: ProjectRow
      workspace: WorkspaceRow
      target: { id: string; name: string }
    }

/**
 * Resolves a level from its slugs and checks the viewer may manage `what`
 * there (keys or variables): org owners/admins at the org, project admins at
 * a project, workspace admins at a workspace. Keys and variables share it.
 */
export function requireLevel(
  db: MockDb,
  ctx: MockContext,
  orgSlug: string,
  slugs: LevelSlugs,
  what: 'keys' | 'variables',
): ResolvedLevel {
  if (slugs.level !== 'organization' && !slugs.project) {
    throw invalidError('Pick a project', 'level')
  }
  if (slugs.level === 'workspace' && !slugs.workspace) {
    throw invalidError('Pick a workspace', 'level')
  }
  const { org, project, workspace } = requireScope(db, ctx, {
    org: orgSlug,
    project: slugs.level === 'organization' ? undefined : slugs.project,
    workspace: slugs.level === 'workspace' ? slugs.workspace : undefined,
  })
  const capability = what === 'keys' ? 'manageKeys' : 'manageVariables'
  if (slugs.level === 'organization') {
    const can = orgScope(db, ctx, org).viewerCan.manageSettings
    if (!can.allowed) throw forbiddenError(can.reason!)
    return { level: 'organization', org, target: { id: org.id, name: org.name } }
  }
  if (slugs.level === 'project') {
    const can = projectScope(db, ctx, project!).viewerCan[capability]
    if (!can.allowed) throw forbiddenError(can.reason!)
    return {
      level: 'project',
      org,
      project: project!,
      target: { id: project!.id, name: project!.name },
    }
  }
  const can = workspaceScope(db, ctx, project!, workspace!).viewerCan[capability]
  if (!can.allowed) throw forbiddenError(can.reason!)
  return {
    level: 'workspace',
    org,
    project: project!,
    workspace: workspace!,
    target: { id: workspace!.id, name: workspace!.name },
  }
}
