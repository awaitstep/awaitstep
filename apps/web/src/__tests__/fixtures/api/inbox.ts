import type { InboxNotification, InboxPage, NotificationTarget } from '@awaitstep/ir'
import type {
  EditRequestRow,
  NotificationRow,
  NotificationTarget as SeedTarget,
  SeedDb,
} from '../seed/rows'

// Someone's Inbox in an org (`GET /notifications`), projected from the seed:
// the sample notifications, plus a row per edit-access request sent to them.

const SAMPLE_EVENT: Record<NotificationRow['kind'], string> = {
  failure: 'run.failed',
  expiry: 'api_key.expiring',
  people: 'invitation.accept',
  deploy: 'workflow.deploy.shared',
}

/** The seed names places by id; the API's link names them by slug. */
function toTarget(seed: SeedDb, to: SeedTarget): NotificationTarget | null {
  if (to.kind === 'org-settings') return to as NotificationTarget
  if (to.kind === 'project-connections') return to
  if (to.kind === 'project-settings') {
    const project = seed.projects.find((p) => p.id === to.projectId)
    return project
      ? ({ kind: 'project-settings', project: project.slug, page: to.page } as NotificationTarget)
      : null
  }
  const workspace = seed.workspaces.find((w) => w.id === to.workspaceId)
  const project = workspace && seed.projects.find((p) => p.id === workspace.projectId)
  return workspace && project
    ? ({
        kind: 'workspace',
        project: project.slug,
        workspace: workspace.slug,
        page: to.page,
      } as NotificationTarget)
    : null
}

const isRead = (seed: SeedDb, userId: string, id: string) =>
  seed.notificationReads.some((r) => r.userId === userId && r.notificationId === id)

function sample(
  seed: SeedDb,
  orgName: string,
  userId: string,
  row: NotificationRow,
): InboxNotification {
  const project = seed.projects.find((p) => p.id === row.projectId)
  const workspace = seed.workspaces.find((w) => w.id === row.workspaceId)
  return {
    id: row.id,
    kind: row.kind,
    event: SAMPLE_EVENT[row.kind],
    title: row.title,
    where: [project?.name ?? orgName, workspace?.name, row.whereDetail].filter(Boolean).join(' · '),
    at: row.at,
    read: isRead(seed, userId, row.id),
    needsAction: row.needsAction,
    count: 1,
    ...(row.link && toTarget(seed, row.link.to)
      ? { link: { label: row.link.label, to: toTarget(seed, row.link.to)! } }
      : {}),
  }
}

function request(seed: SeedDb, userId: string, row: EditRequestRow): InboxNotification | null {
  const workspace = seed.workspaces.find((w) => w.id === row.workspaceId)
  const project = workspace && seed.projects.find((p) => p.id === workspace.projectId)
  if (!workspace || !project) return null
  const asker = seed.people.find((p) => p.id === row.userId)?.name ?? 'Someone'
  const first = asker.split(' ')[0]
  const pending = row.status === 'pending'
  const outcome =
    row.status === 'declined'
      ? `Declined. ${first} was told.`
      : row.alreadyEditing
        ? `Approved. ${first} could already edit in ${workspace.name}.`
        : `Approved. ${first} is now an Editor in ${workspace.name}.`
  return {
    id: row.id,
    kind: 'request',
    event: 'access_request.create',
    title: `${asker} asked for edit access to ${workspace.name}`,
    where: `${project.name} · ${workspace.name}`,
    at: row.at,
    read: !pending || isRead(seed, userId, row.id),
    needsAction: pending,
    count: 1,
    request: { id: row.id, status: row.status, ...(pending ? {} : { outcome }) },
  }
}

export function inboxPage(seed: SeedDb, orgId: string, userId: string): InboxPage {
  const org = seed.orgs.find((o) => o.id === orgId)!
  const rows = [
    ...seed.notifications
      .filter((n) => n.orgId === orgId && n.userId === userId)
      .map((n) => sample(seed, org.name, userId, n)),
    ...seed.editRequests
      .filter((r) => r.toUserId === userId)
      .flatMap((r) => request(seed, userId, r) ?? []),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return {
    data: rows,
    counts: {
      all: rows.length,
      unread: rows.filter((r) => !r.read).length,
      action: rows.filter((r) => r.needsAction).length,
    },
  }
}
