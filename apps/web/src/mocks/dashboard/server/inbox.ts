import { orgDestinationPath, projectPagePath, workspacePath } from '../../../lib/dashboard-paths'
import { releaseFeed } from '../../../lib/release-feed'
import type { InboxNotification, ReleaseFeed } from '../../../types/dashboard/inbox'
import {
  getDb,
  type EditRequestRow,
  type MockDb,
  type NotificationRow,
  type NotificationTarget,
  type OrgRow,
} from '../db'
import {
  type MockContext,
  endpoint,
  forbiddenError,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { workspaceRoleOf } from '../access'
import { personById, workspaceScope } from './records'
import { requireScope } from './resolve'
import { SAMPLE_RELEASE_NOTES } from '../fixtures/release-notes'

// The Inbox and What's new. Thin: sample notifications plus a live row per
// edit request; read marks and the last What's new visit per person (B8).

function firstName(name: string): string {
  return name.split(' ')[0]!
}

function placeOf(db: MockDb, org: OrgRow, projectId: string | null, workspaceId: string | null) {
  const project = db.projects.find((p) => p.id === projectId)
  const workspace = db.workspaces.find((w) => w.id === workspaceId)
  return { project, workspace, name: project ? project.name : org.name }
}

function hrefOf(db: MockDb, org: OrgRow, to: NotificationTarget): string | null {
  if (to.kind === 'org-settings') return orgDestinationPath(org.slug, to.page)
  if (to.kind === 'project-settings') {
    const project = db.projects.find((p) => p.id === to.projectId)
    return project ? projectPagePath({ org: org.slug, project: project.slug }, to.page) : null
  }
  const workspace = db.workspaces.find((w) => w.id === to.workspaceId)
  const project = workspace && db.projects.find((p) => p.id === workspace.projectId)
  if (!workspace || !project) return null
  return workspacePath({ org: org.slug, project: project.slug, workspace: workspace.slug }, to.page)
}

/** The API's event for a sample row's kind. */
const SAMPLE_EVENT: Record<NotificationRow['kind'], string> = {
  failure: 'run.failed',
  expiry: 'api_key.expiring',
  people: 'invitation.accept',
  deploy: 'workflow.deploy.shared',
}

function isRead(db: MockDb, ctx: MockContext, id: string): boolean {
  return db.notificationReads.some((r) => r.userId === ctx.userId && r.notificationId === id)
}

function sampleRecord(
  db: MockDb,
  ctx: MockContext,
  org: OrgRow,
  row: NotificationRow,
): InboxNotification {
  const place = placeOf(db, org, row.projectId, row.workspaceId)
  const where = [place.name, place.workspace?.name, row.whereDetail].filter(Boolean).join(' · ')
  const href = row.link && hrefOf(db, org, row.link.to)
  return {
    id: row.id,
    kind: row.kind,
    event: SAMPLE_EVENT[row.kind],
    title: row.title,
    where,
    at: row.at,
    read: isRead(db, ctx, row.id),
    needsAction: row.needsAction,
    count: 1,
    link: row.link && href ? { label: row.link.label, href } : undefined,
  }
}

function requestRecord(
  db: MockDb,
  ctx: MockContext,
  org: OrgRow,
  row: EditRequestRow,
): InboxNotification | null {
  const workspace = db.workspaces.find((w) => w.id === row.workspaceId)
  const project = workspace && db.projects.find((p) => p.id === workspace.projectId)
  if (!workspace || !project || project.orgId !== org.id) return null
  const asker = personById(db, row.userId).name
  const pending = row.status === 'pending'
  const outcome =
    row.status === 'declined'
      ? `Declined. ${firstName(asker)} was told.`
      : row.alreadyEditing
        ? `Approved. ${firstName(asker)} could already edit in ${workspace.name}.`
        : `Approved. ${firstName(asker)} is now an Editor in ${workspace.name}.`
  return {
    id: row.id,
    kind: 'request',
    event: 'access_request.create',
    title: `${asker} asked for edit access to ${workspace.name}`,
    where: `${project.name} · ${workspace.name}`,
    at: row.at,
    // A decided request has been dealt with.
    read: !pending || isRead(db, ctx, row.id),
    needsAction: pending,
    count: 1,
    // A request row is the request: the same id answers it.
    request: { id: row.id, status: row.status, outcome: pending ? undefined : outcome },
  }
}

/** The viewer's notifications in this org, newest first. */
export const listNotifications = endpoint((ctx, orgSlug: string): InboxNotification[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const samples = db.notifications
    .filter((n) => n.orgId === org.id && n.userId === ctx.userId)
    .map((n) => sampleRecord(db, ctx, org, n))
  const requests = db.editRequests
    .filter((r) => r.toUserId === ctx.userId)
    .map((r) => requestRecord(db, ctx, org, r))
    .filter((n): n is InboxNotification => n !== null)
  return rows(
    ctx,
    [...samples, ...requests].sort((a, b) => b.at.localeCompare(a.at)),
  )
})

/** The viewer's own notification or request, by id. */
function ownNotificationIds(db: MockDb, ctx: MockContext, orgId: string): string[] {
  const orgWorkspaces = new Set(
    db.workspaces
      .filter((w) => db.projects.some((p) => p.id === w.projectId && p.orgId === orgId))
      .map((w) => w.id),
  )
  return [
    ...db.notifications
      .filter((n) => n.orgId === orgId && n.userId === ctx.userId)
      .map((n) => n.id),
    ...db.editRequests
      .filter((r) => r.toUserId === ctx.userId && orgWorkspaces.has(r.workspaceId))
      .map((r) => r.id),
  ]
}

function markRead(db: MockDb, ctx: MockContext, ids: string[]): void {
  for (const notificationId of ids) {
    if (!isRead(db, ctx, notificationId)) {
      db.notificationReads.push({ userId: ctx.userId, notificationId })
    }
  }
}

export const markNotificationRead = mutation(
  (ctx, orgSlug: string, notificationId: string): void => {
    const db = getDb()
    const { org } = requireScope(db, ctx, { org: orgSlug })
    if (!ownNotificationIds(db, ctx, org.id).includes(notificationId)) throw notFoundError()
    markRead(db, ctx, [notificationId])
  },
)

export const markAllNotificationsRead = mutation((ctx, orgSlug: string): void => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  markRead(db, ctx, ownNotificationIds(db, ctx, org.id))
})

