import type { ScopeLookup, ScopeSlugs } from '../../../types/dashboard/scope'
import type {
  NewWorkspaceInput,
  Workspace,
  WorkspaceUpdate,
} from '../../../types/dashboard/workspaces'
import { getDb, type WorkspaceRow } from '../db'
import { deleteWorkspaces } from './item-records'
import { conflictError, forbiddenError, frameEndpoint, invalidError, mutation } from '../scenario'
import {
  orgScope,
  projectScope,
  visibleWorkspaces,
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
    return visibleWorkspaces(db, ctx, project!).map((w) => workspaceRecord(db, project!, w))
  },
)

export const createWorkspace = mutation(
  (ctx, orgSlug: string, projectSlug: string, input: NewWorkspaceInput): Workspace => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const can = projectScope(db, ctx, project!).viewerCan.createWorkspace
    if (!can.allowed) throw forbiddenError(can.reason!)
    const name = input.name.trim()
    if (!name) throw invalidError('A workspace needs a name')
    const base = slugFrom(name, 'workspace name')
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
    return workspaceRecord(db, project!, row)
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
    if (name === '') throw invalidError('A workspace needs a name')
    const slug = update.slug === undefined ? undefined : slugFrom(update.slug, 'URL')
    if (slug) assertNotReserved('workspace', slug)
    if (
      slug &&
      db.workspaces.some((w) => w.projectId === row.projectId && w.slug === slug && w.id !== row.id)
    ) {
      throw conflictError('Another workspace in this project already uses that URL')
    }
    if (name) row.name = name
    if (slug) row.slug = slug
    if (update.description !== undefined) row.description = update.description?.trim() || null
    if (update.colour) row.colour = update.colour
    return workspaceRecord(db, project!, row)
  },
)

export const deleteWorkspace = mutation((ctx, slugs: Required<ScopeSlugs>): void => {
  const db = getDb()
  const { project, workspace } = requireScope(db, ctx, slugs)
  const can = workspaceScope(db, ctx, project!, workspace!).viewerCan.delete
  if (!can.allowed) throw forbiddenError(can.reason!)
  deleteWorkspaces(db, new Set([workspace!.id]))
})
