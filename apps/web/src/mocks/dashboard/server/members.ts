import type { ProjectMembers, ProjectWideRole } from '../../../types/dashboard/access'
import { getDb } from '../db'
import type { Person } from '../../../types/dashboard/session'
import { endpoint, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { personById, visibleWorkspaces } from './records'
import { requireScope } from './resolve'

/**
 * Project settings → Members: who opens every workspace, and who opens only
 * some. Workspace grants in workspaces hidden from the viewer are left out (O9).
 */
export const listProjectMembers = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectMembers => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    // Rows for people who left the org (or whose project moved away from them) grant nothing.
    const inOrg = new Set(db.orgMembers.filter((m) => m.orgId === org.id).map((m) => m.userId))
    const wide = new Map<string, ProjectWideRole>()
    for (const m of db.orgMembers.filter((m) => m.orgId === org.id)) {
      if (m.role === 'owner') wide.set(m.userId, 'owner')
      if (m.role === 'admin') wide.set(m.userId, 'org-admin')
    }
    for (const m of db.projectMembers.filter((m) => m.projectId === project!.id)) {
      if (inOrg.has(m.userId) && !wide.has(m.userId)) {
        wide.set(m.userId, m.role === 'admin' ? 'project-admin' : 'project-member')
      }
    }
    const visible = visibleWorkspaces(db, ctx, project!)
    const byPerson = new Map<string, ProjectMembers['workspacesOnly'][number]['workspaces']>()
    for (const w of visible) {
      for (const m of db.workspaceMembers.filter((m) => m.workspaceId === w.id)) {
        if (wide.has(m.userId) || !inOrg.has(m.userId)) continue
        byPerson.set(m.userId, [
          ...(byPerson.get(m.userId) ?? []),
          { workspace: workspaceRef(w), role: m.role },
        ])
      }
    }
    return {
      wholeProject: rows(
        ctx,
        [...wide].map(([userId, role]) => ({ person: personById(db, userId), role })),
      ),
      workspacesOnly: rows(
        ctx,
        [...byPerson].map(([userId, workspaces]) => ({
          person: personById(db, userId),
          workspaces,
        })),
      ),
    }
  },
)

/** Everyone in the org, for picking people (New workspace). P5's Members page grows this. */
export const listOrgPeople = endpoint((ctx, orgSlug: string): Person[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  return rows(
    ctx,
    db.orgMembers.filter((m) => m.orgId === org.id).map((m) => personById(db, m.userId)),
  )
})
