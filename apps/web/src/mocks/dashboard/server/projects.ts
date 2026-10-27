import type { NewProjectInput, Project, ProjectUpdate } from '../../../types/dashboard/projects'
import type { Workspace } from '../../../types/dashboard/workspaces'
import { canSeeProject } from '../access'
import { getDb, type ProjectRow, type WorkspaceRow } from '../db'
import { conflictError, endpoint, forbiddenError, invalidError, mutation, rows } from '../scenario'
import { deleteWorkspaces } from './item-records'
import { orgScope, projectRecord, projectScope, workspaceRecord } from './records'
import { assertNotReserved, availableSlug, newId, requireScope, slugFrom } from './resolve'

/** Projects the viewer can open at least one workspace in. */
export const listProjects = endpoint((ctx, orgSlug: string): Project[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const visible = db.projects.filter((p) => p.orgId === org.id && canSeeProject(db, ctx, p))
  return rows(
    ctx,
    visible.map((p) => projectRecord(db, ctx, p)),
  )
})

/** A new project with its Default workspace; the creator becomes project admin. */
export const createProject = mutation(
  (ctx, orgSlug: string, input: NewProjectInput): { project: Project; workspace: Workspace } => {
    const db = getDb()
    const { org } = requireScope(db, ctx, { org: orgSlug })
    const can = orgScope(db, ctx, org).viewerCan.createProject
    if (!can.allowed) throw forbiddenError(can.reason!)
    const name = input.name.trim()
    if (!name) throw invalidError('A project needs a name')
    const base = slugFrom(name, 'project name')
    const now = new Date().toISOString()
    const project: ProjectRow = {
      id: newId('prj'),
      orgId: org.id,
      slug: availableSlug('project', base, (s) =>
        db.projects.some((p) => p.orgId === org.id && p.slug === s),
      ),
      name,
      description: input.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
      lock: null,
    }
    const workspace: WorkspaceRow = {
      id: newId('ws'),
      projectId: project.id,
      slug: 'default',
      name: 'Default',
      description: null,
      colour: 'green',
      createdAt: now,
      createdBy: ctx.userId,
      lock: null,
    }
    db.projects.push(project)
    db.workspaces.push(workspace)
    db.projectMembers.push({ projectId: project.id, userId: ctx.userId, role: 'admin' })
    return {
      project: projectRecord(db, ctx, project),
      workspace: workspaceRecord(db, project, workspace),
    }
  },
)

export const updateProject = mutation(
  (ctx, orgSlug: string, projectSlug: string, update: ProjectUpdate): Project => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const can = projectScope(db, ctx, project!).viewerCan.manageSettings
    if (!can.allowed) throw forbiddenError(can.reason!)
    const row = project!
    const name = update.name?.trim()
    if (name === '') throw invalidError('A project needs a name')
    const slug = update.slug === undefined ? undefined : slugFrom(update.slug, 'URL')
    if (slug) assertNotReserved('project', slug)
    if (slug && db.projects.some((p) => p.orgId === org.id && p.slug === slug && p.id !== row.id)) {
      throw conflictError('Another project in this organization already uses that URL')
    }
    if (name) row.name = name
    if (slug) row.slug = slug
    if (update.description !== undefined) row.description = update.description?.trim() || null
    row.updatedAt = new Date().toISOString()
    return projectRecord(db, ctx, row)
  },
)

/** Deletes the project, its workspaces and everything in them. */
export const deleteProject = mutation((ctx, orgSlug: string, projectSlug: string): void => {
  const db = getDb()
  const { project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
  const can = projectScope(db, ctx, project!).viewerCan.delete
  if (!can.allowed) throw forbiddenError(can.reason!)
  const workspaceIds = new Set(
    db.workspaces.filter((w) => w.projectId === project!.id).map((w) => w.id),
  )
  db.projects = db.projects.filter((p) => p.id !== project!.id)
  db.projectMembers = db.projectMembers.filter((m) => m.projectId !== project!.id)
  deleteWorkspaces(db, workspaceIds)
})
