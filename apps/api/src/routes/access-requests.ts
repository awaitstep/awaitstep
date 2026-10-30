import { Hono, type Context } from 'hono'
import { nanoid } from 'nanoid'
import { workspaceCapabilities } from '@awaitstep/ir'
import { isUniqueViolation, type AccessRequestRow } from '@awaitstep/db'
import { accessRequestRecord } from '../lib/access-records.js'
import { rolesOf } from '../lib/scope-records.js'
import { recordAudit } from '../lib/audit.js'
import { emailEach, noticeGroup, notify } from '../lib/notify.js'
import type { AppEnv } from '../types.js'

// A Viewer's "Ask for edit access" (session-only, the router). Asking and
// reading one's own request live under the workspace; answering one is
// addressed by the request's id and open to whoever may manage that
// workspace's members.

export const workspaceAccessRequests = new Hono<AppEnv>()

/** The viewer's open request here, or null: the top bar's "Asked Ama". */
workspaceAccessRequests.get('/access-request', async (c) => {
  const row = await c.get('db').getOwnAccessRequest(c.get('workspaceId')!, c.get('userId'))
  return c.json(row ? accessRequestRecord(row) : null)
})

/** Asking again returns the open request; a non-Viewer has nothing to ask for. */
workspaceAccessRequests.post('/access-requests', async (c) => {
  const db = c.get('db')
  const workspaceId = c.get('workspaceId')!
  const userId = c.get('userId')
  if (c.get('workspaceRole') !== 'viewer') {
    return c.json({ error: 'You can already edit in this workspace' }, 400)
  }
  const ask = { id: nanoid(), workspaceId, userId, now: new Date().toISOString() }
  // The insert itself skips when one is open; the index behind it settles
  // two asks at once, and the one it refuses reads the other's.
  const result = await db.createAccessRequest(ask).catch(async (error: unknown) => {
    if (!isUniqueViolation(error)) throw error
    const open = await db.getOwnAccessRequest(workspaceId, userId)
    return open ? { request: open, created: false } : null
  })
  if (!result) return c.json({ error: 'No one in this workspace can grant edit access' }, 409)
  // Asking again re-sends a notice that's gone (purged, or a write that
  // failed): the row is kept while it exists, and only a new row is emailed.
  await tellAddressee(c, result.request)
  return c.json(accessRequestRecord(result.request), result.created ? 201 : 200)
})

/** A new request reaches the admin it is addressed to: in the Inbox and by email. */
async function tellAddressee(c: Context<AppEnv>, request: AccessRequestRow): Promise<void> {
  const workspaceName = c.get('workspaceName') ?? ''
  // The asker is the session's person; a name left empty reads as the address.
  const user = c.get('user')
  const asker = user?.name || user?.email || request.from.name
  const reached = await notify(c, {
    event: 'access_request.create',
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    workspaceId: request.workspaceId,
    accessRequestId: request.id,
    groupKey: noticeGroup.accessRequest(request.id),
    meta: { person: asker, workspace: workspaceName },
    recipients: { users: [request.to.id] },
  })
  const emails = c.get('emails')
  if (!emails) return
  await emailEach(reached, (to) =>
    emails.sendAccessRequest({
      to: to.email,
      url: emails.inboxUrl(to.orgSlug),
      askerName: asker,
      workspaceName,
      projectName: c.get('projectName') ?? '',
    }),
  )
}

export const accessRequests = new Hono<AppEnv>()

const DECIDING: Parameters<typeof workspaceCapabilities>[1] = {
  ownLock: false,
  lockedByProject: null,
  isLastWorkspace: false,
  sharedInUse: false,
}

for (const decision of ['approve', 'decline'] as const) {
  accessRequests.post(`/:id/${decision}`, async (c) => {
    const db = c.get('db')
    // One read: the request, the asker's rows now, and the decider's own.
    const found = await db.getAccessRequestForDecision(c.req.param('id'), c.get('userId'))
    if (!found) return c.json({ error: 'Not found' }, 404)

    // Who may decide comes first: a request in a workspace the caller
    // cannot open is not found, before its state says anything.
    const role = rolesOf(found.decider).workspaceRole
    if (!role) return c.json({ error: 'Not found' }, 404)
    const can = workspaceCapabilities(role, DECIDING).manageMembers
    if (!can.allowed) return c.json({ error: can.reason }, 403)
    if (found.request.status !== 'pending') return c.json({ error: 'Already answered' }, 409)

    // The asker's role now, not when they asked: it may have changed since.
    const askerRole = rolesOf(found.asker).workspaceRole
    if (decision === 'approve' && askerRole === null) {
      return c.json({ error: `${found.asker.name} is no longer in ${found.workspace.name}` }, 409)
    }
    const alreadyEditing = decision === 'approve' && askerRole !== 'viewer'
    const decided = await db.decideAccessRequest({
      id: found.request.id,
      status: decision === 'approve' ? 'approved' : 'declined',
      decidedBy: c.get('userId'),
      now: new Date().toISOString(),
      alreadyEditing,
      grant:
        decision === 'approve' && !alreadyEditing
          ? { workspaceId: found.workspace.id, userId: found.request.userId }
          : null,
    })
    // Another answer landed first: it is recorded, and told, by that call.
    if (!decided) return c.json({ error: 'Already answered' }, 409)
    await recordAudit(c, {
      event: decision === 'approve' ? 'access_request.approve' : 'access_request.decline',
      facts: {
        name: found.workspace.name,
        person: found.asker.name,
        role: decision === 'approve' && !alreadyEditing ? 'editor' : undefined,
      },
      organizationId: found.workspace.organizationId,
      projectId: found.workspace.projectId,
      workspaceId: found.workspace.id,
    })
    await notify(c, {
      event: decision === 'approve' ? 'access_request.approve' : 'access_request.decline',
      organizationId: found.workspace.organizationId,
      projectId: found.workspace.projectId,
      workspaceId: found.workspace.id,
      groupKey: noticeGroup.requestDecided(found.request.id),
      meta: {
        person: c.get('user')?.name || c.get('user')?.email,
        workspace: found.workspace.name,
        ...(alreadyEditing && { alreadyEditing }),
      },
      recipients: { users: [found.request.userId] },
    })
    return c.json({ ok: true, alreadyEditing })
  })
}
