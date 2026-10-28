import { and, asc, eq, aliasedTable } from 'drizzle-orm'
import type {
  MemberRole,
  OrgMemberSummary,
  OrgOverview,
  Project,
  ProjectRef,
  ScopeRows,
  ScopeSlugs,
  WorkspaceChip,
  WorkspaceIds,
  WorkspaceInProjectRef,
  WorkspaceRef,
} from '../types.js'
import { readJsonArray, type Dialect } from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Resolves what a dashboard URL or a query parameter names — an organization,
 * a project, a workspace — together with the caller's membership, in one
 * statement each. A missing row and a row the caller is no member of both
 * come back as null, so nothing above here can tell them apart.
 */
export class ScopeAdapter {
  private fields: OverviewFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: OverviewTables,
    dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  /** The organization, by id or slug, if the caller is a member. */
  async getOrganizationIfMember(
    userId: string,
    ref: { id: string } | { slug: string },
  ): Promise<({ id: string; slug: string } & MemberRole) | null> {
    const o = aliasedTable(this.t.organization, 'o')
    const me = aliasedTable(this.t.member, 'me')
    const rows = await this.db
      .select({ id: o.id, slug: o.slug, role: me.role })
      .from(o)
      .innerJoin(me, and(eq(me.organizationId, o.id), eq(me.userId, userId)))
      .where('id' in ref ? eq(o.id, ref.id) : eq(o.slug, ref.slug))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * The project, by id or slugs, if the caller is a member of its
   * organization — and, when `workspace` is given, that workspace's id, or
   * null for the whole thing when it is not the project's.
   */
  async getProjectIfMember(
    userId: string,
    ref: ProjectRef,
    workspace?: WorkspaceInProjectRef,
  ): Promise<({ project: Project; workspaceId: string | null } & MemberRole) | null> {
    const o = aliasedTable(this.t.organization, 'o')
    const me = aliasedTable(this.t.member, 'me')
    const p = aliasedTable(this.t.projects, 'p')
    const w = aliasedTable(this.t.workspaces, 'w')
    const rows = await this.db
      .select({ project: p, workspaceId: w.id, role: me.role })
      .from(p)
      .innerJoin(o, eq(o.id, p.organizationId))
      .innerJoin(me, and(eq(me.organizationId, o.id), eq(me.userId, userId)))
      .leftJoin(
        w,
        and(
          eq(w.projectId, p.id),
          workspace === undefined
            ? eq(w.id, '')
            : 'id' in workspace
              ? eq(w.id, workspace.id)
              : eq(w.slug, workspace.slug),
        ),
      )
      .where('id' in ref ? eq(p.id, ref.id) : and(eq(o.slug, ref.org), eq(p.slug, ref.slug)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    if (workspace !== undefined && row.workspaceId === null) return null
    return { project: row.project as Project, workspaceId: row.workspaceId, role: row.role }
  }

  /** A workspace's ids, by id or by slugs, if the caller is a member of its organization. */
  async getWorkspaceIfMember(
    userId: string,
    ref: WorkspaceRef,
  ): Promise<(WorkspaceIds & MemberRole) | null> {
    const o = aliasedTable(this.t.organization, 'o')
    const me = aliasedTable(this.t.member, 'me')
    const p = aliasedTable(this.t.projects, 'p')
    const w = aliasedTable(this.t.workspaces, 'w')
    const rows = await this.db
      .select({
        workspaceId: w.id,
        projectId: p.id,
        organizationId: p.organizationId,
        role: me.role,
      })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .innerJoin(o, eq(o.id, p.organizationId))
      .innerJoin(me, and(eq(me.organizationId, o.id), eq(me.userId, userId)))
      .where(
        'id' in ref
          ? eq(w.id, ref.id)
          : and(eq(o.slug, ref.org), eq(p.slug, ref.project), eq(w.slug, ref.workspace)),
      )
      .limit(1)
    return rows[0] ?? null
  }

  /** A workspace's ids within a project the caller already holds (an API key's). */
  async getWorkspaceInProject(
    projectId: string,
    ref: WorkspaceInProjectRef,
  ): Promise<WorkspaceIds | null> {
    const p = aliasedTable(this.t.projects, 'p')
    const w = aliasedTable(this.t.workspaces, 'w')
    const rows = await this.db
      .select({ workspaceId: w.id, projectId: p.id, organizationId: p.organizationId })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .where(and(eq(w.projectId, projectId), 'id' in ref ? eq(w.id, ref.id) : eq(w.slug, ref.slug)))
      .limit(1)
    return rows[0] ?? null
  }

  /** The caller's organizations with their counts, by name. */
  async listOrganizationsForMember(userId: string): Promise<OrgOverview[]> {
    const o = aliasedTable(this.t.organization, 'o')
    const me = aliasedTable(this.t.member, 'me')
    return this.db
      .select({
        id: o.id,
        slug: o.slug,
        name: o.name,
        logo: o.logo,
        createdAt: o.createdAt,
        viewerRole: me.role,
        projectCount: this.fields.projectCount(o.id),
        memberCount: this.fields.memberCount(o.id),
      })
      .from(o)
      .innerJoin(me, and(eq(me.organizationId, o.id), eq(me.userId, userId)))
      .orderBy(asc(o.name), asc(o.id))
  }

  /**
   * Everything the dashboard shows for the levels a URL names: the org with
   * its members, the project with its workspaces and health, the workspace
   * with its counts. One statement; the project and workspace joins are
   * left joins on the slug asked for, so a slug that matches nothing comes
   * back null and the caller decides which level was not found. `now` is
   * the clock for the 24-hour run count.
   */
  async getScopeBySlugs(
    userId: string,
    slugs: ScopeSlugs,
    now = new Date(),
  ): Promise<ScopeRows | null> {
    const o = aliasedTable(this.t.organization, 'o')
    const me = aliasedTable(this.t.member, 'me')
    const p = aliasedTable(this.t.projects, 'p')
    const w = aliasedTable(this.t.workspaces, 'w')
    const creator = aliasedTable(this.t.user, 'creator')
    const projectLocker = aliasedTable(this.t.user, 'project_locker')
    const workspaceLocker = aliasedTable(this.t.user, 'workspace_locker')
    const since = new Date(now.getTime() - DAY_MS).toISOString()

    const rows = await this.db
      .select({
        org: { id: o.id, slug: o.slug, name: o.name, logo: o.logo, createdAt: o.createdAt },
        viewerRole: me.role,
        projectCount: this.fields.projectCount(o.id),
        memberCount: this.fields.memberCount(o.id),
        members: this.fields.members(o.id),
        project: p,
        projectWorkspaces: this.fields.workspaceChips(p.id),
        projectHealth: this.fields.projectHealth(p.id),
        projectLockedByName: projectLocker.name,
        workspace: w,
        workspaceCounts: this.fields.workspaceCounts(w.id, since),
        workspaceCreatedByName: creator.name,
        workspaceLockedByName: workspaceLocker.name,
        siblings: this.fields.workspaceCount(p.id),
      })
      .from(o)
      .innerJoin(me, and(eq(me.organizationId, o.id), eq(me.userId, userId)))
      .leftJoin(p, and(eq(p.organizationId, o.id), eq(p.slug, slugs.project ?? '')))
      .leftJoin(w, and(eq(w.projectId, p.id), eq(w.slug, slugs.workspace ?? '')))
      .leftJoin(creator, eq(creator.id, w.createdBy))
      .leftJoin(projectLocker, eq(projectLocker.id, p.lockedBy))
      .leftJoin(workspaceLocker, eq(workspaceLocker.id, w.lockedBy))
      .where(eq(o.slug, slugs.org))
      .limit(1)
    const row = rows[0]
    if (!row) return null

    const members = readJsonArray<OrgMemberSummary>(row.members)
    const project =
      slugs.project !== undefined && row.project
        ? {
            ...(row.project as Project),
            workspaces: readJsonArray<WorkspaceChip>(row.projectWorkspaces),
            health: row.projectHealth,
            lockedByName: row.projectLockedByName,
            members,
          }
        : null
    const workspace =
      project && slugs.workspace !== undefined && row.workspace
        ? {
            ...row.workspace,
            counts: row.workspaceCounts,
            createdByName: row.workspaceCreatedByName,
            lockedByName: row.workspaceLockedByName,
            projectName: project.name,
            projectLockedAt: project.lockedAt,
            siblings: row.siblings,
            members,
          }
        : null
    return {
      org: {
        ...row.org,
        viewerRole: row.viewerRole,
        projectCount: row.projectCount,
        memberCount: row.memberCount,
        members,
      },
      project,
      workspace,
    }
  }
}
