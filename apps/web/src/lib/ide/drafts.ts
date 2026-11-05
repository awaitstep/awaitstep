import type { GeneratedFile } from '@awaitstep/codegen'

/**
 * Unsaved editor text for one file, plus the server hash of the text it was
 * edited from — the precondition a save sends, so a file an agent changed
 * meanwhile is a conflict rather than a silent overwrite. Null for a file
 * that was not stored yet (a virtual seed): saving it must create.
 */
export interface Draft {
  source: string
  baseHash: string | null
}

export type Drafts = Readonly<Record<string, Draft>>

/**
 * The files as the editor should show them: the loaded baseline with every
 * draft laid over it. Returns the same map instance when no draft applies,
 * and keeps every untouched file's object, so downstream memos and the
 * model sync only see the files that changed.
 */
export function overlayDrafts<F extends GeneratedFile>(
  files: ReadonlyMap<string, F>,
  drafts: Drafts,
): ReadonlyMap<string, F> {
  const paths = Object.keys(drafts)
  if (paths.length === 0) return files
  let merged: Map<string, F> | null = null
  for (const path of paths) {
    const base = files.get(path)
    if (!base || base.source === drafts[path]!.source) continue
    merged ??= new Map(files)
    merged.set(path, { ...base, source: drafts[path]!.source })
  }
  return merged ?? files
}

/** Paths whose draft differs from the baseline (a vanished baseline counts as dirty). */
export function dirtyPaths(files: ReadonlyMap<string, GeneratedFile>, drafts: Drafts): string[] {
  return Object.keys(drafts).filter((path) => files.get(path)?.source !== drafts[path]!.source)
}

/** Drafts that still differ from the baseline; the rest were saved or reverted. */
export function liveDrafts(files: ReadonlyMap<string, GeneratedFile>, drafts: Drafts): Drafts {
  const dirty = dirtyPaths(files, drafts)
  if (dirty.length === Object.keys(drafts).length) return drafts
  return Object.fromEntries(dirty.map((path) => [path, drafts[path]!]))
}

export interface SnapshotRestore {
  /** The drafts to lay back: the current ones plus every snapshot draft that is still safe. */
  drafts: Drafts
  restored: string[]
  /** Not brought back: the file changed on the server, vanished, or was edited again since. */
  skipped: string[]
}

/**
 * Puts a discarded set of drafts back (Undo). A draft only returns if the
 * file still has the hash it was edited from: reviving an edit against a
 * file that moved on would be a silent overwrite waiting for the next
 * Save all. A file edited again since the discard keeps its newer text.
 */
export function restoreSnapshot(
  snapshot: Drafts,
  current: Drafts,
  baseline: ReadonlyMap<string, { hash?: string | undefined }>,
): SnapshotRestore {
  const restored: string[] = []
  const skipped: string[] = []
  let drafts: Record<string, Draft> = { ...current }
  for (const [path, draft] of Object.entries(snapshot)) {
    const file = baseline.get(path)
    const unchanged = file !== undefined && (file.hash ?? null) === draft.baseHash
    if (!unchanged || path in current) {
      skipped.push(path)
      continue
    }
    drafts = { ...drafts, [path]: draft }
    restored.push(path)
  }
  return { drafts, restored, skipped }
}
