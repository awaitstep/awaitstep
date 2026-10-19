import { useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import type { IdeCommandActions } from '../../lib/ide/commands'
import { dirtyPaths, overlayDrafts } from '../../lib/ide/drafts'
import { fileEditability, workspaceEditability } from '../../lib/ide/editability'
import { basename, buildFileTree, normalizeBundlePath } from '../../lib/ide/file-tree'
import { fileOwner, splitWorkspaceFiles, virtualSeedFiles } from '../../lib/ide/project'
import { buildWorkflowStoreState, deriveReadOnlyState } from '../../lib/hydrate-workflow'
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import {
  describeHandlerDeclarations,
  type HandlerConversionPreview,
  type SourceFile,
} from '../../lib/api-client'
import { queries } from '../../lib/queries'
import { copyToClipboard } from '../../lib/utils'
import { useIdeShortcuts } from '../../hooks/use-ide-shortcuts'
import { useProjectFiles } from '../../hooks/use-project-files'
import { useOrgReady } from '../../stores/org-store'
import { useIdeLayoutStore, type IdeLayoutKey } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { clearWorkflowHistory, useWorkflowStore } from '../../stores/workflow-store'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { BottomDock } from './bottom-dock'
import { CommandPalette } from './command-palette'
import { EditorGroup } from './editor-group'
import { FileExplorer } from './file-explorer'
import { FilePathDialog } from './file-path-dialog'
import { IdeHeader } from './ide-header'
import { IdeSkeleton } from './ide-skeleton'
import { QuickOpenDialog } from './quick-open-dialog'

interface IdeWorkspaceProps {
  workflowId: string
  versionParam?: string
  fileParam?: string
}

const EMPTY_FILES: ReadonlyMap<string, SourceFile> = new Map()

export function IdeWorkspace({ workflowId, versionParam, fileParam }: IdeWorkspaceProps) {
  if (workflowId === 'new') return <UnsavedWorkflowNotice />
  // Keyed so navigating between workflows remounts: tabs, drafts, reveal
  // targets and the hydrated canvas store never leak from one workflow into
  // the next.
  return (
    <Workspace
      key={workflowId}
      workflowId={workflowId}
      versionParam={versionParam}
      fileParam={fileParam}
    />
  )
}

function Workspace({ workflowId, versionParam, fileParam }: IdeWorkspaceProps) {
  const ready = useOrgReady()
  const navigate = useNavigate()

  const fullQuery = useQuery({
    ...queries.workflows.full(workflowId, versionParam),
    enabled: ready,
  })
  const sourceQuery = useQuery({
    ...queries.workflows.source(workflowId, versionParam),
    enabled: ready,
  })
  const fullData = fullQuery.data
  const source = sourceQuery.data

  const {
    activePath,
    drafts,
    dialog,
    dialogTarget,
    openFile,
    closeFile,
    closeAllFiles,
    cycleFile,
    pruneFiles,
    setDraft,
    clearDraft,
    clearDrafts,
    reconcileDrafts,
    showDialog,
    closeDialog,
  } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      drafts: s.drafts,
      dialog: s.dialog,
      dialogTarget: s.dialogTarget,
      openFile: s.openFile,
      closeFile: s.closeFile,
      closeAllFiles: s.closeAllFiles,
      cycleFile: s.cycleFile,
      pruneFiles: s.pruneFiles,
      setDraft: s.setDraft,
      clearDraft: s.clearDraft,
      clearDrafts: s.clearDrafts,
      reconcileDrafts: s.reconcileDrafts,
      showDialog: s.showDialog,
      closeDialog: s.closeDialog,
    })),
  )
  const { explorerOpen, dockOpen, toggleExplorer, toggleDock, showDock, setLayout } =
    useIdeLayoutStore(
      useShallow((s) => ({
        explorerOpen: s.explorerOpen,
        dockOpen: s.dockOpen,
        toggleExplorer: s.toggleExplorer,
        toggleDock: s.toggleDock,
        showDock: s.showDock,
        setLayout: s.setLayout,
      })),
    )
  // Panel groups read their default layout once at mount; later drags flow
  // back through setLayout, so subscribing would only cause re-renders.
  const [initialLayouts] = useState(() => useIdeLayoutStore.getState().layouts)

  const { isReadOnly: isHistorical, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData?.workflow.currentVersionId,
    fullData?.versions,
  )
  const workspace = useMemo(
    () =>
      source
        ? workspaceEditability({ sourceMode: source.sourceMode, historical: isHistorical })
        : null,
    [source, isHistorical],
  )
  const canEdit = workspace !== null && !workspace.readOnly

  // Everything about ownership comes from the one source response: a file
  // with a hash is project-owned (the hash is its write precondition), the
  // rest is generated. Legacy settings surface as virtual files to adopt.
  const storedPaths = useMemo(
    () => new Set((source?.files ?? []).filter((f) => f.hash !== undefined).map((f) => f.path)),
    [source],
  )
  const seeds = useMemo(
    () => (canEdit && fullData ? virtualSeedFiles(fullData.workflow, storedPaths) : []),
    [canEdit, fullData, storedPaths],
  )
  const projectPaths = useMemo(
    () => new Set([...storedPaths, ...seeds.map((f) => f.path)]),
    [storedPaths, seeds],
  )
  const virtualPaths = useMemo(() => new Set(seeds.map((f) => f.path)), [seeds])

  const baseline = useMemo(() => {
    if (!source) return EMPTY_FILES
    const map = new Map<string, SourceFile>(source.files.map((file) => [file.path, file]))
    for (const seed of seeds) if (!map.has(seed.path)) map.set(seed.path, seed)
    return map
  }, [source, seeds])
  const files = useMemo(() => overlayDrafts(baseline, drafts), [baseline, drafts])
  const dirty = useMemo(() => new Set(dirtyPaths(baseline, drafts)), [baseline, drafts])
  // Trees only depend on which files exist, so a keystroke never rebuilds them.
  const trees = useMemo(() => {
    const split = splitWorkspaceFiles(baseline.values(), projectPaths)
    return { project: buildFileTree(split.project), generated: buildFileTree(split.generated) }
  }, [baseline, projectPaths])

  const projectFiles = useProjectFiles({
    workflowId,
    target: fullData?.workflow.kind === 'script' ? 'script' : 'workflow',
    baseline,
  })

  // Hydrate the canvas store (always read-only here) so Monaco's per-workflow
  // ambient types — typed Env, node outputs, runGraph — apply in the IDE too.
  // Store sync from query data follows the canvas route's established pattern.
  useEffect(() => {
    if (!fullData?.workflow) return
    useWorkflowStore.getState().setWorkflowId(workflowId)
    useWorkflowStore.setState(
      buildWorkflowStoreState(
        fullData.workflow,
        fullData.version,
        fullData.version?.version ?? 0,
        true,
        { handlerModules: fullData.handlers.modules },
      ),
    )
    clearWorkflowHistory()
  }, [fullData, workflowId])

  useEffect(() => {
    return () => {
      useWorkflowStore.getState().reset()
      useIdeStore.getState().resetSession()
    }
  }, [])

  // Keep tabs and drafts consistent with the loaded bundle (a refetch after
  // a save makes the saved draft redundant) and land on the deep-linked file
  // (or the entry) when nothing is open yet.
  useEffect(() => {
    if (!source) return
    pruneFiles(baseline.keys())
    reconcileDrafts(baseline)
    if (useIdeStore.getState().activePath !== null) return
    const requested = fileParam ? normalizeBundlePath(fileParam) : null
    const initial = requested && baseline.has(requested) ? requested : source.entry
    if (baseline.has(initial)) openFile(initial)
  }, [source, baseline, fileParam, openFile, pruneFiles, reconcileDrafts])

  // A workflow without any version has no source to show; that case renders
  // its own notice, so the source query's 400 is not an error worth toasting.
  const loadError = fullQuery.error ?? (fullData?.version ? sourceQuery.error : null)
  useEffect(() => {
    if (loadError) toast.error(loadError.message || 'Failed to load the workflow source')
  }, [loadError])

  const hasUnsaved = dirty.size > 0
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved,
    enableBeforeUnload: () => hasUnsaved,
    withResolver: true,
  })

  const activeIsStoredFile = activePath !== null && storedPaths.has(activePath)
  const activeIsHandlersFile = activePath === PROJECT_HANDLERS_PATH
  // What the conversion will do, shown before it is confirmed.
  const conversionPreview = useQuery({
    ...queries.workflows.handlerConversion(workflowId),
    enabled: dialog === 'convertHandlers',
  })
  const activeDirty = activePath !== null && dirty.has(activePath)
  const readOnlyMessage = workspace?.message ?? null

  // Text equal to the baseline is not a draft: keeping it would let a stale
  // "edit" survive an agent's later change and overwrite it on save.
  function handleEditorChange(path: string, text: string) {
    if (baseline.get(path)?.source === text) clearDraft(path)
    else setDraft(path, text, baseline.get(path)?.hash ?? null)
  }

  const actions = useMemo<IdeCommandActions>(
    () => ({
      save: () => {
        if (!canEdit) {
          if (readOnlyMessage) toast.info(readOnlyMessage)
          return
        }
        const path = useIdeStore.getState().activePath
        if (path) void projectFiles.saveFile(path)
      },
      saveAll: () => {
        if (canEdit) void projectFiles.saveAll()
      },
      discardChanges: () => {
        clearDrafts()
        toast.info('Unsaved changes discarded')
      },
      newFile: () => showDialog('newFile'),
      renameFile: () => {
        const path = useIdeStore.getState().activePath
        if (path && storedPaths.has(path)) showDialog('renameFile', path)
      },
      deleteFile: () => {
        const path = useIdeStore.getState().activePath
        if (path && storedPaths.has(path)) showDialog('deleteFile', path)
      },
      convertHandlers: () => {
        if (!canEdit) return
        // The server converts what it has stored, so an unsaved handlers.ts
        // is saved before the plan is drawn up: the dialog then describes
        // the conversion that will actually run.
        if (!useIdeStore.getState().drafts[PROJECT_HANDLERS_PATH]) {
          showDialog('convertHandlers')
          return
        }
        void projectFiles.saveFile(PROJECT_HANDLERS_PATH).then((saved) => {
          if (saved) showDialog('convertHandlers')
        })
      },
      quickOpen: () => showDialog('quickOpen'),
      switchToCanvas: () =>
        navigate({
          to: '/workflows/$workflowId/canvas',
          params: { workflowId },
          search: versionParam ? { version: versionParam } : {},
        }),
      closeActiveFile: () => {
        const path = useIdeStore.getState().activePath
        if (path) closeFile(path)
      },
      closeAllFiles,
      copyActivePath: () => {
        const path = useIdeStore.getState().activePath
        if (!path) return
        copyToClipboard(path)
          .then(() => toast.success('Path copied'))
          .catch(() => toast.error('Could not copy the path'))
      },
      toggleExplorer,
      toggleDock,
      showProblems: () => showDock('problems'),
      showOutput: () => showDock('output'),
      showRun: () => showDock('run'),
    }),
    [
      canEdit,
      readOnlyMessage,
      projectFiles,
      storedPaths,
      navigate,
      workflowId,
      versionParam,
      closeFile,
      closeAllFiles,
      clearDrafts,
      toggleExplorer,
      toggleDock,
      showDock,
      showDialog,
    ],
  )

  useIdeShortcuts({
    save: actions.save,
    quickOpen: actions.quickOpen,
    commandPalette: () => showDialog('palette'),
    toggleExplorer,
    toggleDock,
    nextTab: () => cycleFile(1),
    prevTab: () => cycleFile(-1),
    closeTab: actions.closeActiveFile,
  })

  // The requested layout is the one before size constraints clipped it,
  // which is what should come back on the next mount.
  const handleLayoutChanged = (key: IdeLayoutKey) => (layout: Layout, meta: LayoutChangedMeta) => {
    if (meta.isUserInteraction) setLayout(key, meta.requestedLayout ?? layout)
  }

  function editabilityOf(path: string) {
    return fileEditability(
      fileOwner(path, projectPaths),
      workspace ?? { readOnly: true, message: null },
    )
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) closeDialog()
  }

  function handleRenameRequest(path: string) {
    showDialog('renameFile', path)
  }

  function handleDeleteRequest(path: string) {
    showDialog('deleteFile', path)
  }

  function handleConvertRequest() {
    actions.convertHandlers()
  }

  function handleConvert() {
    closeDialog()
    void projectFiles.convertHandlers().then((result) => {
      if (!result || result.deploymentConfigUpdated) return
      const facts = describeHandlerDeclarations(result.declarations)
      if (facts.length > 0) {
        toast.info(`Declare in the deployment config before deploying: ${facts.join('; ')}`, {
          description: 'There is no stored deployment config yet to carry them.',
          duration: 15_000,
        })
      }
    })
  }

  function handleCreate(path: string) {
    closeDialog()
    void projectFiles.createFile(path)
  }

  function handleRename(to: string) {
    const from = dialogTarget
    closeDialog()
    if (from) void projectFiles.renameFile(from, to)
  }

  function handleDelete() {
    const path = dialogTarget
    closeDialog()
    if (path) void projectFiles.deleteFile(path)
  }

  function handleBlockerOpenChange(open: boolean) {
    if (!open) blocker.reset?.()
  }

  function handleLeave() {
    blocker.proceed?.()
  }

  if (fullQuery.isPending) return <IdeSkeleton />
  if (!fullData) {
    return <LoadFailure workflowId={workflowId} message={fullQuery.error?.message} />
  }
  if (!fullData.version) {
    return <NoVersionNotice workflowId={workflowId} name={fullData.workflow.name} />
  }
  if (sourceQuery.isPending) return <IdeSkeleton />
  if (!source || !workspace) {
    return <LoadFailure workflowId={workflowId} message={sourceQuery.error?.message} />
  }

  const existingPaths = [...baseline.keys()]
  const renameExisting = existingPaths.filter((p) => p !== dialogTarget)

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <IdeHeader
        workflowId={workflowId}
        workflowName={fullData.workflow.name}
        kind={fullData.workflow.kind}
        version={fullData.version.version}
        historicalVersion={isHistorical ? (readOnlyVersion ?? fullData.version.version) : undefined}
        sourceMode={source.sourceMode}
        versionParam={versionParam}
        dirtyCount={dirty.size}
        canEdit={canEdit}
        saving={projectFiles.busy}
        onSave={actions.saveAll}
      />
      <Group
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={initialLayouts.workspace}
        onLayoutChanged={handleLayoutChanged('workspace')}
      >
        {explorerOpen && (
          <>
            <Panel id="explorer" defaultSize="18" minSize={180} maxSize="40">
              <FileExplorer
                project={trees.project}
                generated={trees.generated}
                dirty={dirty}
                virtual={virtualPaths}
                canEdit={canEdit}
                onNewFile={actions.newFile}
                onRename={handleRenameRequest}
                onDelete={handleDeleteRequest}
                onConvert={handleConvertRequest}
              />
            </Panel>
            <Separator className="w-px bg-border transition-colors hover:bg-primary/50" />
          </>
        )}
        <Panel id="main" minSize="40">
          <Group
            orientation="vertical"
            className="h-full"
            defaultLayout={initialLayouts.editor}
            onLayoutChanged={handleLayoutChanged('editor')}
          >
            <Panel id="editor" minSize="30">
              <EditorGroup
                workflowId={workflowId}
                files={files}
                dirty={dirty}
                editabilityOf={editabilityOf}
                onChange={handleEditorChange}
              />
            </Panel>
            {dockOpen && (
              <>
                <Separator className="h-px bg-border transition-colors hover:bg-primary/50" />
                <Panel id="dock" defaultSize="28" minSize={120} maxSize="70">
                  <BottomDock workflowId={workflowId} />
                </Panel>
              </>
            )}
          </Group>
        </Panel>
      </Group>
      <CommandPalette
        actions={actions}
        canEdit={canEdit}
        activeIsStoredFile={activeIsStoredFile}
        activeIsHandlersFile={activeIsHandlersFile}
        activeDirty={activeDirty}
        dirtyCount={dirty.size}
      />
      <QuickOpenDialog files={baseline} />
      <FilePathDialog
        key={`new:${dialog === 'newFile'}`}
        open={dialog === 'newFile'}
        title="New file"
        description="Any folder works. Import it from anywhere as #app/<path> (no extension for .ts/.js files)."
        submitLabel="Create"
        existingPaths={existingPaths}
        busy={projectFiles.busy}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleCreate}
      />
      <FilePathDialog
        key={`rename:${dialogTarget ?? ''}:${dialog === 'renameFile'}`}
        open={dialog === 'renameFile'}
        title="Rename file"
        description="Imports pointing at the old path are not rewritten."
        submitLabel="Rename"
        initialPath={dialogTarget ?? ''}
        existingPaths={renameExisting}
        busy={projectFiles.busy}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleRename}
      />
      <ConfirmDialog
        open={dialog === 'deleteFile'}
        onOpenChange={handleDialogOpenChange}
        title={`Delete ${dialogTarget ? basename(dialogTarget) : 'file'}?`}
        description={`${dialogTarget ?? 'The file'} will be removed from the project. Code that imports it will fail to build until it is updated.`}
        confirmLabel="Delete"
        loading={projectFiles.busy}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={dialog === 'convertHandlers'}
        onOpenChange={handleDialogOpenChange}
        title="Convert to handler modules?"
        description={describeConversion(conversionPreview.data, conversionPreview.error)}
        confirmLabel="Convert"
        variant="warning"
        loading={projectFiles.busy || conversionPreview.isPending}
        onConfirm={handleConvert}
      />
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={handleBlockerOpenChange}
        title="Unsaved changes"
        description={`${dirty.size === 1 ? 'One file has' : `${dirty.size} files have`} unsaved changes that will be lost if you leave.`}
        confirmLabel="Leave"
        variant="warning"
        onConfirm={handleLeave}
      />
    </div>
  )
}

