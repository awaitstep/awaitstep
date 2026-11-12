import { LIBRARY_NODE_CTX_MODULE, LIBRARY_NODE_MANIFEST, nodeVersionFolder } from '@awaitstep/ir'
import type { ApiLibraryTree, ApiLibraryTreeItem, LibraryKind } from '../library-api'

// The Library IDE shows every item of a place in one tree, under
// `modules/<slug>/…` and `nodes/<slug>/…` (28d/28e). A path there names the
// item and the file inside it; this maps one to the other.

export const ROOT_DIR: Record<LibraryKind, string> = { module: 'modules', node: 'nodes' }

export interface IndexedFile {
  itemId: string
  /** The path inside the item, as its file routes take it. */
  itemPath: string
  hash: string
  readOnly: boolean
}

export interface LibraryIdeIndex {
  items: readonly ApiLibraryTreeItem[]
  /** Every listed file by its IDE path. */
  files: ReadonlyMap<string, IndexedFile>
  itemById: ReadonlyMap<string, ApiLibraryTreeItem>
  /** The item a path (file or folder) sits in, or null for the roots. */
  itemAt(path: string): ApiLibraryTreeItem | null
}

export function itemRoot(item: Pick<ApiLibraryTreeItem, 'kind' | 'slug'>): string {
  return `${ROOT_DIR[item.kind]}/${item.slug}`
}

export function idePath(item: Pick<ApiLibraryTreeItem, 'kind' | 'slug'>, itemPath: string): string {
  return `${itemRoot(item)}/${itemPath}`
}

export function buildIdeIndex(tree: ApiLibraryTree | undefined): LibraryIdeIndex {
  const items = tree?.items ?? []
  const files = new Map<string, IndexedFile>()
  const itemById = new Map<string, ApiLibraryTreeItem>()
  const byRoot = new Map<string, ApiLibraryTreeItem>()
  for (const item of items) {
    itemById.set(item.id, item)
    byRoot.set(itemRoot(item), item)
    for (const file of item.files) {
      files.set(idePath(item, file.path), {
        itemId: item.id,
        itemPath: file.path,
        hash: file.hash,
        readOnly: file.readOnly,
      })
    }
  }
  return {
    items,
    files,
    itemById,
    itemAt(path) {
      const [root, slug] = path.split('/')
      if (!root || !slug) return null
      return byRoot.get(`${root}/${slug}`) ?? null
    },
  }
}

/** The path inside its item, or null when `path` is not inside `item`. */
export function pathInItem(item: Pick<ApiLibraryTreeItem, 'kind' | 'slug'>, path: string) {
  const prefix = `${itemRoot(item)}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : null
}

/** A node's working-copy version folder (its one unpublished draft), or null. */
export function draftFolderOf(item: ApiLibraryTreeItem): string | null {
  if (item.kind !== 'node') return null
  for (const file of item.files) {
    if (file.readOnly) continue
    const folder = nodeVersionFolder(file.path)
    if (folder) return folder
  }
  return null
}

/** The version folder a node file sits in, as an IDE path (`nodes/post/1.0.0`), or null. */
export function nodeFolderOf(path: string): string | null {
  const [root, slug, folder] = path.split('/')
  if (root !== ROOT_DIR.node || !slug || !folder || nodeVersionFolder(`${folder}/x`) === null) {
    return null
  }
  return `${root}/${slug}/${folder}`
}

/** The generated `ctx.d.ts` beside a folder's `node.json`. */
export function ctxPathOf(folder: string): string {
  return `${folder}/${LIBRARY_NODE_CTX_MODULE}.d.ts`
}

export function isNodeManifest(path: string): boolean {
  return nodeFolderOf(path) !== null && path.endsWith(`/${LIBRARY_NODE_MANIFEST}`)
}
