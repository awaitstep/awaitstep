import type { LockState, LockTarget } from '../../../types/dashboard/locks'
import { getDb } from '../db'
import { forbiddenError, mutation } from '../scenario'
import { projectRecord, projectScope, workspaceRecord, workspaceScope } from './records'
import { requireScope } from './resolve'

/** Turns a project's or a workspace's deletion lock on or off, recording who and when. */
export const setLock = mutation((ctx, target: LockTarget, on: boolean): LockState => {
  const db = getDb()
  const { project, workspace } = requireScope(db, ctx, target)
  const can =
    target.level === 'project'
      ? projectScope(db, ctx, project!).viewerCan.toggleLock
      : workspaceScope(db, ctx, project!, workspace!).viewerCan.toggleLock
  if (!can.allowed) throw forbiddenError(can.reason!)
  const row = target.level === 'project' ? project! : workspace!
  // Turning on a lock that is already on keeps who set it and when.
  if (!on) row.lock = null
  else row.lock ??= { setBy: ctx.userId, setAt: new Date().toISOString() }
  return target.level === 'project'
    ? projectRecord(db, ctx, project!).lock
    : workspaceRecord(db, project!, workspace!).lock
})
