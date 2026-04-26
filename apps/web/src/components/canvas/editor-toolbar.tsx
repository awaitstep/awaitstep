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
  Circle,
  LayoutTemplate,
  Terminal,
  Download,
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
  onDeploy: () => void
  onTest: () => void
  onTestLocally?: () => void
  onOpenTemplatePicker: () => void
  onExport?: () => void
  readOnly?: boolean
  readOnlyVersion?: number
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
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground/80"
          onClick={() => router.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-5 w-px bg-muted/70" />
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm font-semibold text-foreground">{workflowName}</span>
          {kind === 'script' && (
            <span
              className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Stateless fetch-only Worker — runs synchronously, no sleeps or waits"
            >
              Function
            </span>
          )}
          {!isNew && currentVersion > 0 && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground/60">
              v{currentVersion}
            </span>
          )}
          {nodeCount > 0 && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              {nodeCount} node{nodeCount !== 1 ? 's' : ''}
            </span>
          )}
          {hasActiveDeployment && (
            <Link
              to="/workflows/$workflowId/deployments"
              params={{ workflowId }}
              className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                hasUndeployedChanges
                  ? 'bg-status-warning/10 text-status-warning hover:bg-status-warning/20'
                  : 'bg-status-success/10 text-status-success hover:bg-status-success/20'
              }`}
            >
              {hasUndeployedChanges
                ? `deployed v${deployedVersion ?? '?'} · v${currentVersion} unsaved`
                : `deployed v${currentVersion}`}
            </Link>
          )}
          {isDirty && <Circle className="h-2 w-2 fill-status-warning text-status-warning" />}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {readOnly ? (
          <>
            <span className="rounded bg-muted/70 px-2 py-1 text-xs font-medium text-muted-foreground">
              Read-only{readOnlyVersion ? ` · v${readOnlyVersion}` : ''}
            </span>
            <Link to="/workflows/$workflowId/canvas" params={{ workflowId }}>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs">
                Back to latest
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
              className={cn(
                'h-8 gap-1.5 px-2.5',
                isDirty ? 'text-foreground/70 hover:text-foreground' : 'text-muted-foreground/60',
              )}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">Save</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSettings}
              className={cn(
                showSettings
                  ? 'bg-muted/70 text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="text-xs">Settings</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleEditor}
              className={cn(
                'h-8 gap-1.5 px-2.5',
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
              <span className="text-xs">Editor</span>
            </Button>
            {isNew && kind !== 'script' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/70"
                onClick={onOpenTemplatePicker}
              >
                <LayoutTemplate className="h-3.5 w-3.5" />
                <span className="text-xs">Templates</span>
              </Button>
            )}
            {onExport && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/70"
                onClick={onExport}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="text-xs">Export</span>
              </Button>
            )}
            <div className="h-5 w-px bg-muted/70" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/80"
              onClick={onTest}
            >
              <Play className="h-3.5 w-3.5" />
              <span className="text-xs">Test</span>
            </Button>
            {onTestLocally && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/80"
                onClick={onTestLocally}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span className="text-xs">Local</span>
              </Button>
            )}
            <Button size="sm" className="h-8 gap-1.5 px-3" onClick={onDeploy}>
              <Rocket className="h-3.5 w-3.5" />
              <span className="text-xs">Deploy</span>
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
