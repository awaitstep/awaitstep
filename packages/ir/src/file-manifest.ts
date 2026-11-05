/** Most files a session manifest records. */
export const MAX_FILE_MANIFEST_ENTRIES = 100

/** `{ [path]: content hash }` — the project files a session was built from. */
export type FileManifest = Record<string, string>

export interface FileManifestChanges {
  /** In both, with a different hash. */
  saved: string[]
  /** In the session's manifest, gone now. */
  deleted: string[]
  /** Present now, not in the session's manifest. */
  added: string[]
}

/** Builds a manifest from rows with a path and hash, capped at the limit. */
export function buildFileManifest(
  files: readonly { path: string; hash: string }[],
  limit: number = MAX_FILE_MANIFEST_ENTRIES,
): FileManifest {
  const manifest: FileManifest = Object.create(null)
  for (const file of files.slice(0, limit)) manifest[file.path] = file.hash
  return manifest
}

/**
 * What changed in the project since a session was built. A session without a
 * manifest (started before they were stored) cannot say, so it reports no
 * changes rather than guessing.
 */
export function compareFileManifest(
  sessionFiles: FileManifest | null | undefined,
  currentFiles: FileManifest,
): FileManifestChanges {
  const changes: FileManifestChanges = { saved: [], deleted: [], added: [] }
  if (!sessionFiles) return changes
  for (const [path, hash] of Object.entries(sessionFiles)) {
    const current = Object.hasOwn(currentFiles, path) ? currentFiles[path] : undefined
    if (current === undefined) changes.deleted.push(path)
    else if (current !== hash) changes.saved.push(path)
  }
  for (const path of Object.keys(currentFiles)) {
    if (!Object.hasOwn(sessionFiles, path)) changes.added.push(path)
  }
  return changes
}
