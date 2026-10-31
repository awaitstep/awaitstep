import type { AccessGrant } from '../../../types/dashboard/access'
import type {
  AccessPlace,
  Connection,
  Invitation,
  NewConnectionInput,
  NewInvitesInput,
  OrgMember,
  OrgUpdate,
  PersonAccess,
} from '../../../types/dashboard/org-settings'
import type { OrgSummary } from '../../../types/dashboard/session'
import type { OrgRole } from '../../../types/dashboard/session'
import { canSeeProject, orgRoleOf, workspaceRoleOf } from '../access'
import { getDb, type MockDb, type OrgRow } from '../db'
import {
  type MockContext,
  conflictError,
  endpoint,
  forbiddenError,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { orgRecord, orgScope, personById } from './records'
import { askedNoticeId } from './invites'
import { assertImage } from './images'
import { managedOrg } from './levels'
import { assertNotReserved, newId, requireScope, slugFrom } from './resolve'

// Org settings: members and their access, invitations, connections, and the
// org itself. Thin: records and the rules the boards state, nothing more.

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACCOUNT_ID = /^[0-9a-f]{32}$/i

function orgOf(ctx: MockContext, orgSlug: string) {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  return { db, org }
}

function projectsOf(db: MockDb, org: OrgRow) {
  return db.projects.filter((p) => p.orgId === org.id)
}

/** Projects the viewer can open: the only ones settings lists may name (O9). */
function visibleProjectIds(db: MockDb, ctx: MockContext, org: OrgRow): Set<string> {
  return new Set(
    projectsOf(db, org)
      .filter((p) => canSeeProject(db, ctx, p))
      .map((p) => p.id),
  )
}

/**
 * Where a member can work, as the viewer may see it: projects the viewer
 * can open, naming and counting only the workspaces the viewer can open
 * (the API's `listOrgMembers`). A workspace row in a project the person
 * holds project-wide adds nothing, and is left out.
 */
function placesOf(db: MockDb, ctx: MockContext, org: OrgRow, userId: string): AccessPlace[] {
  const seen = projectsOf(db, org).filter((p) => canSeeProject(db, ctx, p))
  return seen.flatMap((project): AccessPlace[] => {
    const workspaces = db.workspaces.filter(
      (w) => w.projectId === project.id && workspaceRoleOf(db, ctx, project, w) !== null,
    )
    const ref = { id: project.id, name: project.name, workspaceCount: workspaces.length }
    const projectRow = db.projectMembers.find(
      (m) => m.projectId === project.id && m.userId === userId,
    )
    if (projectRow) return [{ project: ref, workspace: null, role: projectRow.role }]
    return workspaces.flatMap((w) => {
      const grant = db.workspaceMembers.find((m) => m.workspaceId === w.id && m.userId === userId)
      return grant
        ? [{ project: ref, workspace: { id: w.id, name: w.name }, role: grant.role }]
        : []
    })
  })
}

/** Org Settings → Members: everyone in the org, and where each can work. */
export const listOrgMembers = endpoint((ctx, orgSlug: string): OrgMember[] => {
  const { db, org } = orgOf(ctx, orgSlug)
  return rows(
    ctx,
    db.orgMembers
      .filter((m) => m.orgId === org.id)
      .map((m) => ({
        person: personById(db, m.userId),
        role: m.role,
        places: m.role === 'member' ? placesOf(db, ctx, org, m.userId) : [],
      })),
  )
})

/** The access editor's data for one person. */
export const getPersonAccess = endpoint((ctx, orgSlug: string, userId: string): PersonAccess => {
  const { db, org } = managedOrg(ctx, orgSlug)
  const membership = db.orgMembers.find((m) => m.orgId === org.id && m.userId === userId)
  if (!membership) throw notFoundError()
  const projects = projectsOf(db, org)
  const workspaceIds = new Set(
    db.workspaces.filter((w) => projects.some((p) => p.id === w.projectId)).map((w) => w.id),
  )
  return {
    person: personById(db, userId),
    joinedAt: membership.joinedAt,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      initial: p.name.charAt(0).toUpperCase(),
      workspaces: db.workspaces
        .filter((w) => w.projectId === p.id)
        .map((w) => ({ id: w.id, slug: w.slug, name: w.name, colour: w.colour })),
    })),
    draft: {
      orgRole: membership.role,
      projects: Object.fromEntries(
        db.projectMembers
          .filter((m) => m.userId === userId && projects.some((p) => p.id === m.projectId))
          .map((m) => [m.projectId, m.role]),
      ),
      workspaces: Object.fromEntries(
        db.workspaceMembers
          .filter((m) => m.userId === userId && workspaceIds.has(m.workspaceId))
          .map((m) => [m.workspaceId, m.role]),
      ),
    },
  }
})

