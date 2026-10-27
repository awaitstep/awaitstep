import { isReservedSlug } from '../../../lib/dashboard-paths'
import { slugify } from '../../../lib/slug'
import type { NotFound } from '../../../types/dashboard/scope'
import { canSeeProject, orgRoleOf, workspaceRoleOf } from '../access'
import type { MockDb, OrgRow, ProjectRow, WorkspaceRow } from '../db'
import { type MockContext, invalidError, notFoundError } from '../scenario'

// Slug → row lookups that apply visibility. Anything the viewer can't open
// resolves exactly like something that doesn't exist (O9).

export type Resolved<T> = { row: T } | { notFound: NotFound }

export function resolveOrg(db: MockDb, ctx: MockContext, slug: string): Resolved<OrgRow> {
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

/** `base`, suffixed `-2`, `-3`… until no sibling uses it. */
function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  let slug = base
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`
  return slug
}

type SlugLevel = 'project' | 'workspace'

/** A new slug from `base` that no sibling uses and no dashboard page owns. */
export function availableSlug(
  level: SlugLevel,
  base: string,
  takenBySibling: (slug: string) => boolean,
): string {
  return uniqueSlug(base, (slug) => isReservedSlug(level, slug) || takenBySibling(slug))
}

/** Refuses a chosen slug that a dashboard page already owns. */
export function assertNotReserved(level: SlugLevel, slug: string): void {
  if (isReservedSlug(level, slug)) {
    throw invalidError(`“${slug}” is used by a dashboard page. Pick another URL`, 'slug')
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}
