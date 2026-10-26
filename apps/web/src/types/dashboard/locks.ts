export interface Lock {
  setBy: { id: string; name: string }
  setAt: string
}

/**
 * A deletion lock as a page shows it: the scope's own lock, and the lock it
 * inherits (a workspace inherits its project's). Projects never inherit one.
 */
export interface LockState {
  own: Lock | null
  inherited: { fromName: string; lock: Lock } | null
}

export type LockTarget =
  | { level: 'project'; org: string; project: string }
  | { level: 'workspace'; org: string; project: string; workspace: string }
