import { isReservedSlug, slugify } from '@awaitstep/ir'
import type { ScopeLookup, ScopeSlugs } from '../../../types/dashboard/scope'
import type {
  NewWorkspaceInput,
  Workspace,
  WorkspacePerson,
  WorkspaceUpdate,
} from '../../../types/dashboard/workspaces'
import { projectGrantedRole, workspaceRoleOf } from '../access'
import { getDb, type WorkspaceRow } from '../db'
import { deleteWorkspaces } from './item-records'
import {
  conflictError,
  endpoint,
  forbiddenError,
  frameEndpoint,
  invalidError,
  mutation,
  rows,
} from '../scenario'
import {
  orgScope,
  projectScope,
  visibleWorkspaces,
  workspacePeople,
  workspaceRecord,
  workspaceScope,
} from './records'
import {
  assertNotReserved,
  availableSlug,
  newId,
  requireScope,
  resolveOrg,
  resolveProject,
  resolveWorkspace,
  slugFrom,
} from './resolve'

/**
 * What a URL's slugs name, with the viewer's role and capabilities at each
 * level. Frame data: no scenario fails it, so pages always know where they are.
 */
export const getScope = frameEndpoint((ctx, slugs: ScopeSlugs): ScopeLookup => {
  const db = getDb()
  const org = resolveOrg(db, ctx, slugs.org)
  if ('notFound' in org) return { found: false, notFound: org.notFound }
  const found = { found: true as const, org: orgScope(db, ctx, org.row) }
  if (slugs.project === undefined) return found
  const project = resolveProject(db, ctx, org.row, slugs.project)
  if ('notFound' in project) return { found: false, notFound: project.notFound }
  const withProject = { ...found, project: projectScope(db, ctx, project.row) }
  if (slugs.workspace === undefined) return withProject
  const workspace = resolveWorkspace(db, ctx, project.row, slugs.workspace)
  if ('notFound' in workspace) return { found: false, notFound: workspace.notFound }
  return { ...withProject, workspace: workspaceScope(db, ctx, project.row, workspace.row) }
})

/** The workspaces in a project the viewer can open, oldest first (the switcher's order). */
export const listWorkspaces = frameEndpoint(
  (ctx, orgSlug: string, projectSlug: string): Workspace[] => {
    const db = getDb()
    const { project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    return visibleWorkspaces(db, ctx, project!).map((w) => workspaceRecord(db, ctx, project!, w))
  },
)

export const createWorkspace = mutation(
  (ctx, orgSlug: string, projectSlug: string, input: NewWorkspaceInput): Workspace => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const can = projectScope(db, ctx, project!).viewerCan.createWorkspace
    if (!can.allowed) throw forbiddenError(can.reason!)
    const name = input.name.trim()
    if (!name) throw invalidError('A workspace needs a name', 'name')
    const base = slugFrom(name, 'workspace name', 'name')
    const people = input.access.kind === 'pick' ? input.access.people : []
    const orgMembers = new Set(db.orgMembers.filter((m) => m.orgId === org.id).map((m) => m.userId))
    if (people.some((p) => !orgMembers.has(p.userId))) {
      throw conflictError('Everyone you add must already be in the organization')
    }
    const row: WorkspaceRow = {
      id: newId('ws'),
      projectId: project!.id,
      slug: availableSlug('workspace', base, (s) =>
        db.workspaces.some((w) => w.projectId === project!.id && w.slug === s),
      ),
      name,
      description: input.description?.trim() || null,
      colour: input.colour,
      createdAt: new Date().toISOString(),
      createdBy: ctx.userId,
      lock: null,
    }
    db.workspaces.push(row)
    for (const person of people) {
      db.workspaceMembers.push({ workspaceId: row.id, userId: person.userId, role: person.role })
    }
    return workspaceRecord(db, ctx, project!, row)
  },
)

export const updateWorkspace = mutation(
  (ctx, slugs: Required<ScopeSlugs>, update: WorkspaceUpdate): Workspace => {
    const db = getDb()
    const { project, workspace } = requireScope(db, ctx, slugs)
    const can = workspaceScope(db, ctx, project!, workspace!).viewerCan.manageSettings
    if (!can.allowed) throw forbiddenError(can.reason!)
    const row = workspace!
    const name = update.name?.trim()
    if (name === '') throw invalidError('A workspace needs a name', 'name')
    const slug = update.slug === undefined ? undefined : slugFrom(update.slug, 'URL', 'slug')
    if (slug) assertNotReserved('workspace', slug)
    if (
      slug &&
      db.workspaces.some((w) => w.projectId === row.projectId && w.slug === slug && w.id !== row.id)
    ) {
      throw conflictError('Another workspace in this project already uses that URL', 'slug')
    }
    if (name) row.name = name
    if (slug) row.slug = slug
    else if (name && row.slug === 'default') {
      // The backend's rule: only `default` follows the name, and only onto a free slug.
      const fromName = slugify(name)
      const free = !db.workspaces.some((w) => w.projectId === row.projectId && w.slug === fromName)
      if (fromName && free && !isReservedSlug('workspace', fromName)) row.slug = fromName
    }
    if (update.description !== undefined) row.description = update.description?.trim() || null
    if (update.colour) row.colour = update.colour
    return workspaceRecord(db, ctx, project!, row)
  },
)

export const deleteWorkspace = mutation((ctx, slugs: Required<ScopeSlugs>): void => {
  const db = getDb()
  const { project, workspace } = requireScope(db, ctx, slugs)
  const can = workspaceScope(db, ctx, project!, workspace!).viewerCan.delete
  if (!can.allowed) throw forbiddenError(can.reason!)
  deleteWorkspaces(db, new Set([workspace!.id]))
})

/**
 * Everyone who can open the workspace, with their effective role: the
 * Overview's People chips ("Daniel Kim · Editor"). P4's Access tab grows this
 * into the members list.
 */
export const listWorkspacePeople = endpoint(
  (ctx, slugs: Required<ScopeSlugs>): WorkspacePerson[] => {
    const db = getDb()
    const { project, workspace } = requireScope(db, ctx, slugs)
    // One pass over the org's members, joined to each person (B2: one query).
    const orgRows = new Map(
      db.orgMembers.filter((m) => m.orgId === project!.orgId).map((m) => [m.userId, m]),
    )
    return rows(
      ctx,
      workspacePeople(db, project!, workspace!).map((person) => {
        const as = { scenario: 'none' as const, userId: person.id }
        const role = workspaceRoleOf(db, as, project!, workspace!)!
        const projectRole = projectGrantedRole(db, as, project!)
        const orgRow = orgRows.get(person.id)
        const orgRole = orgRow?.role === 'owner' || orgRow?.role === 'admin' ? orgRow.role : null
        // A workspace grant that raises a project member to Admin is the workspace's own.
        return {
          person,
          role,
          inherited: role === projectRole,
          lastActiveAt: orgRow?.lastOpenedAt ?? null,
          projectRole,
          orgRole,
        }
      }),
    )
  },
)