/** Whether `userId` is the org's only owner: they can't leave or stop being one. */
export function isOnlyOwner(db: MockDb, org: OrgRow, userId: string): boolean {
  const owners = db.orgMembers.filter((m) => m.orgId === org.id && m.role === 'owner')
  return owners.length === 1 && owners[0]!.userId === userId
}

/** Refuses taking away the org's last owner. */
export function assertKeepsAnOwner(db: MockDb, org: OrgRow, userId: string): void {
  if (isOnlyOwner(db, org, userId)) throw conflictError('Make someone else an owner first')
}

/** Drops someone's project and workspace grants in the org. */
export function dropGrants(db: MockDb, org: OrgRow, userId: string): void {
  const projectIds = new Set(projectsOf(db, org).map((p) => p.id))
  const workspaceIds = new Set(
    db.workspaces.filter((w) => projectIds.has(w.projectId)).map((w) => w.id),
  )
  db.projectMembers = db.projectMembers.filter(
    (m) => !(m.userId === userId && projectIds.has(m.projectId)),
  )
  db.workspaceMembers = db.workspaceMembers.filter(
    (m) => !(m.userId === userId && workspaceIds.has(m.workspaceId)),
  )
}

/**
 * Owners alone make owners, and change or remove an owner: an admin can't
 * raise themselves (or anyone) past their own role.
 */
function assertMayTouchOwners(
  db: MockDb,
  ctx: MockContext,
  org: OrgRow,
  current: OrgRole,
  next: OrgRole | null,
): void {
  if (current !== 'owner' && next !== 'owner') return
  if (orgRoleOf(db, ctx, org.id) !== 'owner') {
    throw forbiddenError('Only owners can make or change owners')
  }
}

/** Refuses grants on projects or workspaces outside the org. */
function assertInOrg(db: MockDb, org: OrgRow, grant: AccessGrant): void {
  const projectIds = new Set(projectsOf(db, org).map((p) => p.id))
  const workspaceIds = new Set(
    db.workspaces.filter((w) => projectIds.has(w.projectId)).map((w) => w.id),
  )
  if (
    grant.projects.some((p) => !projectIds.has(p.projectId)) ||
    grant.workspaces.some((w) => !workspaceIds.has(w.workspaceId))
  ) {
    throw notFoundError()
  }
}

/** Save access: replaces the person's org role and grants with the editor's. */
export const saveAccess = mutation(
  (ctx, orgSlug: string, userId: string, grant: AccessGrant): void => {
    const { db, org } = managedOrg(ctx, orgSlug)
    const membership = db.orgMembers.find((m) => m.orgId === org.id && m.userId === userId)
    if (!membership) throw notFoundError()
    assertMayTouchOwners(db, ctx, org, membership.role, grant.orgRole)
    assertInOrg(db, org, grant)
    if (grant.orgRole !== 'owner') assertKeepsAnOwner(db, org, userId)
    membership.role = grant.orgRole
    dropGrants(db, org, userId)
    for (const p of grant.projects) {
      db.projectMembers.push({ projectId: p.projectId, userId, role: p.role })
    }
    for (const w of grant.workspaces) {
      db.workspaceMembers.push({ workspaceId: w.workspaceId, userId, role: w.role })
    }
  },
)

/** Remove from the org, with every grant in it. */
export const removeFromOrg = mutation((ctx, orgSlug: string, userId: string): void => {
  const { db, org } = managedOrg(ctx, orgSlug)
  const membership = db.orgMembers.find((m) => m.orgId === org.id && m.userId === userId)
  if (!membership) throw notFoundError()
  assertMayTouchOwners(db, ctx, org, membership.role, null)
  assertKeepsAnOwner(db, org, userId)
  dropGrants(db, org, userId)
  db.orgMembers = db.orgMembers.filter((m) => !(m.orgId === org.id && m.userId === userId))
})

