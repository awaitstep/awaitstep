import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ApiLibraryTreeItem, LibraryKind } from '../../lib/library-api'
import type { LibraryIdeIndex } from '../../lib/library/ide-index'
import { libraryRoots } from '../../lib/library/explorer-tree'
import { useIdeStore } from '../../stores/ide-store'
import { ExplorerHeader } from './explorer/explorer-header'
import type { ItemAction } from './explorer/explorer-menus'
import type { TreeContext } from './explorer/explorer-node'
import { ExplorerRoot } from './explorer/explorer-root'
import { useExplorerState, type ExplorerWrites } from './explorer/use-explorer-state'

export type { ItemAction } from './explorer/explorer-menus'

interface LibraryExplorerProps extends ExplorerWrites {
  index: LibraryIdeIndex
  placeName: string
  dirty: ReadonlySet<string>
  activeItemId: string | null
  canEdit: boolean
  canCreate: boolean
  /** Open the new-item row under that root at first (the Library page's New buttons). */
  initialNew?: LibraryKind
  onSelectItem: (id: string) => void
  onItemAction: (action: ItemAction, item: ApiLibraryTreeItem) => void
  onDeleteFile: (path: string) => void
}

/**
 * The Library IDE's Files tree (28d/28f): `/modules` and `/nodes`, each
 * item a folder. Add lives on the header and on each root; new items, new
 * files and renames are named in the tree itself.
 */
export function LibraryExplorer(props: LibraryExplorerProps) {
  const { index, placeName, dirty, activeItemId, canEdit, canCreate } = props
  const roots = useMemo(() => libraryRoots(index), [index])
  const { activePath, openFile } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, openFile: s.openFile })),
  )
  const state = useExplorerState(index, props, props.initialNew)
  const ctx: TreeContext = {
    index,
    canEdit,
    state,
    dirty,
    activePath,
    openFile,
    onItemAction: props.onItemAction,
    onDeleteFile: props.onDeleteFile,
  }

  return (
    <nav aria-label="Files" className="flex h-full min-h-0 flex-col bg-card">
      <ExplorerHeader placeName={placeName} canCreate={canCreate} onNewItem={state.beginNewItem} />
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {roots.map((root) => (
          <ExplorerRoot
            key={root.path}
            root={root}
            ctx={ctx}
            canCreate={canCreate}
            activeItemId={activeItemId}
            onSelectItem={props.onSelectItem}
          />
        ))}
      </div>
    </nav>
  )
}
