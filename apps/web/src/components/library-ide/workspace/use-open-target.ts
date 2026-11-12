import { useCallback, useEffect, useState } from 'react'
import type { ApiLibraryTreeItem } from '../../../lib/library-api'
import { draftFolderOf, idePath } from '../../../lib/library/ide-index'
import { newestNodeFolder } from '../../../lib/library/manifest-summary'
import type { LibraryWorkspace } from '../../../hooks/use-library-workspace'
import { useIdeStore } from '../../../stores/ide-store'

/** The file an item opens on: a module's index.ts, a node's newest node.json. */
export function firstFileOf(item: ApiLibraryTreeItem): string | null {
  if (item.kind === 'module') return idePath(item, 'index.ts')
  const folder = draftFolderOf(item) ?? newestNodeFolder(item)
  return folder ? idePath(item, `${folder}/node.json`) : null
}

/**
 * What to open once the tree has it: the URL's item or file, then any item
 * a dialog or the tree made (new, duplicated, restored) once the refetched
 * tree lists it. After render, since opening a tab updates the explorer.
 */
export function useOpenTarget(ws: LibraryWorkspace, initial: { item?: string; file?: string }) {
  const openFile = useIdeStore((s) => s.openFile)
  const { index } = ws
  const [pending, setPending] = useState<{ item?: string; file?: string } | null>(initial)

  const openItem = useCallback(
    (itemId: string) => {
      ws.selectItem(itemId)
      const item = index.itemById.get(itemId)
      if (!item) return
      const first = firstFileOf(item)
      if (first) openFile(first)
    },
    [ws, index, openFile],
  )

  const treeLoaded = ws.tree.data !== undefined
  useEffect(() => {
    if (!pending || !treeLoaded) return
    if (pending.file && index.files.has(pending.file)) openFile(pending.file)
    else if (pending.item && index.itemById.has(pending.item)) openItem(pending.item)
    setPending(null)
  }, [pending, treeLoaded, index, openFile, openItem])

  // Opened from the tree as it is after the refetch, never the index this render holds.
  function openWhenListed(itemId: string) {
    void ws.refresh().then(() => setPending({ item: itemId }))
  }

  return { openWhenListed }
}
