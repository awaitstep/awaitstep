import type { GeneratedFile } from '@awaitstep/codegen'
import type { Draft, Drafts } from './drafts'

/** What the project listing says about one stored file. */
export interface ListedFile {
  path: string
  hash: string
}

/** How the server's stored files differ from the ones the editor loaded. */
export interface OutsideDiff {
  changed: string[]
  deleted: string[]
  added: string[]
}

type Hashed = { hash?: string | undefined }

/**
 * Compares the loaded files with the server's listing. Only stored files
 * carry a hash, so generated files and virtual seeds never count.
 */
export function diffAgainstListing(
  baseline: ReadonlyMap<string, Hashed>,
  listing: readonly ListedFile[],
): OutsideDiff {
  const listed = new Map(listing.map((f) => [f.path, f.hash]))
  const changed: string[] = []
  const deleted: string[] = []
  const added: string[] = []
  for (const [path, file] of baseline) {
    if (file.hash === undefined) continue
    const hash = listed.get(path)
    if (hash === undefined) deleted.push(path)
    else if (hash !== file.hash) changed.push(path)
  }
  for (const { path } of listing) {
    if (baseline.get(path)?.hash === undefined) added.push(path)
  }
  return { changed, deleted, added }
}

export function hasOutsideDiff(diff: OutsideDiff): boolean {
  return diff.changed.length + diff.deleted.length + diff.added.length > 0
}

/** A stable key for a diff and the hashes behind it, so the same discrepancy is not refetched forever. */
export function diffSignature(diff: OutsideDiff, listing: readonly ListedFile[]): string {
  const hashes = new Map(listing.map((f) => [f.path, f.hash]))
  const part = (kind: string, paths: string[]) =>
    paths
      .map((p) => `${kind}:${p}:${hashes.get(p) ?? ''}`)
      .sort()
      .join('|')
  return [part('c', diff.changed), part('d', diff.deleted), part('a', diff.added)].join('/')
}

/**
 * Drafts whose file is gone from the server. A draft that began from a
 * stored file (it has a base hash) is an edit of something that was deleted;
 * a draft with no base hash is a file that was never stored, which is not
 * "deleted" (saving it creates it).
 */
export function deletedOutsidePaths(
  baseline: ReadonlyMap<string, unknown>,
  drafts: Drafts,
): string[] {
  return Object.entries(drafts)
    .filter(([path, draft]) => !baseline.has(path) && draft.baseHash !== null)
    .map(([path]) => path)
}

/**
 * The deleted-but-edited files as editor files, so their tab, text and
 * model stay while the banner asks what to do. They are role `module`:
 * project files, which is what lets them be saved again.
 */
export function deletedOutsideFiles(
  baseline: ReadonlyMap<string, unknown>,
  drafts: Drafts,
): GeneratedFile[] {
  return deletedOutsidePaths(baseline, drafts).map((path) => ({
    path,
    source: drafts[path]!.source,
    role: 'module',
  }))
}

export type OutsideState = 'deleted' | 'changed' | null

/** What happened on the server to the file a draft was started from. */
export function outsideState(
  baseline: ReadonlyMap<string, Hashed>,
  path: string,
  draft: Draft | undefined,
): OutsideState {
  if (!draft) return null
  const file = baseline.get(path)
  if (!file) return draft.baseHash === null ? null : 'deleted'
  return (file.hash ?? null) === draft.baseHash ? null : 'changed'
}

/** Every path whose draft has moved on from the server, in draft order. */
export function outsidePaths(
  baseline: ReadonlyMap<string, Hashed>,
  drafts: Drafts,
): { changed: string[]; deleted: string[] } {
  const changed: string[] = []
  const deleted: string[] = []
  for (const [path, draft] of Object.entries(drafts)) {
    const state = outsideState(baseline, path, draft)
    if (state === 'changed') changed.push(path)
    else if (state === 'deleted') deleted.push(path)
  }
  return { changed, deleted }
}

/**
 * What a poll of the listing means for the loaded files: refetch them when
 * something differs, but only once per distinct discrepancy, so a listing
 * the source never agrees with cannot cause a refetch every 20 seconds.
 */
export function planRefresh(
  baseline: ReadonlyMap<string, Hashed>,
  listing: readonly ListedFile[],
  handled: string | null,
): { refetch: boolean; signature: string | null } {
  const diff = diffAgainstListing(baseline, listing)
  if (!hasOutsideDiff(diff)) return { refetch: false, signature: null }
  const signature = diffSignature(diff, listing)
  return { refetch: signature !== handled, signature }
}
