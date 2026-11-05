import { del, get, keys, set, createStore, type UseStore } from 'idb-keyval'
import { onSignedOutElsewhere } from '../auth-signal'
import type { Draft, Drafts } from './drafts'

/** Stored drafts older than this are dropped on read, so a shared browser does not hoard them. */
export const DRAFT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

const KEY_PREFIX = 'ide-drafts:'

/** The slice of a key-value store the persistence needs; IndexedDB in the app, a Map in tests. */
export interface DraftStorage {
  get: (key: string) => Promise<StoredDrafts | undefined>
  set: (key: string, value: StoredDrafts) => Promise<void>
  del: (key: string) => Promise<void>
  keys: () => Promise<string[]>
}

export interface StoredDrafts {
  savedAt: number
  files: Record<string, Draft>
}

/** Keyed by user as well as workflow, so a second account on the same browser never sees them. */
export function draftKey(userId: string, workflowId: string): string {
  return `${KEY_PREFIX}${userId}:${workflowId}`
}

export function createIndexedDbDraftStorage(): DraftStorage {
  let db: UseStore | null = null
  const store = () => (db ??= createStore('awaitstep-ide', 'drafts'))
  return {
    get: (key) => get<StoredDrafts>(key, store()),
    set: (key, value) => set(key, value, store()),
    del: (key) => del(key, store()),
    keys: async () => (await keys(store())).map(String),
  }
}

/**
 * Drops every expired entry, not just the one being read: drafts for
 * workflows never reopened, or left by an account whose session simply ran
 * out, would otherwise stay on a shared computer indefinitely.
 */
export async function sweepExpiredDrafts(storage: DraftStorage, now: number): Promise<void> {
  const all = (await storage.keys()).filter((key) => key.startsWith(KEY_PREFIX))
  await Promise.all(
    all.map(async (key) => {
      const stored = await storage.get(key)
      if (stored && now - stored.savedAt > DRAFT_RETENTION_MS) await storage.del(key)
    }),
  )
}

/** The stored drafts for a workflow, or null when none exist or they have expired. */
export async function loadDrafts(
  storage: DraftStorage,
  userId: string,
  workflowId: string,
  now: number,
): Promise<Drafts | null> {
  await sweepExpiredDrafts(storage, now)
  const key = draftKey(userId, workflowId)
  const stored = await storage.get(key)
  if (!stored) return null
  if (now - stored.savedAt > DRAFT_RETENTION_MS) {
    await storage.del(key)
    return null
  }
  return Object.keys(stored.files).length > 0 ? stored.files : null
}

let writesSuspended = false

/**
 * Stops every later draft write in this page. Sign-out calls it first: a
 * debounced write or the `pagehide` flush would otherwise put back what the
 * sign-out just cleared.
 */
export function suspendDraftWrites(): void {
  writesSuspended = true
}

// Another tab signed out: this one's debounced writes and `pagehide` flush
// must not put drafts back (IndexedDB has no cross-tab event of its own).
onSignedOutElsewhere(suspendDraftWrites)

/** Writes the current drafts, or removes the entry once none remain. */
export async function saveDrafts(
  storage: DraftStorage,
  userId: string,
  workflowId: string,
  drafts: Drafts,
  now: number,
): Promise<void> {
  if (writesSuspended) return
  const key = draftKey(userId, workflowId)
  if (Object.keys(drafts).length === 0) {
    await storage.del(key)
    return
  }
  await storage.set(key, { savedAt: now, files: { ...drafts } })
}

/** Sign-out: nothing of this browser's edits may outlive the session that made them. */
export async function clearAllDrafts(storage: DraftStorage): Promise<void> {
  const all = await storage.keys()
  await Promise.all(all.filter((key) => key.startsWith(KEY_PREFIX)).map((key) => storage.del(key)))
}

export interface RestoredDrafts {
  /** Stored drafts that still differ from the file as loaded now (kept copies of deleted files included). */
  drafts: Drafts
  /** Restored files whose server copy changed since the edit began. */
  changedOnServer: string[]
  /**
   * The subset of `drafts` whose file no longer exists on the server. They
   * come back as kept copies, like a file deleted while the editor was open:
   * the banner offers Save to recreate and Discard, and a plain save is
   * refused, so nothing is re-created by accident and nothing is lost.
   */
  deleted: string[]
}

/**
 * Decides what a reload brings back. A draft equal to the loaded file is
 * dropped (it was saved some other way). A draft whose `baseHash` no longer
 * matches is kept and reported: saving it goes through the 409 conflict
 * path, so it is never a silent overwrite. A draft of a file that has since
 * been deleted is kept too; only one with no base hash (a file that was
 * never stored and is not in the project now) has nothing to attach to.
 */
export function mergeRestoredDrafts(
  stored: Drafts,
  baseline: ReadonlyMap<string, { source: string; hash?: string | undefined }>,
): RestoredDrafts {
  const drafts: Record<string, Draft> = {}
  const changedOnServer: string[] = []
  const deleted: string[] = []
  for (const [path, draft] of Object.entries(stored)) {
    const file = baseline.get(path)
    if (!file) {
      if (draft.baseHash === null) continue
      drafts[path] = draft
      deleted.push(path)
      continue
    }
    if (file.source === draft.source) continue
    drafts[path] = draft
    if ((file.hash ?? null) !== draft.baseHash) changedOnServer.push(path)
  }
  return { drafts, changedOnServer, deleted }
}

/** The app's storage: IndexedDB, opened on first use so importing this costs nothing. */
export const browserDraftStorage: DraftStorage = createIndexedDbDraftStorage()
