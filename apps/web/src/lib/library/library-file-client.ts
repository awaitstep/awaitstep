import { ApiError } from '../api-client'
import type { ProjectFileClient } from '../ide/project-actions'
import { libraryApi } from '../library-api'
import type { LibraryIdeIndex } from './ide-index'
import { pathInItem } from './ide-index'

/**
 * The workspace's file actions, pointed at the Library: an IDE path names an
 * item and a file in it, and each write goes to that item's file route.
 * Everything else (preconditions, conflicts, renames, folder deletes) is
 * the shared logic in `project-actions`.
 */
export interface WrittenFile {
  itemId: string
  itemPath: string
  source: string
  hash: string
}

export function libraryFileClient(
  getIndex: () => LibraryIdeIndex,
  /** A write landed: the caller caches its text under the new hash, so the file never reloads. */
  onWritten?: (file: WrittenFile) => void,
): ProjectFileClient {
  function locate(path: string): { itemId: string; itemPath: string } {
    const index = getIndex()
    const listed = index.files.get(path)
    if (listed) return { itemId: listed.itemId, itemPath: listed.itemPath }
    // A new file: it belongs to the item whose folder it is created in.
    const item = index.itemAt(path)
    const itemPath = item ? pathInItem(item, path) : null
    if (!item || !itemPath) {
      throw new ApiError('Files live inside a module or a node. Add one first.', 422)
    }
    return { itemId: item.id, itemPath }
  }

  return {
    async putProjectFile(_root, path, source, precondition) {
      const { itemId, itemPath } = locate(path)
      const saved = await libraryApi.putFile(itemId, itemPath, source, precondition)
      onWritten?.({ itemId, itemPath, source, hash: saved.hash })
      return saved
    },
    deleteProjectFile(_root, path, ifMatch) {
      const { itemId, itemPath } = locate(path)
      return libraryApi.deleteFile(itemId, itemPath, ifMatch)
    },
    convertHandlers() {
      return Promise.reject(new ApiError('The Library has no handlers to convert', 400))
    },
  }
}
