import {
  LIBRARY_MODULE_IMPORT_PREFIX,
  MAX_LIBRARY_IMPORTS,
  MAX_PROJECT_FILES,
  MAX_PROJECT_TOTAL_BYTES,
  PACKAGE_MANIFEST_PATH,
  libraryBundlePath,
} from '@awaitstep/ir'
import type { LibraryBundleItem } from '@awaitstep/db'

// How a bundle's Library items are judged and laid out, shared by a deploy's
// fold and the editor's look-ahead so both word every problem the same way.

/** A module folded into the bundle, as the workflow IDE labels its files. */
export interface BundledLibraryModule {
  itemId: string
  slug: string
  /** The workflow's workspace owns it, or the project does. */
  owner: 'workspace' | 'project'
  version: string
}

/** The most items one bundle may reach. */
export const MAX_LIBRARY_BUNDLE_ITEMS = MAX_LIBRARY_IMPORTS
/** The most library code one bundle may carry: twice a project's own total, and four times its files. */
export const MAX_LIBRARY_BUNDLE_BYTES = 2 * MAX_PROJECT_TOTAL_BYTES
export const MAX_LIBRARY_BUNDLE_FILES = 4 * MAX_PROJECT_FILES

export const BUNDLE_LIMITS = {
  items: MAX_LIBRARY_BUNDLE_ITEMS,
  bytes: MAX_LIBRARY_BUNDLE_BYTES,
  files: MAX_LIBRARY_BUNDLE_FILES,
}

export function label(item: Pick<LibraryBundleItem, 'kind' | 'slug' | 'name' | 'version'>): string {
  const name = item.kind === 'module' ? item.slug : item.name
  return item.version ? `${name} ${item.version}` : name
}

// Over a limit nothing else said about the items would be true: which ones
// were cut is arbitrary, and over a size limit the database sent no bodies.
export function limitMessage(bundle: { truncated: boolean; oversize: boolean }): string | null {
  if (bundle.truncated) {
    return `This workflow reaches more than ${MAX_LIBRARY_BUNDLE_ITEMS} library items`
  }
  if (bundle.oversize) {
    return `The library code this workflow reaches is over ${MAX_LIBRARY_BUNDLE_FILES} files or ${MAX_LIBRARY_BUNDLE_BYTES} bytes`
  }
  return null
}

// What each importer's `#modules/<slug>` reached; an import with no match did not resolve.
export function importMessages(
  items: readonly LibraryBundleItem[],
  rootSlugs: readonly string[],
): string[] {
  const reached = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'module') continue
    for (const importer of item.importers) reached.add(`${importer ?? ''}\u0000${item.slug}`)
  }
  const messages: string[] = []
  for (const slug of rootSlugs) {
    if (!reached.has(`\u0000${slug}`)) {
      messages.push(
        `Cannot resolve "${LIBRARY_MODULE_IMPORT_PREFIX}${slug}": no module of that name in this workspace or the project`,
      )
    }
  }
  for (const item of items) {
    for (const slug of item.imports) {
      if (item.kind === 'module' && slug === item.slug) continue
      if (!reached.has(`${item.id}\u0000${slug}`)) {
        messages.push(
          `${label(item)} imports "${LIBRARY_MODULE_IMPORT_PREFIX}${slug}", which no module it can reach provides`,
        )
      }
    }
  }
  return messages
}

// One bundle has one `modules/<slug>`: two modules answering one slug cannot both ship.
export function slugConflicts(items: readonly LibraryBundleItem[]): {
  conflicted: Set<string>
  messages: string[]
} {
  const byId = new Map(items.map((item) => [item.id, item]))
  const bySlug = new Map<string, LibraryBundleItem[]>()
  for (const item of items) {
    if (item.kind !== 'module') continue
    bySlug.set(item.slug, [...(bySlug.get(item.slug) ?? []), item])
  }
  const conflicted = new Set<string>()
  const messages: string[] = []
  for (const [slug, modules] of bySlug) {
    if (modules.length < 2) continue
    conflicted.add(slug)
    const meanings = modules
      .map((module) => {
        const owner =
          module.workspaceId === null ? 'the project’s module' : 'this workspace’s module'
        const who = module.importers.map((importer) =>
          importer === null ? 'this workflow' : (byId.get(importer)?.name ?? 'a library item'),
        )
        return `${owner} for ${who.join(' and ')}`
      })
      .sort()
    messages.push(
      `"${LIBRARY_MODULE_IMPORT_PREFIX}${slug}" means ${meanings.join(', but ')}; rename one of them`,
    )
  }
  return { conflicted, messages }
}

export function unpublishedMessage(item: LibraryBundleItem): string {
  const what = item.kind === 'module' ? `Module "${item.slug}"` : `Custom node "${item.name}"`
  return `${what} has no published version yet; publish it to use it`
}

// A module's files as the bundle carries them: a nested package.json would
// change how `#` imports resolve inside the folder, so it stays out.
export function moduleBundleFiles(item: LibraryBundleItem): { path: string; source: string }[] {
  return item.files
    .filter((file) => file.path !== PACKAGE_MANIFEST_PATH)
    .map((file) => ({ path: libraryBundlePath(item.slug, file.path), source: file.source }))
}

export function bundledModule(item: LibraryBundleItem): BundledLibraryModule {
  return {
    itemId: item.id,
    slug: item.slug,
    owner: item.workspaceId === null ? 'project' : 'workspace',
    version: item.version!,
  }
}

export function bySlug(a: { slug: string }, b: { slug: string }): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
}
