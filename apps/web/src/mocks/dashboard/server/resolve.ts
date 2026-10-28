import { isReservedSlug, slugify } from '@awaitstep/ir'
import { availableSlug } from '../../../lib/available-slug'
import type { NotFound } from '../../../types/dashboard/scope'
import { canSeeProject, orgRoleOf, workspaceRoleOf } from '../access'
import type { MockDb, OrgRow, ProjectRow, WorkspaceRow } from '../db'
import { type MockContext, invalidError, notFoundError } from '../scenario'

// Slug → row lookups that apply visibility. Anything the viewer can't open
// resolves exactly like something that doesn't exist (O9).

export type Resolved<T> = { row: T } | { notFound: NotFound }

// On the real API (`ctx.real`), a feature still on dummy data is asked about
// real slugs the dummy tables never heard of. It gets a bare row for each —
// owned by the viewer, holding nothing — so its lists come back empty and
// its dialogs can name where they are. In memory only: writes are refused
// before anything could save them.

function realOrg(db: MockDb, ctx: MockContext, slug: string): OrgRow {
  const now = new Date().toISOString()
  const row: OrgRow = { id: `real:${slug}`, slug, name: slug, createdAt: now, logo: null }
  db.orgs.push(row)
  db.orgMembers.push({
    orgId: row.id,
    userId: ctx.userId,
    role: 'owner',
    joinedAt: now,
    lastOpenedAt: null,
  })
  return row
}

function realProject(db: MockDb, org: OrgRow, slug: string): ProjectRow {
  const now = new Date().toISOString()
  const row: ProjectRow = {
    id: `${org.id}/${slug}`,
    orgId: org.id,
    slug,
    name: slug,
    description: null,
    createdAt: now,
    updatedAt: now,
    lock: null,
  }
  db.projects.push(row)
  return row
}

function realWorkspace(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  slug: string,
): WorkspaceRow {
  const row: WorkspaceRow = {
    id: `${project.id}/${slug}`,
    projectId: project.id,
    slug,
    name: slug,
    description: null,
    colour: 'green',
    createdAt: new Date().toISOString(),
    createdBy: ctx.userId,
    lock: null,
  }
  db.workspaces.push(row)
  return row
}

export function resolveOrg(db: MockDb, ctx: MockContext, slug: string): Resolved<OrgRow> {
  if (ctx.real) {
    // Never a fixture org, even one with the same slug: the viewer's real org is their own.
    const own = db.orgs.find((o) => o.id === `real:${slug}`)
    return { row: own ?? realOrg(db, ctx, slug) }
  }
  const row = db.orgs.find((o) => o.slug === slug)
  if (row && orgRoleOf(db, ctx, row.id)) return { row }
  return { notFound: { kind: 'organization', slug, parent: null } }
}

export function resolveProject(
  db: MockDb,
  ctx: MockContext,
  org: OrgRow,
  slug: string,
): Resolved<ProjectRow> {
  const row = db.projects.find((p) => p.orgId === org.id && p.slug === slug)
  if (row && canSeeProject(db, ctx, row)) return { row }
  if (ctx.real && !row) return { row: realProject(db, org, slug) }
  return { notFound: { kind: 'project', slug, parent: { name: org.name, slug: org.slug } } }
}

export function resolveWorkspace(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  slug: string,
): Resolved<WorkspaceRow> {
  const row = db.workspaces.find((w) => w.projectId === project.id && w.slug === slug)
  if (row && workspaceRoleOf(db, ctx, project, row)) return { row }
  if (ctx.real && !row) return { row: realWorkspace(db, ctx, project, slug) }
  return {
    notFound: { kind: 'workspace', slug, parent: { name: project.name, slug: project.slug } },
  }
}

function unwrap<T>(resolved: Resolved<T>): T {
  if ('notFound' in resolved) throw notFoundError()
  return resolved.row
}

/** The org, project and workspace a route names, or a 404 for the first one missing. */
export function requireScope(
  db: MockDb,
  ctx: MockContext,
  slugs: { org: string; project?: string; workspace?: string },
): { org: OrgRow; project?: ProjectRow; workspace?: WorkspaceRow } {
  const org = unwrap(resolveOrg(db, ctx, slugs.org))
  if (slugs.project === undefined) return { org }
  const project = unwrap(resolveProject(db, ctx, org, slugs.project))
  if (slugs.workspace === undefined) return { org, project }
  return { org, project, workspace: unwrap(resolveWorkspace(db, ctx, project, slugs.workspace)) }
}

/**
 * The URL slug for `input`. Throws when nothing usable is left, instead of
 * `slugify`'s "default" fallback, which would silently move a project or
 * workspace to `/default`.
 */
export function slugFrom(input: string, label: string, field: 'name' | 'slug'): string {
  const slug = slugify(input, '')
  if (!slug) throw invalidError(`The ${label} needs at least one letter or number`, field)
  return slug
}

type SlugLevel = 'org' | 'project' | 'workspace'

export { availableSlug }

/** Refuses a chosen slug that a dashboard page already owns. */
export function assertNotReserved(level: SlugLevel, slug: string): void {
  if (isReservedSlug(level, slug)) {
    throw invalidError(`“${slug}” is used by a dashboard page. Pick another URL`, 'slug')
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}
