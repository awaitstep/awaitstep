import { compareFileManifest } from '@awaitstep/ir'
import type { TestSession } from '../api-client'

/** How far a running test session is behind what the editor shows. */
export interface SessionStaleness {
  /** The editor shows a different version than the session was built from. */
  version: boolean
  /** Project files saved, deleted or added since the session started. */
  saved: number
  deleted: number
  added: number
  /** Dirty files: edited but not saved, so never in the session. */
  unsaved: number
  /**
   * Identifies the saved changes (not the unsaved ones). "Trigger anyway"
   * is remembered against it, so the next save asks again.
   */
  signature: string
}

export const UP_TO_DATE: SessionStaleness = {
  version: false,
  saved: 0,
  deleted: 0,
  added: 0,
  unsaved: 0,
  signature: '',
}

/**
 * Compares a session with the editor. `currentHashes` is `{ path: hash }` of
 * the stored project files now; the manifest comparison is the same one the
 * server's types describe, so deletes count and a reload keeps the answer.
 */
export function sessionStaleness(input: {
  session: TestSession | null
  versionId: string | null
  /** Null when the editor shows an older version, whose file hashes are not the live project's. */
  currentHashes: Readonly<Record<string, string>> | null
  unsavedCount: number
}): SessionStaleness {
  const { session, versionId, currentHashes, unsavedCount } = input
  // Only a running session can be behind; the unsaved count still matters
  // with none, because starting one is when unsaved files are left out.
  if (!session || session.status !== 'running') return { ...UP_TO_DATE, unsaved: unsavedCount }
  const hashes = currentHashes ?? {}
  const changes = currentHashes
    ? compareFileManifest(session.files, { ...currentHashes })
    : { saved: [], deleted: [], added: [] }
  const version = Boolean(versionId && session.versionId !== versionId)
  const signature = [
    ...(version ? [`v:${versionId}`] : []),
    ...changes.saved.map((path) => `s:${path}:${hashes[path]}`),
    ...changes.added.map((path) => `a:${path}:${hashes[path]}`),
    ...changes.deleted.map((path) => `d:${path}`),
  ]
    .sort()
    .join('|')
  return {
    version,
    saved: changes.saved.length,
    deleted: changes.deleted.length,
    added: changes.added.length,
    unsaved: unsavedCount,
    signature,
  }
}

/** Files saved, deleted or added since the session started. */
export function savedChangeCount(staleness: SessionStaleness): number {
  return staleness.saved + staleness.deleted + staleness.added
}

/** The session is not running what is saved (or shown): triggering tests old code. */
export function isBehind(staleness: SessionStaleness): boolean {
  return staleness.version || savedChangeCount(staleness) > 0
}

function plural(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

/** "1 file saved and 1 deleted since this session started at 14:02." — or null when nothing was. */
export function describeSavedChanges(
  staleness: SessionStaleness,
  startedAt: string,
): string | null {
  const parts: string[] = []
  if (staleness.saved > 0) parts.push(`${plural(staleness.saved)} saved`)
  if (staleness.added > 0)
    parts.push(`${parts.length ? staleness.added : plural(staleness.added)} added`)
  if (staleness.deleted > 0) {
    parts.push(`${parts.length ? staleness.deleted : plural(staleness.deleted)} deleted`)
  }
  if (parts.length === 0) return null
  const time = new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${parts.join(' and ')} since this session started at ${time}.`
}

/** "2 unsaved files aren’t in this session." — or null when nothing is unsaved. */
export function describeUnsaved(staleness: SessionStaleness): string | null {
  if (staleness.unsaved === 0) return null
  return staleness.unsaved === 1
    ? '1 unsaved file isn’t in this session.'
    : `${staleness.unsaved} unsaved files aren’t in this session.`
}

/** Why triggering a session that is behind would test old code. */
export function askDescription(
  savedLine: string | null,
  savedCount: number,
  version: boolean,
  unsaved: number,
): string {
  const why = savedCount > 0 && savedLine ? savedLine : version ? 'A newer version was saved.' : ''
  const files = unsaved === 1 ? '1 unsaved file' : `${unsaved} unsaved files`
  const save = unsaved > 0 ? ` Restarting saves ${files} first.` : ''
  return `${why} Triggering now tests the old code.${save}`.trim()
}
