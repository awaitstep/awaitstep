import {
  LIBRARY_MODULE_IMPORT_PREFIX,
  customNodeType,
  libraryItemCapabilities,
  type WorkspaceRole,
} from '@awaitstep/ir'
import type {
  DatabaseAdapter,
  LibraryConsumerPlace,
  LibraryFileSummary,
  LibraryItem,
  LibraryOwner,
} from '@awaitstep/db'
import { codeImports } from './library-check.js'

/** What a library item route answers with: the item as the caller may use it. */
export function libraryItemRecord(
  item: LibraryItem,
  owner: LibraryOwner,
  latestVersion: string | null,
  role: WorkspaceRole | null,
) {
  return {
    id: item.id,
    kind: item.kind,
    slug: item.slug,
    name: item.name,
    description: item.description,
    owner,
    latestVersion,
    // How code reaches it: a module by import, a node by its IR type.
    importPath: item.kind === 'module' ? `${LIBRARY_MODULE_IMPORT_PREFIX}${item.slug}` : null,
    nodeType: item.kind === 'node' ? customNodeType(item.id) : null,
    viewerCan: libraryItemCapabilities(role),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function libraryFileRecord(file: Omit<LibraryFileSummary, 'id' | 'itemId' | 'createdAt'>) {
  return { path: file.path, hash: file.hash, size: file.size, updatedAt: file.updatedAt }
}

export function usagePlace(item: LibraryItem): LibraryConsumerPlace {
  return { itemId: item.id, projectId: item.projectId, workspaceId: item.workspaceId }
}

/**
 * Rewrites the item's usage rows from what its working copy and every kept
 * version import: called after a write that may have changed an import.
 */
export async function refreshLibraryUsages(db: DatabaseAdapter, item: LibraryItem): Promise<void> {
  const [files, versions] = await Promise.all([
    db.listLibraryFiles(item.id),
    db.listLibraryVersionImports(item.id),
  ])
  const slugs = new Set([...codeImports(files, item), ...versions.flatMap((v) => v.imports)])
  await db.rewriteLibraryUsages(usagePlace(item), [...slugs].sort())
}
