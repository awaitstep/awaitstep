import type { EditRequest } from '../../../types/dashboard/access'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { workspaceRoleOf } from '../access'
import { getDb, type EditRequestRow, type MockDb } from '../db'
import { frameEndpoint, invalidError, mutation } from '../scenario'
import { personById, workspacePeople, workspaceScope } from './records'
import { newId, requireScope } from './resolve'

type WorkspaceSlugs = Required<ScopeSlugs>

function requestRecord(db: MockDb, row: EditRequestRow): EditRequest {
  const person = (id: string) => ({ id, name: personById(db, id).name })
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    from: person(row.userId),
    to: person(row.toUserId),
    at: row.at,
  }
}

/**
 * The viewer's open edit-access request for this workspace, if any. Part of
 * the frame: the top bar's "Asked …" shows while the lists load.
 */
export const getEditRequest = frameEndpoint((ctx, slugs: WorkspaceSlugs): EditRequest | null => {
  const db = getDb()
  const { workspace } = requireScope(db, ctx, slugs)
  const row = db.editRequests.find(
    (r) => r.workspaceId === workspace!.id && r.userId === ctx.userId,
  )
  return row ? requestRecord(db, row) : null
})

/** "Ask for edit access": goes to the workspace's first admin, as the board's "Asked Ama Mensah". */
export const requestEditAccess = mutation((ctx, slugs: WorkspaceSlugs): EditRequest => {
  const db = getDb()
  const { project, workspace } = requireScope(db, ctx, slugs)
  if (workspaceScope(db, ctx, project!, workspace!).viewerRole !== 'viewer') {
    throw invalidError('You can already edit in this workspace')
  }
  const existing = db.editRequests.find(
    (r) => r.workspaceId === workspace!.id && r.userId === ctx.userId,
  )
  if (existing) return requestRecord(db, existing)
  const admin = workspacePeople(db, project!, workspace!).find(
    (person) =>
      person.id !== ctx.userId &&
      workspaceRoleOf(db, { scenario: 'none', userId: person.id }, project!, workspace!) ===
        'admin',
  )
  if (!admin) throw invalidError('No one in this workspace can grant edit access')
  const row: EditRequestRow = {
    id: newId('req'),
    workspaceId: workspace!.id,
    userId: ctx.userId,
    toUserId: admin.id,
    at: new Date().toISOString(),
  }
  db.editRequests.push(row)
  return requestRecord(db, row)
})
