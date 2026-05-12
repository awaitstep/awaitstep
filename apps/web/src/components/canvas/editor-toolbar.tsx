import { Link, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  Code2,
  PanelRightClose,
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
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

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
  showEditor: boolean
  onToggleEditor: () => void
  onSave: () => void
  isSaving: boolean
  lastSavedAt?: Date | null
  autoSaveError?: string | null
  onDeploy: () => void
  onTest: () => void
  onTestLocally?: () => void
  onOpenTemplatePicker: () => void
  onExport?: () => void
  readOnly?: boolean
  readOnlyVersion?: number
}

function SaveStatusIndicator({
  isDirty,
  isSaving,
  lastSavedAt,
  autoSaveError,
}: {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  autoSaveError: string | null
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
  if (autoSaveError && isDirty) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-destructive"
        title={autoSaveError}
      >
        <AlertCircle className="h-3 w-3" />
        <span className="hidden sm:inline">Couldn&apos;t auto-save</span>
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
  showEditor,
  onToggleEditor,
  onSave,
  isSaving,
  lastSavedAt,
  autoSaveError,
  onDeploy,
  onTest,
  onTestLocally,
  onOpenTemplatePicker,
  onExport,
  readOnly,
  readOnlyVersion,
}: EditorToolbarProps) {
  const router = useRouter()

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground/80"
          onClick={() => router.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
        <div className="flex min-w-0 items-center gap-1.5 px-1 sm:gap-2">
          <span className="max-w-[120px] truncate text-sm font-semibold text-foreground sm:max-w-[200px] md:max-w-[260px] lg:max-w-none">
            {workflowName}
          </span>
          {kind === 'script' && (
            <span
              className="hidden shrink-0 items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex"
              title="Stateless fetch-only Worker — runs synchronously, no sleeps or waits"
            >
              Function
            </span>
          )}
          {!isNew && currentVersion > 0 && (
            <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground/60">
              v{currentVersion}
            </span>
          )}
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
            autoSaveError={autoSaveError ?? null}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        {readOnly ? (
          <>
            <span className="hidden rounded bg-muted/70 px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-block">
              Read-only{readOnlyVersion ? ` · v${readOnlyVersion}` : ''}
            </span>
            <Link to="/workflows/$workflowId/canvas" params={{ workflowId }}>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs">
                <span className="hidden sm:inline">Back to latest</span>
                <span className="sm:hidden">Latest</span>
              </Button>
            </Link>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSave}
              disabled={isSaving || !isDirty}
              title="Save"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleEditor}
              title={showEditor ? 'Hide editor' : 'Show editor'}
              className={cn(
                'hidden h-8 gap-1.5 px-2 sm:inline-flex md:px-2.5',
                showEditor
                  ? 'bg-muted/70 text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              {showEditor ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <Code2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden text-xs md:inline">Editor</span>
            </Button>
            {isNew && kind !== 'script' && (
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
      </div>
    </header>
  )
}
