import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { workspaceCapabilities } from '@awaitstep/ir'
import { isUniqueViolation } from '@awaitstep/db'
import { accessRequestRecord } from '../lib/access-records.js'
import { rolesOf } from '../lib/scope-records.js'
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
  return c.json(accessRequestRecord(result.request), result.created ? 201 : 200)
})

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
    await db.decideAccessRequest({
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
    return c.json({ ok: true, alreadyEditing })
  })
}
