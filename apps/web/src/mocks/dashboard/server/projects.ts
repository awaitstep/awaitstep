import type { NewProjectInput, Project, ProjectUpdate } from '../../../types/dashboard/projects'
import type { Workspace } from '../../../types/dashboard/workspaces'
import { canSeeProject, orgRoleOf } from '../access'
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
    if (!name) throw invalidError('A project needs a name', 'name')
    const base = slugFrom(name, 'project name', 'name')
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
    if (name === '') throw invalidError('A project needs a name', 'name')
    const slug = update.slug === undefined ? undefined : slugFrom(update.slug, 'URL', 'slug')
    if (slug) assertNotReserved('project', slug)
    if (slug && db.projects.some((p) => p.orgId === org.id && p.slug === slug && p.id !== row.id)) {
      throw conflictError('Another project in this organization already uses that URL', 'slug')
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
  // A deleted project drops its scope rows; a project key left with none goes with it, and its
  // workspace keys go with their workspaces in deleteWorkspaces below.
  for (const k of db.keys) {
    k.projectScopes = k.projectScopes.filter((s) => s.id !== project!.id)
  }
  db.keys = db.keys.filter((k) => k.level !== 'project' || k.projectScopes.length > 0)
  db.variables = db.variables.filter((v) => v.level !== 'project' || v.scopeId !== project!.id)
  deleteWorkspaces(db, workspaceIds)
})

/**
 * Moves the project, with its workspaces, items and keys, to another org the
 * viewer owns or administers. Resolves to its new address.
 */
export const moveProject = mutation(
  (
    ctx,
    orgSlug: string,
    projectSlug: string,
    toOrgSlug: string,
  ): { org: string; project: string } => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const can = projectScope(db, ctx, project!).viewerCan.move
    if (!can.allowed) throw forbiddenError(can.reason!)
    const { org: to } = requireScope(db, ctx, { org: toOrgSlug })
    if (to.id === org.id) throw invalidError('Pick another organization')
    const role = orgRoleOf(db, ctx, to.id)
    if (role !== 'owner' && role !== 'admin') {
      throw forbiddenError(`Only owners and admins of ${to.name} can move projects into it`)
    }
    const row = project!
    row.orgId = to.id
    row.slug = availableSlug('project', row.slug, (s) =>
      db.projects.some((p) => p.orgId === to.id && p.slug === s && p.id !== row.id),
    )
    row.updatedAt = new Date().toISOString()
    // Grants for people outside the new org don't travel: joining it later mustn't revive them.
    const inTarget = new Set(db.orgMembers.filter((m) => m.orgId === to.id).map((m) => m.userId))
    const workspaceIds = new Set(
      db.workspaces.filter((w) => w.projectId === row.id).map((w) => w.id),
    )
    // Keys that reach this project (directly or through its workspaces) follow it to the new org.
    // A multi-project bundle that also reaches projects left behind is moved whole here (a mock-only
    // simplification; the fixtures never split a bundle across orgs this way).
    for (const key of db.keys) {
      const touches =
        key.projectScopes.some((s) => s.id === row.id) ||
        key.workspaceScopes.some((s) => workspaceIds.has(s.id))
      if (touches) key.orgId = to.id
    }
    db.projectMembers = db.projectMembers.filter(
      (m) => m.projectId !== row.id || inTarget.has(m.userId),
    )
    db.workspaceMembers = db.workspaceMembers.filter(
      (m) => !workspaceIds.has(m.workspaceId) || inTarget.has(m.userId),
    )
    return { org: to.slug, project: row.slug }
  },
)
