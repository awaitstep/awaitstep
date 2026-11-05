import { Link } from '@tanstack/react-router'
import {
  Settings2,
  Play,
  Rocket,
  Loader2,
  Save,
  LayoutTemplate,
  Terminal,
  Download,
  Check,
  AlertCircle,
  Circle,
  Undo2,
  Redo2,
  FileCode2,
} from 'lucide-react'
import { Button } from '../ui/button'
import { WorkflowTitle } from '../workflows/workflow-title'
import { WorkspaceChrome } from '../workflows/workspace-chrome'
import { cn } from '../../lib/utils'
import { useTemporalStore } from '../../stores/workflow-store'
import { redoWithFeedback, undoWithFeedback } from './time-travel'
import { useSwitchView } from '../../hooks/use-switch-view'

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
  showSettings: boolean
  onToggleSettings: () => void
  onSave: () => void
  isSaving: boolean
  lastSavedAt?: Date | null
  saveError?: string | null
  onDeploy: () => void
  onTest: () => void
  onTestLocally?: () => void
  /** Offered only while the workflow has nothing saved (`offersTemplates`). */
  onOpenTemplatePicker?: () => void
  onExport?: () => void
  readOnly?: boolean
  readOnlyVersion?: number
  /** The `?version=` being viewed, carried over to the code workspace link. */
  versionParam?: string
}

function SaveStatusIndicator({
  isDirty,
  isSaving,
  lastSavedAt,
  saveError,
}: {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  saveError: string | null
}) {
  if (isSaving) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title="Saving…"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Saving…</span>
      </span>
    )
  }
  if (saveError && isDirty) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive" title={saveError}>
        <AlertCircle className="h-3 w-3" />
        <span className="hidden sm:inline">Couldn&apos;t save</span>
      </span>
    )
  }
  if (isDirty) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-status-warning"
        title="Unsaved changes"
      >
        <Circle className="h-2 w-2 fill-status-warning text-status-warning" />
        <span className="hidden sm:inline">Unsaved</span>
      </span>
    )
  }
  if (lastSavedAt) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title={`Saved at ${lastSavedAt.toLocaleTimeString()}`}
      >
        <Check className="h-3 w-3 text-status-success" />
        <span className="hidden sm:inline">Saved</span>
      </span>
    )
  }
  return null
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
  showSettings,
  onToggleSettings,
  onSave,
  isSaving,
  lastSavedAt,
  saveError,
  onDeploy,
  onTest,
  onTestLocally,
  onOpenTemplatePicker,
  onExport,
  readOnly,
  readOnlyVersion,
  versionParam,
}: EditorToolbarProps) {
  const switchView = useSwitchView(workflowId)

  // ?version= is carried only while actually viewing an older version. On
  // an editable canvas it names the version that is current *right now*,
  // which a save immediately supersedes — carrying it would land
  // Save-and-switch on a read-only version without the save in it.
  function handleOpenCode() {
    void switchView('ide', { version: readOnly ? versionParam : undefined })
  }

  function handleOpenLatest() {
    void switchView('canvas')
  }

  const title = (
    <WorkflowTitle name={workflowName} kind={kind} version={isNew ? undefined : currentVersion}>
      {nodeCount > 0 && (
        <span className="hidden shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary md:inline-flex">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}
        </span>
      )}
      {hasActiveDeployment && (
        <Link
          to="/workflows/$workflowId/deployments"
          params={{ workflowId }}
          className={cn(
            'hidden shrink-0 rounded px-1.5 py-0.5 text-xs font-medium transition-colors md:inline-block',
            hasUndeployedChanges
              ? 'bg-status-warning/10 text-status-warning hover:bg-status-warning/20'
              : 'bg-status-success/10 text-status-success hover:bg-status-success/20',
          )}
        >
          {hasUndeployedChanges
            ? `deployed v${deployedVersion ?? '?'} · v${currentVersion} unsaved`
            : `deployed v${currentVersion}`}
        </Link>
      )}
      <SaveStatusIndicator
        isDirty={isDirty}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt ?? null}
        saveError={saveError ?? null}
      />
    </WorkflowTitle>
  )

  return (
    <WorkspaceChrome
      title={title}
      actions={
        <>
          {/* Nothing to show source for until the workflow has been saved
              once. Switching away from a dirty canvas is blocked, so this
              raises the switch dialog rather than losing the graph. */}
          {!isNew && currentVersion > 0 && (
            <button
              type="button"
              onClick={handleOpenCode}
              title="Open the code workspace"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground/70 md:px-2.5"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span className="hidden text-xs md:inline">Code</span>
            </button>
          )}
          {readOnly ? (
            <>
              <span className="hidden rounded bg-muted/70 px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-block">
                Read-only{readOnlyVersion ? ` · v${readOnlyVersion}` : ''}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-3 text-xs"
                onClick={handleOpenLatest}
              >
                <span className="hidden sm:inline">Back to latest</span>
                <span className="sm:hidden">Latest</span>
              </Button>
            </>
          ) : (
            <>
              <UndoRedoButtons />
              <Button
                variant="ghost"
                size="sm"
                onClick={onSave}
                disabled={isSaving || !isDirty}
                title="Save (⌘↵)"
                className={cn(
                  'h-8 gap-1.5 px-2 md:px-2.5',
                  isDirty ? 'text-foreground/70 hover:text-foreground' : 'text-muted-foreground/60',
                )}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span className="hidden text-xs md:inline">Save</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSettings}
                title="Settings"
                className={cn(
                  'hidden h-8 gap-1.5 px-2 sm:inline-flex md:px-2.5',
                  showSettings
                    ? 'bg-muted/70 text-foreground'
                    : 'text-muted-foreground hover:text-foreground/70',
                )}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden text-xs md:inline">Settings</span>
              </Button>
              {onOpenTemplatePicker && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Templates"
                  className="hidden h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground/70 sm:inline-flex md:px-2.5"
                  onClick={onOpenTemplatePicker}
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  <span className="hidden text-xs md:inline">Templates</span>
                </Button>
              )}
              {onExport && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Export"
                  className="hidden h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground/70 sm:inline-flex md:px-2.5"
                  onClick={onExport}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden text-xs md:inline">Export</span>
                </Button>
              )}
              <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
              <Button
                variant="ghost"
                size="sm"
                title="Test"
                className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground/80 md:px-2.5"
                onClick={onTest}
              >
                <Play className="h-3.5 w-3.5" />
                <span className="hidden text-xs md:inline">Test</span>
              </Button>
              {onTestLocally && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Local test"
                  className="hidden h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground/80 sm:inline-flex md:px-2.5"
                  onClick={onTestLocally}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span className="hidden text-xs md:inline">Local</span>
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 gap-1.5 px-2.5 md:px-3"
                onClick={onDeploy}
                title="Deploy"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span className="hidden text-xs sm:inline">Deploy</span>
              </Button>
            </>
          )}
        </>
      }
    />
  )
}

/**
 * Undo/redo buttons bound to the store's temporal history. Subscribed to
 * the history depths so they enable and disable as edits land, and labeled
 * with their shortcuts for discoverability.
 */
function UndoRedoButtons() {
  const canUndo = useTemporalStore((t) => t.pastStates.length > 0)
  const canRedo = useTemporalStore((t) => t.futureStates.length > 0)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={undoWithFeedback}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        className="h-8 px-2 text-muted-foreground/70 hover:text-foreground"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={redoWithFeedback}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
        className="h-8 px-2 text-muted-foreground/70 hover:text-foreground"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </>
  )
}