function invitationRecord(
  db: MockDb,
  ctx: MockContext,
  row: MockDb['invitations'][number],
): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    // Places the viewer can't open — the project for a project-wide place,
    // the workspace itself for a workspace place — or that are gone, aren't named.
    places: row.places.flatMap((place): Invitation['places'] => {
      const project = db.projects.find((p) => p.id === place.projectId)
      if (!project || !canSeeProject(db, ctx, project)) return []
      if (!place.workspaceId) {
        return [
          { kind: 'project' as const, project: project.name, workspace: null, role: place.role },
        ]
      }
      const workspace = db.workspaces.find((w) => w.id === place.workspaceId)
      return workspace && workspaceRoleOf(db, ctx, project, workspace) !== null
        ? [
            {
              kind: 'workspace' as const,
              project: project.name,
              workspace: workspace.name,
              role: place.role,
            },
          ]
        : []
    }),
    sentAt: row.sentAt,
    invitedBy: { id: row.invitedBy, name: personById(db, row.invitedBy).name },
  }
}

export const listInvitations = endpoint((ctx, orgSlug: string): Invitation[] => {
  const { db, org } = managedOrg(ctx, orgSlug)
  return rows(
    ctx,
    db.invitations
      // A declined invite isn't waiting on anyone; inviting them again replaces it.
      .filter((i) => i.orgId === org.id && !i.declined)
      .map((i) => invitationRecord(db, ctx, i)),
  )
})

/** Invite people: one pending invitation per email. */
export const sendInvites = mutation(
  (ctx, orgSlug: string, input: NewInvitesInput): Invitation[] => {
    const { db, org } = managedOrg(ctx, orgSlug)
    const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
    if (emails.length === 0) throw invalidError('Add at least one email address', 'emails')
    const bad = emails.find((e) => !EMAIL.test(e))
    if (bad) throw invalidError(`“${bad}” isn’t an email address`, 'emails')
    const memberEmails = new Set(
      db.orgMembers
        .filter((m) => m.orgId === org.id)
        .map((m) => personById(db, m.userId).email.toLowerCase()),
    )
    const member = emails.find((e) => memberEmails.has(e))
    if (member) throw conflictError(`${member} is already in ${org.name}`, 'emails')
    const invited = emails.find((e) =>
      db.invitations.some((i) => i.orgId === org.id && i.email === e && !i.declined),
    )
    if (invited) throw conflictError(`${invited} is already invited`, 'emails')
    db.invitations = db.invitations.filter(
      (i) => !(i.orgId === org.id && i.declined && emails.includes(i.email)),
    )
    const now = new Date().toISOString()
    const created = emails.map((email) => ({
      id: newId('inv'),
      orgId: org.id,
      email,
      role: input.role,
      places: input.role === 'member' ? input.places : [],
      sentAt: now,
      invitedBy: ctx.userId,
    }))
    db.invitations.push(...created)
    return created.map((row) => invitationRecord(db, ctx, row))
  },
)

export const resendInvite = mutation((ctx, orgSlug: string, invitationId: string): void => {
  const { db, org } = managedOrg(ctx, orgSlug)
  const row = db.invitations.find((i) => i.id === invitationId && i.orgId === org.id)
  if (!row) throw notFoundError()
  // A fresh week, so an expired invite opens again and can be asked about again.
  row.sentAt = new Date().toISOString()
  delete row.askedForNewAt
  // Resending answers "asked for a new invite" in the inviter's Inbox.
  db.notifications = db.notifications.filter((n) => n.id !== askedNoticeId(row.id))
})

export const cancelInvite = mutation((ctx, orgSlug: string, invitationId: string): void => {
  const { db, org } = managedOrg(ctx, orgSlug)
  const before = db.invitations.length
  db.invitations = db.invitations.filter((i) => !(i.id === invitationId && i.orgId === org.id))
  if (db.invitations.length === before) throw notFoundError()
})

function connectionRecord(
  db: MockDb,
  row: MockDb['connections'][number],
  visible: Set<string>,
): Connection {
  return {
    id: row.id,
    name: row.name,
    accountSuffix: row.accountId.slice(-4),
    addedBy: { id: row.addedBy, name: personById(db, row.addedBy).name },
    // Dummy tokens are never checked (D-P5-5): a stored one reads as working.
    tokenStatus: 'active',
    tokenExpiresAt: row.tokenExpiresAt,
    projects:
      row.projects === 'all'
        ? 'all'
        : row.projects
            .map((id) => db.projects.find((p) => p.id === id))
            .filter((p): p is NonNullable<typeof p> => p !== undefined && visible.has(p.id))
            .map((p) => ({ id: p.id, name: p.name })),
    hiddenProjects:
      row.projects === 'all' ? 0 : row.projects.filter((id) => !visible.has(id)).length,
    deployments: { count: row.deployments, lastAt: row.lastDeployAt },
  }
}

