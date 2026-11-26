import { useState } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { EnvVarsDialog } from '../workflows/env-vars-dialog'
import { Button } from '../ui/button'
import { useTemporalStore } from '../../stores/workflow-store'
import { useCanvasLayoutStore } from '../../stores/canvas-layout-store'
import { useIdeShortcuts, type IdeShortcutListing } from '../../hooks/use-ide-shortcuts'
import { redoWithFeedback, undoWithFeedback } from './time-travel'
import { useSwitchView } from '../../hooks/use-switch-view'
import { useInspectorToggle } from '../../hooks/use-inspector-toggle'
import type { EditorView } from '../workflows/view-switch'
import { UnifiedTopBar, type TopBarToggle } from '../workflows/unified-top-bar'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { deployBadge } from '../../lib/workflows/deploy-badge'
import { isMacPlatform } from '../../lib/platform'
import { SaveStatusIndicator } from './save-status-indicator'
import { EditorExtensions } from '../../extensions/editor-extensions'
import { readOnlyReason } from '../../lib/workflows/read-only-reason'
import { BLANK_DEPLOY_REASON, canvasMenuGroups, canvasTopBarVersion } from './canvas-toolbar-menu'

/** The canvas's IDE chords, as the shortcuts sheet words them. */
const CANVAS_SHORTCUT_LISTING: IdeShortcutListing = {
  heading: 'Canvas',
  labels: {
    toggleExplorer: 'Show or hide the nodes',
    toggleDock: 'Show or hide the inspector',
  },
}

export interface EditorToolbarProps {
  workflowId: string
  isNew: boolean
  workflowName: string
  /** `'workflow'` (default) or `'script'`. Surfaces a "Function" pill in the header. */
  kind?: 'workflow' | 'script'
  currentVersion: number
  nodeCount: number
  isDirty: boolean
  hasActiveDeployment: boolean
  hasUndeployedChanges: boolean | string | undefined
  deployedVersion: number | undefined
  onSave: () => void
  isSaving: boolean
  lastSavedAt?: Date | null
  saveError?: string | null
  /** Code saved this workflow since the canvas loaded it: Save is withdrawn until Reload. */
  saveConflict?: boolean
  onReload?: () => void
  reloading?: boolean
  onDeploy: () => void
  /** Runs the client-side check; its result opens in the canvas's bottom panel. */
  onCheck: () => void
  /** The test run button: starts a run, or shows the one that is live. */
  testRun: TopBarToggle
  /** Offered only while the workflow has nothing saved (`offersTemplates`). */
  onOpenTemplatePicker?: () => void
  onExport?: () => void
  readOnly?: boolean
  /** Read-only because `?version=` names an older version than the latest. */
  olderVersion?: boolean
  /** That older version's number; missing when it is beyond the versions the page loaded. */
  readOnlyVersion?: number
  /** The viewer's role can't edit (a Viewer); the reason is theirs to read. */
  viewOnlyReason?: string
  /** The `?version=` being viewed, carried over to the code workspace link. */
  versionParam?: string
}

