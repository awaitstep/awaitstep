import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { toast } from 'sonner'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import type { IdeCommandActions } from '../../lib/ide/commands'
import { describeEditability } from '../../lib/ide/editability'
import { buildFileTree, normalizeBundlePath } from '../../lib/ide/file-tree'
import { buildWorkflowStoreState, deriveReadOnlyState } from '../../lib/hydrate-workflow'
import { queries } from '../../lib/queries'
import { copyToClipboard } from '../../lib/utils'
import { useIdeShortcuts } from '../../hooks/use-ide-shortcuts'
import { useOrgReady } from '../../stores/org-store'
import { useIdeLayoutStore, type IdeLayoutKey } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { clearWorkflowHistory, useWorkflowStore } from '../../stores/workflow-store'
import { Button } from '../ui/button'
import { BottomDock } from './bottom-dock'
import { CommandPalette } from './command-palette'
import { EditorGroup } from './editor-group'
import { FileExplorer } from './file-explorer'
import { IdeHeader } from './ide-header'
import { IdeSkeleton } from './ide-skeleton'
import { QuickOpenDialog } from './quick-open-dialog'

interface IdeWorkspaceProps {
  workflowId: string
  versionParam?: string
  fileParam?: string
}

export function IdeWorkspace({ workflowId, versionParam, fileParam }: IdeWorkspaceProps) {
  if (workflowId === 'new') return <UnsavedWorkflowNotice />
  // Keyed so navigating between workflows remounts: tabs, reveal targets and
  // the hydrated canvas store never leak from one workflow into the next.
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

  const { openFile, closeFile, closeAllFiles, cycleFile, pruneFiles, showDialog } = useIdeStore(
    useShallow((s) => ({
      openFile: s.openFile,
      closeFile: s.closeFile,
      closeAllFiles: s.closeAllFiles,
      cycleFile: s.cycleFile,
      pruneFiles: s.pruneFiles,
      showDialog: s.showDialog,
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

  const files = useMemo(
    () => new Map<string, GeneratedFile>((source?.files ?? []).map((file) => [file.path, file])),
    [source],
  )
  const tree = useMemo(() => buildFileTree([...files.values()]), [files])
  const editability = useMemo(
    () => (source ? describeEditability(source.sourceMode) : null),
    [source],
  )

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

  // Keep tabs consistent with the loaded bundle and land on the deep-linked
  // file (or the entry) when nothing is open yet.
  useEffect(() => {
    if (!source) return
    pruneFiles(files.keys())
    if (useIdeStore.getState().activePath !== null) return
    const requested = fileParam ? normalizeBundlePath(fileParam) : null
    const initial = requested && files.has(requested) ? requested : source.entry
    if (files.has(initial)) openFile(initial)
  }, [source, files, fileParam, openFile, pruneFiles])

  // A workflow without any version has no source to show; that case renders
  // its own notice, so the source query's 400 is not an error worth toasting.
  const loadError = fullQuery.error ?? (fullData?.version ? sourceQuery.error : null)
  useEffect(() => {
    if (loadError) toast.error(loadError.message || 'Failed to load the workflow source')
  }, [loadError])

  const readOnlyMessage = editability?.message ?? null
  const actions = useMemo<IdeCommandActions>(
    () => ({
      save: () => {
        if (readOnlyMessage) toast.info(readOnlyMessage)
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
      readOnlyMessage,
      navigate,
      workflowId,
      versionParam,
      closeFile,
      closeAllFiles,
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

  if (fullQuery.isPending) return <IdeSkeleton />
  if (!fullData) {
    return <LoadFailure workflowId={workflowId} message={fullQuery.error?.message} />
  }
  if (!fullData.version) {
    return <NoVersionNotice workflowId={workflowId} name={fullData.workflow.name} />
  }
  if (sourceQuery.isPending) return <IdeSkeleton />
  if (!source || !editability) {
    return <LoadFailure workflowId={workflowId} message={sourceQuery.error?.message} />
  }

  const { isReadOnly: isHistorical, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData.workflow.currentVersionId,
    fullData.versions,
  )

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
              <FileExplorer tree={tree} fileCount={files.size} />
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
              <EditorGroup workflowId={workflowId} files={files} editability={editability} />
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
      <CommandPalette actions={actions} canSave={!editability.readOnly} />
      <QuickOpenDialog files={files} />
    </div>
  )
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