function connectionIn(db: MockDb, org: OrgRow, id: string) {
  const row = db.connections.find((c) => c.id === id && c.orgId === org.id)
  if (!row) throw notFoundError()
  return row
}

export const listConnections = endpoint((ctx, orgSlug: string): Connection[] => {
  const { db, org } = orgOf(ctx, orgSlug)
  return rows(
    ctx,
    db.connections
      .filter((c) => c.orgId === org.id)
      .map((c) => connectionRecord(db, c, visibleProjectIds(db, ctx, org))),
  )
})

/** Connect Cloudflare. No token check on dummy data (D-P5-5): the form's own rules only. */
export const connect = mutation((ctx, orgSlug: string, input: NewConnectionInput): Connection => {
  const { db, org } = managedOrg(ctx, orgSlug)
  const name = input.name.trim()
  if (!name) throw invalidError('The connection needs a name', 'name')
  const accountId = input.accountId.trim()
  if (!ACCOUNT_ID.test(accountId)) {
    throw invalidError('An account ID is 32 letters and digits (0–9, a–f)', 'accountId')
  }
  if (!input.token.trim()) throw invalidError('Paste the API token', 'token')
  const row = {
    id: newId('conn'),
    orgId: org.id,
    name,
    accountId,
    addedBy: ctx.userId,
    tokenExpiresAt: null,
    projects: input.projects,
    deployments: 0,
    lastDeployAt: null,
  }
  db.connections.push(row)
  return connectionRecord(db, row, visibleProjectIds(db, ctx, org))
})

export const replaceToken = mutation(
  (ctx, orgSlug: string, connectionId: string, token: string): void => {
    const { db, org } = managedOrg(ctx, orgSlug)
    const row = connectionIn(db, org, connectionId)
    if (!token.trim()) throw invalidError('Paste the API token', 'token')
    row.tokenExpiresAt = null
  },
)

export const updateConnection = mutation(
  (
    ctx,
    orgSlug: string,
    connectionId: string,
    update: { name?: string; projects?: 'all' | string[] },
  ): void => {
    const { db, org } = managedOrg(ctx, orgSlug)
    const row = connectionIn(db, org, connectionId)
    if (update.name !== undefined) {
      const name = update.name.trim()
      if (!name) throw invalidError('The connection needs a name', 'name')
      row.name = name
    }
    if (update.projects !== undefined) row.projects = update.projects
  },
)

export const removeConnection = mutation((ctx, orgSlug: string, connectionId: string): void => {
  const { db, org } = managedOrg(ctx, orgSlug)
  connectionIn(db, org, connectionId)
  db.connections = db.connections.filter((c) => c.id !== connectionId)
})

/** Org Settings → General: name, URL, logo. */
export const updateOrg = mutation((ctx, orgSlug: string, update: OrgUpdate): OrgSummary => {
  const { db, org } = managedOrg(ctx, orgSlug)
  const name = update.name?.trim()
  if (name === '') throw invalidError('The organization needs a name', 'name')
  const slug = update.slug === undefined ? undefined : slugFrom(update.slug, 'URL', 'slug')
  if (slug) assertNotReserved('org', slug)
  if (slug && db.orgs.some((o) => o.slug === slug && o.id !== org.id)) {
    throw conflictError('Another organization already uses that URL', 'slug')
  }
  if (update.logo) assertImage(update.logo, LOGO_TYPES, 'logo')
  if (name) org.name = name
  if (slug) org.slug = slug
  if (update.logo !== undefined) org.logo = update.logo
  return orgRecord(db, ctx, org)
})

/** Deletes an org with no projects left (owners only). */
export const deleteOrg = mutation((ctx, orgSlug: string): void => {
  const { db, org } = orgOf(ctx, orgSlug)
  const can = orgScope(db, ctx, org).viewerCan.delete
  if (!can.allowed) throw forbiddenError(can.reason!)
  db.orgs = db.orgs.filter((o) => o.id !== org.id)
  db.orgMembers = db.orgMembers.filter((m) => m.orgId !== org.id)
  db.invitations = db.invitations.filter((i) => i.orgId !== org.id)
  db.connections = db.connections.filter((c) => c.orgId !== org.id)
  db.keys = db.keys.filter((k) => k.orgId !== org.id)
  db.variables = db.variables.filter((v) => v.level !== 'organization' || v.scopeId !== org.id)
})
