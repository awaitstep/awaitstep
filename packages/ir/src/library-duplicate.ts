import {
  FIRST_LIBRARY_VERSION,
  compareLibraryVersions,
  LIBRARY_NODE_ICON_PATH,
  LIBRARY_NODE_MANIFEST,
  nodeVersionFolder,
  type LibraryItemKind,
} from './library.js'
import { MAX_PROJECT_FILE_BYTES, PACKAGE_MANIFEST_PATH, projectFileBytes } from './project-files.js'

export interface LibrarySourceSnapshot {
  /** The working copy, with sources. */
  files: readonly { path: string; source: string }[]
  /** The latest published version's files, relative to the version, or null. */
  latest: { version: string; files: readonly { path: string; source: string }[] } | null
}

/**
 * A JSON manifest with some top-level fields set, written the way it was:
 * indented two spaces if it spanned lines, compact if it did not. Never
 * re-indenting a compact file matters: indenting deeply nested arrays
 * grows the text quadratically, so a small file could come out megabytes
 * long. Null when it is not a JSON object, or would exceed the file cap.
 */
export function withManifestFields(source: string, fields: Record<string, string>): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const merged = { ...(parsed as Record<string, unknown>), ...fields }
  const text = source.trimEnd().includes('\n')
    ? `${JSON.stringify(merged, null, 2)}\n`
    : `${JSON.stringify(merged)}\n`
  return projectFileBytes(text) > MAX_PROJECT_FILE_BYTES ? null : text
}

/** As `withManifestFields`, copying the file as written when it can't be rewritten: publish reports it. */
function withFields(source: string, fields: Record<string, string>): string {
  return withManifestFields(source, fields) ?? source
}

/**
 * The files a duplicate starts with, as a new item at the first version.
 *
 * - A module copies its working copy; `package.json` takes the new slug as
 *   its name and starts again at 1.0.0.
 * - A custom node copies its newest code (the open draft folder, else the
 *   latest published version) into `1.0.0/`, with `node.json` naming the new
 *   slug and name at 1.0.0, plus the icon.
 */
export function libraryDuplicateFiles(
  kind: LibraryItemKind,
  snapshot: LibrarySourceSnapshot,
  target: { slug: string; name: string },
): { path: string; source: string }[] {
  if (kind === 'module') {
    return snapshot.files.map((file) =>
      file.path === PACKAGE_MANIFEST_PATH
        ? {
            path: file.path,
            source: withFields(file.source, {
              name: target.slug,
              version: FIRST_LIBRARY_VERSION,
            }),
          }
        : { path: file.path, source: file.source },
    )
  }

  const icon = snapshot.files.find((file) => file.path === LIBRARY_NODE_ICON_PATH)
  // At most one draft folder exists; the newest wins if an old one lingers.
  const draft = snapshot.files
    .map((file) => nodeVersionFolder(file.path))
    .filter((folder): folder is string => folder !== null)
    .sort(compareLibraryVersions)
    .at(-1)
  const newest = draft
    ? snapshot.files
        .filter((file) => file.path.startsWith(`${draft}/`))
        .map((file) => ({ path: file.path.slice(draft.length + 1), source: file.source }))
    : (snapshot.latest?.files.filter((file) => file.path !== LIBRARY_NODE_ICON_PATH) ?? [])

  const copied = newest.map((file) => ({
    path: `${FIRST_LIBRARY_VERSION}/${file.path}`,
    source:
      file.path === LIBRARY_NODE_MANIFEST
        ? withFields(file.source, {
            id: target.slug,
            name: target.name,
            version: FIRST_LIBRARY_VERSION,
          })
        : file.source,
  }))
  return icon ? [{ path: icon.path, source: icon.source }, ...copied] : copied
}
