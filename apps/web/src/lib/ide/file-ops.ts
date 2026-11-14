import type { SourceFile } from '../api-client'
import type { Draft } from './drafts'

/**
 * A project-file change Code holds until Save: a new file, a rename, or a
 * delete. Kept normalized, one entry per file: renaming a new file moves the
 * new file, renaming a renamed one changes where it goes, and deleting either
 * folds into the entry it came from. A path a rename or delete has freed is
 * not reused before Save. The server judges a new path against the files it
 * holds (a name that compiles over another, the file cap), so Save writes the
 * deletes first, then the new and renamed files.
 */
export type PendingFileOp =
  | {
      kind: 'create'
      id: string
      path: string
      /** What the file starts with (a handler's scaffold, or empty); typed text is a draft on top. */
      source: string
    }
  | {
      kind: 'move'
      id: string
      /** The stored file's path. */
      from: string
      to: string
      /** The text as the person read it: what the new path shows and is written with (a draft on top). */
      source: string
      /** The version the person read: the delete of `from` is conditional on it. */
      hash: string | null
    }
  | {
      kind: 'delete'
      id: string
      /** The stored file's path. */
      path: string
      hash: string | null
      /** The file's unsaved text, taken off screen with it and put back if the delete is discarded. */
      stashedDraft?: Draft
    }

/** The key Save gives a pending delete beside file paths (a deleted file has no tab to save from). */
export const DELETE_KEY_PREFIX = ':delete:'

export function deleteKey(path: string): string {
  return `${DELETE_KEY_PREFIX}${path}`
}

/** The path a delete key names, or null for a file path. */
export function deletedPathOf(key: string): string | null {
  return key.startsWith(DELETE_KEY_PREFIX) ? key.slice(DELETE_KEY_PREFIX.length) : null
}

/** How Unsaved changes lists it. */
export function fileOpLabel(op: PendingFileOp): string {
  switch (op.kind) {
    case 'create':
      return `Created ${op.path}`
    case 'move':
      return `Renamed ${op.from} → ${op.to}`
    case 'delete':
      return `Deleted ${op.path}`
  }
}

/**
 * The loaded files as Code shows them with the pending changes: a deleted
 * file is gone, a renamed one sits at its new path (with the hash it was
 * read at), a new one has no hash yet. Returns the same map when nothing is
 * pending.
 */
export function applyFileOps(
  files: ReadonlyMap<string, SourceFile>,
  ops: readonly PendingFileOp[],
): ReadonlyMap<string, SourceFile> {
  if (ops.length === 0) return files
  const next = new Map(files)
  for (const op of ops) {
    if (op.kind === 'delete') next.delete(op.path)
    else if (op.kind === 'move') {
      // The text as it was read, whatever a refetch has brought in at the old
      // path since: a teammate's later edit there is theirs, not this rename's.
      const file = files.get(op.from)
      next.delete(op.from)
      next.set(op.to, {
        path: op.to,
        source: op.source,
        role: file?.role ?? 'module',
        ...(op.hash !== null && { hash: op.hash }),
      })
    }
  }
  for (const op of ops) {
    if (op.kind === 'create')
      next.set(op.path, { path: op.path, source: op.source, role: 'module' })
  }
  return next
}

/** Paths a pending rename or delete has freed: not reused until Save. */
export function vacatedPaths(ops: readonly PendingFileOp[]): Set<string> {
  const paths = new Set<string>()
  for (const op of ops) {
    if (op.kind === 'move') paths.add(op.from)
    else if (op.kind === 'delete') paths.add(op.path)
  }
  return paths
}

/** Files that exist only through a pending change (new or renamed): unsaved, with nothing saved at that path. */
export function newFilePaths(ops: readonly PendingFileOp[]): string[] {
  return ops.flatMap((op) => (op.kind === 'create' ? [op.path] : op.kind === 'move' ? [op.to] : []))
}

/** The pending change whose file is at `path` on screen (a new or renamed file). */
export function opAtPath(
  ops: readonly PendingFileOp[],
  path: string,
): Extract<PendingFileOp, { kind: 'create' | 'move' }> | undefined {
  for (const op of ops) {
    if (op.kind === 'create' && op.path === path) return op
    if (op.kind === 'move' && op.to === path) return op
  }
  return undefined
}

/** What Save writes for them, one key each: the new and renamed files' paths, and a key per delete. */
export function fileOpSaveKeys(ops: readonly PendingFileOp[]): string[] {
  return ops.map((op) =>
    op.kind === 'create' ? op.path : op.kind === 'move' ? op.to : deleteKey(op.path),
  )
}

let counter = 0

/** An id for a pending file change, unique for the page's life. */
export function newFileOpId(): string {
  counter += 1
  return `file-${counter}`
}
