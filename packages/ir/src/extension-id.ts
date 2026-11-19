// The id an app extension is known by: the API mounts it at `/api/ext/<id>`,
// lists it in `GET /api/instance` → `features`, and the dashboard shows the
// web extension of the same id. One definition for all three.

/** Lowercase letters, digits and inner dashes, at most 64 characters: `agent-chat`, `x1`. */
export const EXTENSION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** Whether `id` can name an extension (a single URL segment). */
export function isExtensionId(id: unknown): id is string {
  return typeof id === 'string' && EXTENSION_ID_PATTERN.test(id)
}

/**
 * Whether a path lies under a `node_modules` folder: a copy fetched from a
 * registry rather than one linked from a workspace's source. Segments compare
 * case-insensitively, as macOS and Windows folders do.
 */
export function isInstalledCopy(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.toLowerCase() === 'node_modules')
}

/**
 * Whether an extensions package may be loaded: its folder (real path,
 * symlinks followed) is linked from source rather than installed, and the
 * entry it resolves to lies inside that folder, outside any `node_modules`. An installed package's
 * legacy `main` can point outside its own folder; judging the entry alone
 * would let it through. The API and the dashboard load an extensions package
 * only when this holds, so a look-alike from a registry never runs.
 */
export function isLinkedPackageEntry(packageDir: string, entry: string): boolean {
  if (isInstalledCopy(packageDir) || isInstalledCopy(entry)) return false
  const dir = packageDir.replace(/[\\/]+$/, '')
  return entry.startsWith(`${dir}/`) || entry.startsWith(`${dir}\\`)
}
