import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useShallow } from 'zustand/react/shallow'
import { useLibraryCheck } from '../../data/dashboard/library'
import { useLibraryLanguageService } from '../../hooks/use-library-language-service'
import { useLibraryWorkspace } from '../../hooks/use-library-workspace'
import { useMinWidth } from '../../hooks/use-min-width'
import { useWorkspaceProblems } from '../../hooks/use-workspace-problems'
import { libraryPath, type LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import { matchShortcut } from '../../lib/ide/shortcuts'
import type { ApiLibraryTreeItem, LibraryKind } from '../../lib/library-api'
import { checkProblems, conflictProblems } from '../../lib/library/check-problems'
import { draftFolderOf, idePath, itemRoot } from '../../lib/library/ide-index'
import { newestNodeFolder } from '../../lib/library/manifest-summary'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { QuickOpenDialog } from '../ide/quick-open-dialog'
import { CloseDirtyDialog } from '../ide/close-dirty-dialog'
import { WorkspaceUnsavedDialog } from '../ide/workspace-dialogs'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { LibraryDetails } from './details/library-details'
import { LibraryDock } from './library-dock'
import { LibraryEditor } from './library-editor'
import { LibraryExplorer, type ItemAction } from './library-explorer'
import { LibraryIdeDialogs, type LibraryIdeDialog } from './library-ide-dialogs'
import { LibraryIdeHeader } from './library-ide-header'
import { LibraryStatusBar } from './library-status-bar'
import { publishState } from './publish-state'
import { CompareDialog } from './compare-dialog'
import { PublishDialog } from './publish-dialog'

interface LibraryWorkspaceViewProps {
  place: LibraryPlaceSlugs
  placeName: string
  initialItem?: string
  initialFile?: string
}

/** Below this the tree, editor and details can't all be usable at once. */
const MIN_WIDTH = 960

/**
 * The Library IDE (28d/28e/28f): every item of one place in one tree, the
 * editor, the Problems dock and the Details pane. Save writes the working
 * copy; Publish turns the active item's working copy into its next version.
 */
export function LibraryWorkspaceView({
  place,
  placeName,
  initialItem,
  initialFile,
}: LibraryWorkspaceViewProps) {
  // One session per mount, cleared before anything reads it: tabs and drafts
  // never carry over from a workflow's IDE or an earlier Library visit, and
  // the file the URL names is opened into the fresh session (below).
  useState(() => useIdeStore.getState().resetSession())
  const ws = useLibraryWorkspace(place, initialItem)
  const { index, files, dirty, actions } = ws
  const [dialog, setDialog] = useState<LibraryIdeDialog | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [comparing, setComparing] = useState<string | null>(null)
  const wideEnough = useMinWidth(MIN_WIDTH)
  const isMac = isMacPlatform()
  const layout = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      previewOpen: s.previewOpen,
    })),
  )
  const { openFile, resetSession, clearDraft, closeFiles } = useIdeStore(
    useShallow((s) => ({
      openFile: s.openFile,
      resetSession: s.resetSession,
      clearDraft: s.clearDraft,
      closeFiles: s.closeFiles,
    })),
  )

  useEffect(() => () => resetSession(), [resetSession])

  const conflicts = useLibraryLanguageService(ws.root, files)
  const live = useWorkspaceProblems(ws.root)

  const activeItem = ws.activeItemId ? (index.itemById.get(ws.activeItemId) ?? null) : null
  const check = useLibraryCheck(activeItem?.id ?? null, { enabled: ws.canEdit })
  const saved = useMemo(
    () => [
      ...(activeItem && check.data ? checkProblems(activeItem, check.data.problems) : []),
      ...conflictProblems(conflicts),
    ],
    [activeItem, check.data, conflicts],
  )
  const itemDirty = activeItem
    ? [...dirty].some((path) => path.startsWith(`${itemRoot(activeItem)}/`))
    : false
  const publish = activeItem
    ? publishState(check.data, check.isFetching, itemDirty, check.isError)
    : null

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

  // What to open once the tree has it: the URL's item or file, then any
  // item a dialog made (new, duplicated, restored) once the refetched tree
  // lists it. After render, since opening a tab updates the explorer.
  const [pendingOpen, setPendingOpen] = useState<{ item?: string; file?: string } | null>({
    item: initialItem,
    file: initialFile,
  })
  const treeLoaded = ws.tree.data !== undefined
  useEffect(() => {
    if (!pendingOpen || !treeLoaded) return
    if (pendingOpen.file && index.files.has(pendingOpen.file)) openFile(pendingOpen.file)
    else if (pendingOpen.item && index.itemById.has(pendingOpen.item)) openItem(pendingOpen.item)
    setPendingOpen(null)
  }, [pendingOpen, treeLoaded, index, openFile, openItem])

  const hasUnsaved = dirty.size > 0
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved,
    enableBeforeUnload: () => hasUnsaved,
    withResolver: true,
  })

  function handleSave() {
    void actions.saveAll()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const id = matchShortcut(event.nativeEvent, isMac)
    if (!id) return
    const store = useIdeLayoutStore.getState()
    if (id === 'save') void actions.saveAll()
    else if (id === 'quickOpen') useIdeStore.getState().showDialog('quickOpen')
    else if (id === 'toggleExplorer') store.toggleExplorer()
    else if (id === 'toggleDock') store.toggleDock()
    else if (id === 'togglePreview') store.togglePreview()
    else return
    event.preventDefault()
  }

  function handleItemAction(action: ItemAction, item: ApiLibraryTreeItem) {
    if (action === 'new-version') {
      setDialog({ kind: 'restore', item, version: item.latestVersion! })
      return
    }
    setDialog({ kind: action, item })
  }

  function handleNewItem(kind: LibraryKind) {
    setDialog({ kind: 'new-item', itemKind: kind })
  }

  function handleRestore(item: ApiLibraryTreeItem, version: string) {
    setDialog({ kind: 'restore', item, version })
  }

  function handleHistory(item: ApiLibraryTreeItem) {
    setDialog({ kind: 'history', item })
  }

  function handleOpenVersion(item: ApiLibraryTreeItem, version: string) {
    openFile(idePath(item, `${version}/node.json`))
  }

  // Opened from the tree as it is after the refetch, never the index this render holds.
  function handleItemReady(itemId: string) {
    void ws.refresh().then(() => setPendingOpen({ item: itemId }))
  }

  /** A restore replaced the item's code (a node's open folder): edits there are gone, as the dialog said. */
  function handleRestored(itemId: string) {
    const item = index.itemById.get(itemId)
    if (item) {
      const folder = item.kind === 'node' ? draftFolderOf(item) : null
      if (item.kind === 'module') ws.forgetItem(itemRoot(item))
      else if (folder) ws.forgetItem(idePath(item, folder))
    }
    handleItemReady(itemId)
  }

  function handleRevert(path: string) {
    clearDraft(path)
  }

  function handleOverwrite(path: string, serverHash: string | null) {
    void actions.overwriteFile(path, serverHash)
  }

  function handleCloseSave(dirtyPaths: string[], paths: string[]) {
    void actions.saveFiles(dirtyPaths).then((results) => {
      if (results.every(Boolean)) closeFiles(paths)
    })
  }

  function handleCloseDiscard(dirtyPaths: string[], paths: string[]) {
    for (const path of dirtyPaths) clearDraft(path)
    closeFiles(paths)
  }

  function handleCloseReview(path: string) {
    openFile(path)
  }

  function handleCloseDialog() {
    setDialog(null)
  }

  const comparingFile = comparing ? (index.files.get(comparing) ?? null) : null

  function handleCompareUseServer() {
    if (comparing) clearDraft(comparing)
  }

  function handleCompareKeepMine(serverHash: string | null) {
    if (comparing) void actions.overwriteFile(comparing, serverHash)
  }

  function handleCompareClose() {
    setComparing(null)
  }

  function handlePublishOpen() {
    setPublishing(true)
  }

  function handlePublishClose() {
    setPublishing(false)
  }

  function handlePublishRefused() {
    void check.refetch()
  }

  function handleRetry() {
    void ws.tree.refetch()
  }

  const sourceOf = useCallback((path: string) => files.get(path)?.source, [files])
  const libraryHref = libraryPath(place)

  if (ws.tree.isError) {
    return (
      <div className="p-8">
        <WorkspaceLoadError
          what="the library"
          error={ws.tree.error}
          onRetry={handleRetry}
          retrying={ws.tree.isFetching}
        />
      </div>
    )
  }

  if (!wideEnough) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">The Library IDE needs a wider window.</p>
        <p className="text-xs text-muted-foreground">
          Widen the window, or manage items from the Library page.
        </p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-background"
      onKeyDown={handleKeyDown}
    >
      <LibraryIdeHeader
        libraryHref={libraryHref}
        placeName={placeName}
        item={activeItem}
        dirtyCount={dirty.size}
        saving={actions.busy}
        canEdit={ws.canEdit}
        onSave={handleSave}
        publish={publish}
        onPublish={handlePublishOpen}
      />
      <div className="flex min-h-0 flex-1">
        {layout.explorerOpen && (
          <div className="w-64 shrink-0 border-r border-border">
            <LibraryExplorer
              index={index}
              placeName={placeName}
              dirty={dirty}
              activeItemId={ws.activeItemId}
              canEdit={ws.canEdit}
              canCreate={ws.canCreate}
              onNewItem={handleNewItem}
              onSelectItem={ws.selectItem}
              onItemAction={handleItemAction}
              onNewFile={(folder) => setDialog({ kind: 'new-file', folder })}
              onRenameFile={(path) => setDialog({ kind: 'rename-file', path })}
              onDeleteFile={(path) => setDialog({ kind: 'delete-file', path })}
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <LibraryEditor
              root={ws.root}
              files={files}
              dirty={dirty}
              loading={ws.loading}
              isReadOnly={ws.isReadOnly}
              readOnlyReason={ws.readOnlyReason}
              onRevertFile={handleRevert}
              onChange={ws.onEditorChange}
              onOverwrite={handleOverwrite}
              onCompare={setComparing}
            />
          </div>
          {layout.dockOpen && (
            <div className="h-48 shrink-0 border-t border-border">
              <LibraryDock live={live} saved={saved} dirty={dirty} />
            </div>
          )}
        </div>
        {layout.previewOpen && (
          <aside className="w-80 shrink-0 border-l border-border">
            <LibraryDetails
              item={activeItem}
              sourceOf={sourceOf}
              canEdit={ws.canEdit}
              onRestore={handleRestore}
              onHistory={handleHistory}
            />
          </aside>
        )}
      </div>
      <LibraryStatusBar problems={[...live, ...saved]} />
      <QuickOpenDialog files={files} />
      <CloseDirtyDialog
        saving={actions.busy}
        onSave={handleCloseSave}
        onDiscard={handleCloseDiscard}
        onReview={handleCloseReview}
      />
      {/* Review… needs the workflow IDE's Unsaved changes tab, so it is not offered here. */}
      <WorkspaceUnsavedDialog
        blocker={blocker}
        dirtyCount={dirty.size}
        canEdit={ws.canEdit}
        wideEnough={false}
        saving={actions.busy}
        saveAll={actions.saveAll}
      />
      {dialog && (
        <LibraryIdeDialogs
          ws={ws}
          place={place}
          dialog={dialog}
          onClose={handleCloseDialog}
          onItemReady={handleItemReady}
          onRestored={handleRestored}
          onOpenVersion={handleOpenVersion}
        />
      )}
      {comparingFile && comparing && (
        <CompareDialog
          path={comparing}
          file={comparingFile}
          mine={files.get(comparing)?.source ?? ''}
          onUseServer={handleCompareUseServer}
          onKeepMine={handleCompareKeepMine}
          onClose={handleCompareClose}
        />
      )}
      {publishing && activeItem && check.data?.version && (
        <PublishDialog
          place={place}
          item={activeItem}
          version={check.data.version}
          bumpedFrom={check.data.bumpedFrom}
          onClose={handlePublishClose}
          onRefused={handlePublishRefused}
        />
      )}
    </div>
  )
}

/** The file an item opens on: a module's index.ts, a node's newest node.json. */
function firstFileOf(item: ApiLibraryTreeItem): string | null {
  if (item.kind === 'module') return idePath(item, 'index.ts')
  const folder = draftFolderOf(item) ?? newestNodeFolder(item)
  return folder ? idePath(item, `${folder}/node.json`) : null
}