/** The conversion, in the user's terms, from the server's dry run. */
function describeConversion(
  preview: HandlerConversionPreview | undefined,
  error: Error | null,
): string {
  if (error) return `The conversion cannot run: ${error.message}`
  if (!preview) return 'Working out what the handlers become…'
  const origin = {
    file: 'handlers.ts is replaced by',
    setting: 'The trigger-code setting becomes',
    version: 'The trigger code saved with this version becomes',
  }[preview.source]
  const parts = [`${origin} ${preview.paths.join(', ')}.`]
  const facts = describeHandlerDeclarations(preview.declarations)
  if (facts.length > 0) parts.push(`Moving to the deployment config: ${facts.join('; ')}.`)
  parts.push('Modules are plain TypeScript: typed, importable, no annotations.')
  return parts.join(' ')
}

function Notice({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{description}</p>
        <div className="mt-4">{action}</div>
      </div>
    </div>
  )
}

function UnsavedWorkflowNotice() {
  return (
    <Notice
      title="Save the workflow first"
      description="The code workspace shows a saved version’s source. Build the first version on the canvas, then come back here."
      action={
        <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} search={{}}>
          <Button size="sm" variant="outline">
            Open canvas
          </Button>
        </Link>
      }
    />
  )
}

function NoVersionNotice({ workflowId, name }: { workflowId: string; name: string }) {
  return (
    <Notice
      title={`${name} has no saved version yet`}
      description="Source is generated from a saved version. Save the workflow on the canvas once and the code workspace will show it."
      action={
        <Link to="/workflows/$workflowId/canvas" params={{ workflowId }} search={{}}>
          <Button size="sm" variant="outline">
            Open canvas
          </Button>
        </Link>
      }
    />
  )
}

function LoadFailure({ workflowId, message }: { workflowId: string; message?: string }) {
  return (
    <Notice
      title="Couldn’t load the source"
      description={message || 'Unknown error'}
      action={
        <Link to="/workflows/$workflowId" params={{ workflowId }}>
          <Button size="sm" variant="outline">
            Back to overview
          </Button>
        </Link>
      }
    />
  )
}
