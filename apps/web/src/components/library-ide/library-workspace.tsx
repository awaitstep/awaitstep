import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCreateLibraryItem } from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import { useIdeShortcuts } from '../../hooks/use-ide-shortcuts'
import { useLibraryLanguageService } from '../../hooks/use-library-language-service'
import { useLibraryWorkspace } from '../../hooks/use-library-workspace'
import { useMinWidth } from '../../hooks/use-min-width'
import { useWorkspaceProblems } from '../../hooks/use-workspace-problems'
import { libraryPath, type LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryTreeItem, LibraryKind } from '../../lib/library-api'
import { draftFolderOf, idePath, itemRoot } from '../../lib/library/ide-index'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { QuickOpenDialog } from '../ide/quick-open-dialog'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { LibraryDetails } from './details/library-details'
import { LibraryDock } from './library-dock'
import { LibraryEditor } from './library-editor'
import { LibraryExplorer, type ItemAction } from './library-explorer'
import { LibraryIdeDialogs, type LibraryIdeDialog } from './library-ide-dialogs'
import { LibraryIdeHeader } from './library-ide-header'
import { LibraryStatusBar } from './library-status-bar'
import { PublishDialog } from './publish-dialog'
import { LibraryCompare } from './workspace/library-compare'
import { LibraryGuards } from './workspace/library-guards'
import { useActivePublish } from './workspace/use-active-publish'
import { useOpenTarget } from './workspace/use-open-target'