/**
 * Approve or Decline an edit request sent to the viewer. Approving needs the
 * right to manage the workspace's members, and makes the asker an Editor.
 */
export const decideEditRequest = mutation(
  (ctx, orgSlug: string, requestId: string, decision: 'approve' | 'decline'): void => {
    const db = getDb()
    const { org } = requireScope(db, ctx, { org: orgSlug })
    const row = db.editRequests.find((r) => r.id === requestId && r.toUserId === ctx.userId)
    const workspace = row && db.workspaces.find((w) => w.id === row.workspaceId)
    const project = workspace && db.projects.find((p) => p.id === workspace.projectId)
    if (!row || !workspace || !project || project.orgId !== org.id) throw notFoundError()
    if (row.status !== 'pending') throw invalidError('Already answered')
    if (decision === 'approve') {
      const can = workspaceScope(db, ctx, project, workspace).viewerCan.manageMembers
      if (!can.allowed) throw forbiddenError(can.reason!)
      // Their role now, not when they asked: it may have changed since.
      const role = workspaceRoleOf(db, { scenario: 'none', userId: row.userId }, project, workspace)
      if (role === null) {
        throw invalidError(
          `${firstName(personById(db, row.userId).name)} is no longer in ${workspace.name}`,
        )
      }
      if (role === 'viewer') {
        const grant = db.workspaceMembers.find(
          (m) => m.workspaceId === workspace.id && m.userId === row.userId,
        )
        if (grant) grant.role = 'editor'
        else
          db.workspaceMembers.push({
            workspaceId: workspace.id,
            userId: row.userId,
            role: 'editor',
          })
      } else {
        // Raised meanwhile (Editor or Admin): approving never lowers it.
        row.alreadyEditing = true
      }
    }

    row.status = decision === 'approve' ? 'approved' : 'declined'
  },
)

/** What's new: every release, "New to you" since the viewer's last visit. Links stay in this org. */
export const listReleases = endpoint((ctx, orgSlug: string): ReleaseFeed => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const visit = db.releaseVisits.find((v) => v.userId === ctx.userId)
  const feed = releaseFeed(org.slug, SAMPLE_RELEASE_NOTES, {
    lastVisit: visit?.at ?? null,
    seen: visit?.seenIds ?? [],
  })
  return { ...feed, releases: rows(ctx, feed.releases) }
})

/** Closing What's new: what's there now is no longer new to them. */
export const markReleasesSeen = mutation((ctx, seenIds: string[]): void => {
  const db = getDb()
  const visit = db.releaseVisits.find((v) => v.userId === ctx.userId)
  const at = new Date().toISOString()
  if (visit) Object.assign(visit, { at, seenIds })
  else db.releaseVisits.push({ userId: ctx.userId, at, seenIds })
})
