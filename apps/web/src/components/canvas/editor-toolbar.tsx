import { useState } from 'react'
import { Link } from '@tanstack/react-router'
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
  MoreVertical,
  Trash2,
  CloudOff,
  LayoutTemplate,
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export interface EditorToolbarProps {
  workflowId: string
  isNew: boolean
  workflowName: string
  currentVersion: number
  nodeCount: number
  isDirty: boolean
  hasActiveDeployment: boolean
  hasUndeployedChanges: boolean | string | undefined
  deployedVersion: number | undefined
  showSettings: boolean
  onToggleSettings: () => void
  showCode: boolean
  onToggleCode: () => void
  onSave: () => void
  isSaving: boolean
  onDeploy: () => void
  onTest: () => void
  onTrigger: () => void
  onDelete: () => void
  onTakedown: () => void
  onOpenTemplatePicker: () => void
}

export function EditorToolbar({
  workflowId,
  isNew,
  workflowName,
  currentVersion,
  nodeCount,
  isDirty,
  hasActiveDeployment,
  hasUndeployedChanges,
  deployedVersion,
  showSettings,
  onToggleSettings,
  showCode,
  onToggleCode,
  onSave,
  isSaving,
  onDeploy,
  onTest,
  onTrigger,
  onDelete,
  onTakedown,
  onOpenTemplatePicker,
}: EditorToolbarProps) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <Link to={isNew ? '/dashboard' : '/workflows/$workflowId'} params={isNew ? undefined : { workflowId }}>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground/80">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="h-5 w-px bg-muted/70" />
        <div className="flex items-center gap-2 px-1">
          <span className="text-[13px] font-semibold text-foreground">{workflowName}</span>
          {!isNew && currentVersion > 0 && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
              v{currentVersion}
            </span>
          )}
          {nodeCount > 0 && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {nodeCount} node{nodeCount !== 1 ? 's' : ''}
            </span>
          )}
          {hasActiveDeployment && (
            <Link
              to="/workflows/$workflowId/deployments"
              params={{ workflowId }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                hasUndeployedChanges
                  ? 'bg-amber-500/10 text-status-warning hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 text-status-success hover:bg-emerald-500/20'
              }`}
            >
              {hasUndeployedChanges
                ? `deployed v${deployedVersion ?? '?'} · v${currentVersion} unsaved`
                : `deployed v${currentVersion}`}
            </Link>
          )}
          {isDirty && (
            <Circle className="h-2 w-2 fill-status-warning text-status-warning" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
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
          size="icon"
          onClick={onToggleSettings}
          className={cn(
            'h-8 w-8',
            showSettings ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground/70',
          )}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCode}
          className={cn(
            'h-8 gap-1.5 px-2.5',
            showCode ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground/70',
          )}
        >
          {showCode ? <PanelRightClose className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
          <span className="text-xs">Code</span>
        </Button>
        {isNew && (
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
        <div className="h-5 w-px bg-muted/70" />
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/80" onClick={onTest}>
          <Play className="h-3.5 w-3.5" />
          <span className="text-xs">Test</span>
        </Button>
        <Button size="sm" className="h-8 gap-1.5 px-3" onClick={onDeploy}>
          <Rocket className="h-3.5 w-3.5" />
          <span className="text-xs">Deploy</span>
        </Button>
        {hasActiveDeployment && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-status-success/70 hover:text-status-success"
            onClick={onTrigger}
          >
            <Play className="h-3.5 w-3.5" />
            <span className="text-xs">Trigger</span>
          </Button>
        )}
        {(!isNew || hasActiveDeployment) && <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground/70"
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-xl">
                {hasActiveDeployment && (
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-status-warning hover:bg-muted/60"
                    onClick={() => { setShowMenu(false); onTakedown() }}
                  >
                    <CloudOff className="h-4 w-4" />
                    Take down deployment
                  </button>
                )}
                {!isNew && (
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-status-error hover:bg-muted/60"
                    onClick={() => { setShowMenu(false); onDelete() }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete workflow
                  </button>
                )}
              </div>
            </>
          )}
        </div>}
      </div>
    </header>
  )
}