interface LibraryWorkspaceViewProps {
  place: LibraryPlaceSlugs
  placeName: string
  initialItem?: string
  initialFile?: string
  /** `?new=`: open the explorer's new-item row under that root (the Library page's New buttons). */
  initialNew?: LibraryKind
  /** Drops `?new=` from the URL once read, so a reload never reopens the row. */
  onNewConsumed?: () => void
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
  initialNew,
  onNewConsumed,
}: LibraryWorkspaceViewProps) {
  // One session per mount, cleared before anything reads it: tabs and drafts
  // never carry over from a workflow's IDE or an earlier Library visit, and
  // the file the URL names is opened into the fresh session.
  useState(() => {
    useIdeStore.getState().resetSession()
    // The row `?new=` asks for lives in the tree: the tree is shown to hold it.
    if (initialNew) useIdeLayoutStore.setState({ explorerOpen: true })
  })
  const ws = useLibraryWorkspace(place, initialItem)
  const createItem = useCreateLibraryItem(place)
  const { index, files, dirty, actions } = ws
  const [dialog, setDialog] = useState<LibraryIdeDialog | null>(null)
  const [comparing, setComparing] = useState<string | null>(null)
  const wideEnough = useMinWidth(MIN_WIDTH)
  // On the window, like the workflow IDE: they work from the moment the page
  // opens, before anything inside it has focus.
  useIdeShortcuts({
    save: () => void actions.saveAll(),
    quickOpen: () => useIdeStore.getState().showDialog('quickOpen'),
    toggleExplorer: () => useIdeLayoutStore.getState().toggleExplorer(),
    toggleDock: () => useIdeLayoutStore.getState().toggleDock(),
    togglePreview: () => useIdeLayoutStore.getState().togglePreview(),
  })
  const layout = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      previewOpen: s.previewOpen,
    })),
  )
  const { openFile, resetSession, clearDraft } = useIdeStore(
    useShallow((s) => ({
      openFile: s.openFile,
      resetSession: s.resetSession,
      clearDraft: s.clearDraft,
    })),
  )
  useEffect(() => () => resetSession(), [resetSession])
  // A navigation, so after render: the row already holds what `?new=` asked for.
  const newConsumed = useRef(false)
  useEffect(() => {
    if (!initialNew || newConsumed.current) return
    newConsumed.current = true
    onNewConsumed?.()
  }, [initialNew, onNewConsumed])

  const conflicts = useLibraryLanguageService(ws.root, files)
  const live = useWorkspaceProblems(ws.root)
  const { activeItem, check, saved, publish, publishing, setPublishing } = useActivePublish(
    ws,
    conflicts,
  )
  const { openWhenListed } = useOpenTarget(ws, { item: initialItem, file: initialFile })
  const sourceOf = useCallback((path: string) => files.get(path)?.source, [files])

  function handleItemAction(action: ItemAction, item: ApiLibraryTreeItem) {
    if (action === 'new-version') setDialog({ kind: 'restore', item, version: item.latestVersion! })
    else setDialog({ kind: action, item })
  }

  async function handleCreateItem(kind: LibraryKind, name: string): Promise<string | null> {
    try {
      const item = await createItem.mutateAsync({ kind, name })
      openWhenListed(item.id)
      return null
    } catch (error) {
      return failureLine(error, 'Couldn’t create it')
    }
  }

  /** A restore replaced the item's code (a node's open folder): edits there are gone, as the dialog said. */
  function handleRestored(itemId: string) {
    const item = index.itemById.get(itemId)
    if (item) {
      const folder = item.kind === 'node' ? draftFolderOf(item) : null
      if (item.kind === 'module') ws.forgetItem(itemRoot(item))
      else if (folder) ws.forgetItem(idePath(item, folder))
    }
    openWhenListed(itemId)
  }

  function handleOpenVersion(item: ApiLibraryTreeItem, version: string) {
    openFile(idePath(item, `${version}/node.json`))
  }

  function handleOverwrite(path: string, serverHash: string | null) {
    void actions.overwriteFile(path, serverHash)
  }

  function handlePublishOpen() {
    setPublishing(true)
  }

  // Offered from a never-published item's history (28j), for the active item only.
  const historyPublish =
    activeItem && publish && ws.canEdit
      ? { itemId: activeItem.id, ...publish, onPublish: handlePublishOpen }
      : null

  // The guards stay mounted in every branch: a narrow window or a failed
  // refetch must not let unsaved edits go without asking.
  if (ws.tree.isError) {
    return (
      <div className="p-8">
        <LibraryGuards ws={ws} />
        <WorkspaceLoadError
          what="the library"
          error={ws.tree.error}
          onRetry={() => void ws.tree.refetch()}
          retrying={ws.tree.isFetching}
        />
      </div>
    )
  }

  if (!wideEnough) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <LibraryGuards ws={ws} />
        <p className="text-sm font-medium text-foreground">The Library IDE needs a wider window.</p>
        <p className="text-xs text-muted-foreground">
          Widen the window, or manage items from the Library page.
        </p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <LibraryIdeHeader
        libraryHref={libraryPath(place)}
        placeName={placeName}
        item={activeItem}
        dirtyCount={dirty.size}
        saving={actions.busy}
        canEdit={ws.canEdit}
        onSave={() => void actions.saveAll()}
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
              onCreateItem={handleCreateItem}
              initialNew={initialNew}
              onSelectItem={ws.selectItem}
              onItemAction={handleItemAction}
              onCreateFile={actions.createFile}
              onRenameFile={actions.renameFile}
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
              onRevertFile={clearDraft}
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
          <LibraryStatusBar problems={[...live, ...saved]} />
        </div>
        {layout.previewOpen && (
          <aside className="w-80 shrink-0 border-l border-border">
            <LibraryDetails
              item={activeItem}
              sourceOf={sourceOf}
              canEdit={ws.canEdit}
              onRestore={(item, version) => setDialog({ kind: 'restore', item, version })}
              onHistory={(item) => setDialog({ kind: 'history', item })}
            />
          </aside>
        )}
      </div>
      <QuickOpenDialog files={files} />
      <LibraryGuards ws={ws} />
      {dialog && (
        <LibraryIdeDialogs
          ws={ws}
          place={place}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onItemReady={openWhenListed}
          onRestored={handleRestored}
          onOpenVersion={handleOpenVersion}
          placeName={placeName}
          publish={historyPublish}
        />
      )}
      {comparing && <LibraryCompare ws={ws} path={comparing} onClose={() => setComparing(null)} />}
      {publishing && activeItem && check.data?.version && (
        <PublishDialog
          place={place}
          item={activeItem}
          version={check.data.version}
          bumpedFrom={check.data.bumpedFrom}
          onClose={() => setPublishing(false)}
          onRefused={() => void check.refetch()}
        />
      )}
    </div>
  )
}
