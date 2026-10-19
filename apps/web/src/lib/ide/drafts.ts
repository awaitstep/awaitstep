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
