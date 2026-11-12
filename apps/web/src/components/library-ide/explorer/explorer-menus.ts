import type { ApiLibraryTreeItem } from '../../../lib/library-api'
import { draftFolderOf, itemRoot, type LibraryIdeIndex } from '../../../lib/library/ide-index'
import type { RowMenuItem } from './explorer-line'
import type { ExplorerState } from './use-explorer-state'

export type ItemAction = 'rename' | 'duplicate' | 'history' | 'new-version' | 'delete'

export interface MenuContext {
  index: LibraryIdeIndex
  canEdit: boolean
  state: ExplorerState
  onItemAction: (action: ItemAction, item: ApiLibraryTreeItem) => void
  onDeleteFile: (path: string) => void
}

/** An item's `⋯` (28f): history for anyone; new version, new file, rename, duplicate, delete to edit. */
export function itemMenu(item: ApiLibraryTreeItem, ctx: MenuContext): RowMenuItem[] {
  const menu: RowMenuItem[] = [
    { label: 'Version history', onSelect: () => ctx.onItemAction('history', item) },
  ]
  if (!ctx.canEdit) return menu
  if (item.kind === 'node' && item.latestVersion !== null && draftFolderOf(item) === null) {
    menu.unshift({ label: 'New version', onSelect: () => ctx.onItemAction('new-version', item) })
  }
  menu.push(
    // At the item's root: any file for a module, the icon for a node.
    { label: 'New file', onSelect: () => ctx.state.beginCreate(itemRoot(item)) },
    { label: 'Rename', onSelect: () => ctx.onItemAction('rename', item) },
    { label: 'Duplicate', onSelect: () => ctx.onItemAction('duplicate', item) },
    { label: 'Delete', onSelect: () => ctx.onItemAction('delete', item), danger: true },
  )
  return menu
}

/** A folder inside an item: a new file there, unless it is a published folder. */
export function folderMenu(path: string, readOnly: boolean, ctx: MenuContext): RowMenuItem[] {
  if (!ctx.canEdit || readOnly) return []
  return [{ label: 'New file', onSelect: () => ctx.state.beginCreate(path) }]
}

/** A working-copy file: rename or delete it. Published files have no menu. */
export function fileMenu(path: string, ctx: MenuContext): RowMenuItem[] {
  const listed = ctx.index.files.get(path)
  if (!ctx.canEdit || !listed || listed.readOnly) return []
  return [
    { label: 'Rename', onSelect: () => ctx.state.beginRename(path) },
    { label: 'Delete', onSelect: () => ctx.onDeleteFile(path), danger: true },
  ]
}
