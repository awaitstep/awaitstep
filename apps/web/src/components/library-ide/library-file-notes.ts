import { LIBRARY_NODE_CTX_MODULE } from '@awaitstep/ir'
import { ROOT_DIR, nodeFolderOf } from '../../lib/library/ide-index'

/** The note on a node folder's generated ctx.d.ts, or null for any other file. */
export function ctxFileNote(path: string): string | null {
  const folder = nodeFolderOf(path)
  if (!folder || path !== `${folder}/${LIBRARY_NODE_CTX_MODULE}.d.ts`) return null
  return 'Drawn from node.json. Edit node.json to change these types.'
}

/** Why a file is read-only, worded for the person. */
export function readOnlyNote(path: string, viewerReason: string | null): string {
  if (viewerReason) return viewerReason
  if (nodeFolderOf(path)) {
    return 'This version is published and can’t change. Start a new version from it.'
  }
  if (path.startsWith(`${ROOT_DIR.module}/`)) {
    return 'From the project’s library, as last published. Change it in the project’s Library.'
  }
  return 'Read-only.'
}