export function EditorToolbar({
  workflowId,
  isNew,
  workflowName,
  kind,
  currentVersion,
  nodeCount,
  isDirty,
  hasActiveDeployment,
  hasUndeployedChanges,
  deployedVersion,
  onSave,
  isSaving,
  lastSavedAt,
  saveError,
  saveConflict,
  onReload,
  reloading,
  onDeploy,
  onCheck,
  testRun,
  onOpenTemplatePicker,
  onExport,
  readOnly,
  olderVersion,
  readOnlyVersion,
  viewOnlyReason,
  versionParam,
}: EditorToolbarProps) {
  const switchView = useSwitchView(workflowId)
  const links = useWorkflowLinks(workflowId)
  const togglePalette = useCanvasLayoutStore((s) => s.togglePalette)
  const [envOpen, setEnvOpen] = useState(false)
  const canUndo = useTemporalStore((t) => t.pastStates.length > 0)
  const canRedo = useTemporalStore((t) => t.futureStates.length > 0)
  const isMac = isMacPlatform()
  const saveHint = isMac ? '⌘S' : 'Ctrl+S'
  const viewOnly = !!readOnly && !!viewOnlyReason
  const { toggle: handleToggleInspector } = useInspectorToggle()

  // The same chords the Code surface uses for its side bar and panel.
  useIdeShortcuts(
    {
      toggleExplorer: readOnly ? undefined : togglePalette,
      toggleDock: handleToggleInspector,
      // Nothing is stored for an unsaved canvas, so there are no variables to open.
      envVars: isNew ? undefined : handleOpenEnvVars,
    },
    CANVAS_SHORTCUT_LISTING,
  )

  // ?version= is carried only while actually viewing an older version. On
  // an editable canvas it names the version that is current *right now*,
  // which a save immediately supersedes — carrying it would land
  // Save-and-switch on a read-only version without the save in it.
  function handleOpenCode() {
    void switchView('ide', { version: readOnly ? versionParam : undefined })
  }

  function handleOpenEnvVars() {
    setEnvOpen(true)
  }

  function handleSelectView(view: EditorView) {
    if (view === 'code') handleOpenCode()
  }

  function handleOpenLatest() {
    void switchView('canvas')
  }

  // The panes' own toggles are in the status bar; the bar keeps the one that starts something.
  const toggles: TopBarToggle[] = [testRun]

  const blank = nodeCount === 0 && (isNew || currentVersion === 0)
  const reason = readOnlyReason({ viewOnlyReason, olderVersion })

  function saveTitle() {
    if (readOnly) return reason
    if (saveConflict) return 'Reload to continue'
    if (isSaving) return 'Saving…'
    if (!isDirty) return 'No changes to save'
    return `Save a new version (${saveHint})`
  }

  return (
    <>
      <UnifiedTopBar
        surface="canvas"
        name={workflowName}
        kind={kind}
        overviewHref={isNew ? undefined : links.overview}
        version={canvasTopBarVersion({
          isNew,
          currentVersion,
          olderVersion,
          readOnlyVersion,
          onBackToLatest: handleOpenLatest,
        })}
        nodeCount={nodeCount}
        deployBadge={
          hasActiveDeployment
            ? {
                ...deployBadge({
                  hasActiveDeployment,
                  hasUndeployedChanges,
                  deployedVersion,
                  currentVersion,
                })!,
                href: links.deployments,
              }
            : null
        }
        // A workflow that exists has files to write, saved version or not; only
        // an unsaved new one has no row for them. Switching away from a dirty
        // canvas is blocked, so this raises the switch dialog rather than
        // losing the graph.
        showViewSwitch={!isNew}
        onSelectView={handleSelectView}
        toggles={toggles}
        accessBadge={viewOnly ? { label: 'View only', title: viewOnlyReason } : undefined}
        extensions={
          <EditorExtensions slot="canvas.toolbar" workflowId={workflowId} canEdit={!readOnly} />
        }
        history={readOnly ? undefined : <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} />}
        saveStatus={
          readOnly ? undefined : (
            <SaveStatusIndicator
              isDirty={isDirty}
              isSaving={isSaving}
              lastSavedAt={lastSavedAt ?? null}
              saveError={saveError ?? null}
              conflict={saveConflict}
              onReload={onReload}
              reloading={reloading}
            />
          )
        }
        save={{
          label: 'Save',
          saving: isSaving,
          disabled: !!readOnly || isSaving || !isDirty || !!saveConflict,
          title: saveTitle(),
          onClick: onSave,
        }}
        deploy={{
          onClick: onDeploy,
          disabled: !!readOnly || blank,
          title: readOnly ? reason : blank ? BLANK_DEPLOY_REASON : 'Deploy',
        }}
        menu={canvasMenuGroups({
          readOnly: !!readOnly,
          isMac,
          canUndo,
          canRedo,
          nodeCount,
          onOpenEnvVars: handleOpenEnvVars,
          isNew,
          onOpenTemplatePicker,
          onExport,
          onCheck,
        })}
      />
      <EnvVarsDialog workflowId={workflowId} open={envOpen} onOpenChange={setEnvOpen} />
    </>
  )
}

/**
 * Undo/redo bound to the store's temporal history, enabled as edits land and
 * labeled with their shortcuts. When the bar has no room the same two live in the ⋯ menu.
 */
function UndoRedoButtons({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) {
  const isMac = isMacPlatform()
  return (
    <div className="hidden shrink-0 items-center gap-0.5 @[680px]:flex">
      <Button
        variant="ghost"
        size="sm"
        onClick={undoWithFeedback}
        disabled={!canUndo}
        title={`Undo (${isMac ? '⌘Z' : 'Ctrl+Z'})`}
        aria-label="Undo"
        className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={redoWithFeedback}
        disabled={!canRedo}
        title={`Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})`}
        aria-label="Redo"
        className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
