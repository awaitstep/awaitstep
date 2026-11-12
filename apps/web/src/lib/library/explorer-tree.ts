import { libraryFilePathError } from '@awaitstep/ir'
import { buildFileTree, type TreeNode } from '../ide/file-tree'
import type { ApiLibraryTreeItem, LibraryKind } from '../library-api'
import { ROOT_DIR, itemRoot, pathInItem, type LibraryIdeIndex } from './ide-index'

export interface LibraryRoot {
  kind: LibraryKind
  /** `modules` or `nodes`. */
  path: string
  /** Each item's folder, in slug order, with its files. */
  items: { item: ApiLibraryTreeItem; children: TreeNode[] }[]
}

/** The explorer's two roots (28d): `/modules` and `/nodes`, each item a folder of its files. */
export function libraryRoots(index: LibraryIdeIndex): LibraryRoot[] {
  return (['module', 'node'] as const).map((kind) => ({
    kind,
    path: ROOT_DIR[kind],
    items: index.items
      .filter((item) => item.kind === kind)
      .slice()
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((item) => ({
        item,
        children: buildFileTree(
          item.files.map((f) => ({ path: f.path, role: 'module' as const })),
        ).map((node) => prefixed(node, itemRoot(item))),
      })),
  }))
}

function prefixed(node: TreeNode, prefix: string): TreeNode {
  if (node.kind === 'file') return { ...node, path: `${prefix}/${node.path}` }
  return {
    ...node,
    path: `${prefix}/${node.path}`,
    children: node.children.map((child) => prefixed(child, prefix)),
  }
}

/** Why `name` can't be a new file in `folder` (an IDE path inside an item), or null. */
export function newFileError(index: LibraryIdeIndex, folder: string, name: string): string | null {
  const item = index.itemAt(folder)
  if (!item) return 'Pick a module or a node to add the file to'
  const path = `${folder}/${name}`.replace(/\/+/g, '/')
  const inside = pathInItem(item, path)
  if (!inside) return 'Pick a module or a node to add the file to'
  if (index.files.has(path)) return 'A file with that name is already here'
  const error = libraryFilePathError(item.kind, inside)
  return error ? `"${inside}" ${error}` : null
}
