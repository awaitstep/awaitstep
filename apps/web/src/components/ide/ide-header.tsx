import { Link, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  Command,
  FileCode2,
  History,
  Loader2,
  PanelBottom,
  PanelLeft,
  Save,
  Search,
  Workflow,
} from 'lucide-react'
import type { SourceMode } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import { IDE_SHORTCUTS, formatShortcut, type IdeShortcutId } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { WorkflowTitle } from '../workflows/workflow-title'
import { cn } from '../../lib/utils'
import { SourceModeBadge } from './source-mode-badge'

interface IdeHeaderProps {
  workflowId: string
  workflowName: string
  kind?: 'workflow' | 'script'
  /** The version whose source is loaded (not necessarily the latest). */
  version?: number
  /** Set when `?version=` points at an older version than the current one. */
  historicalVersion?: number
  sourceMode?: SourceMode
  versionParam?: string
  /** Files with unsaved changes; drives the Save button and its badge. */
  dirtyCount: number
  canEdit: boolean
  saving: boolean
  onSave: () => void
}

export function IdeHeader({
  workflowId,
  workflowName,
  kind,
  version,
  historicalVersion,
  sourceMode,
  versionParam,
  dirtyCount,
  canEdit,
  saving,
  onSave,
}: IdeHeaderProps) {
  const router = useRouter()
  const { explorerOpen, dockOpen, toggleExplorer, toggleDock } = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      toggleExplorer: s.toggleExplorer,
      toggleDock: s.toggleDock,
    })),
  )
  const showDialog = useIdeStore((s) => s.showDialog)
  const isMac = isMacPlatform()
  const hint = (id: IdeShortcutId) => formatShortcut(IDE_SHORTCUTS[id], isMac)

  function handleBack() {
    router.history.back()
  }

  function handleQuickOpen() {
    showDialog('quickOpen')
  }

  function handlePalette() {
    showDialog('palette')
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground/80"
          onClick={handleBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
        <WorkflowTitle name={workflowName} kind={kind} version={version}>
          {sourceMode && <SourceModeBadge mode={sourceMode} className="hidden sm:inline-block" />}
          {historicalVersion !== undefined && (
            <Link
              to="/workflows/$workflowId/code"
              params={{ workflowId }}
              search={{}}
              title="You are viewing an older version — open the latest"
              className="hidden shrink-0 items-center gap-1 rounded bg-status-warning/10 px-1.5 py-0.5 text-xs font-medium text-status-warning transition-colors hover:bg-status-warning/20 md:inline-flex"
            >
              <History className="h-3 w-3" />
              Viewing v{historicalVersion} · back to latest
            </Link>
          )}
        </WorkflowTitle>
      </div>

      <SurfaceSwitch workflowId={workflowId} versionParam={versionParam} />

      <div className="flex flex-1 shrink-0 items-center justify-end gap-1">
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={saving || dirtyCount === 0}
            title={`Save (${hint('save')})`}
            className={cn(
              'h-8 gap-1.5 px-2 md:px-2.5',
              dirtyCount > 0
                ? 'text-foreground/70 hover:text-foreground'
                : 'text-muted-foreground/60',
            )}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span className="hidden text-xs md:inline">Save</span>
            {dirtyCount > 0 && (
              <span className="rounded-full bg-status-warning/15 px-1.5 py-px text-[10px] tabular-nums text-status-warning">
                {dirtyCount}
              </span>
            )}
          </Button>
        )}
        <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
        <HeaderToggle
          active={explorerOpen}
          title={`${explorerOpen ? 'Hide' : 'Show'} explorer (${hint('toggleExplorer')})`}
          onClick={toggleExplorer}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </HeaderToggle>
        <HeaderToggle
          active={dockOpen}
          title={`${dockOpen ? 'Hide' : 'Show'} panel (${hint('toggleDock')})`}
          onClick={toggleDock}
        >
          <PanelBottom className="h-3.5 w-3.5" />
        </HeaderToggle>
        <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
        <HeaderToggle title={`Go to file (${hint('quickOpen')})`} onClick={handleQuickOpen}>
          <Search className="h-3.5 w-3.5" />
        </HeaderToggle>
        <HeaderToggle title={`Command palette (${hint('commandPalette')})`} onClick={handlePalette}>
          <Command className="h-3.5 w-3.5" />
        </HeaderToggle>
      </div>
    </header>
  )
}

/** Canvas ↔ Code: the two editing surfaces of the same workflow. */
function SurfaceSwitch({
  workflowId,
  versionParam,
}: {
  workflowId: string
  versionParam?: string
}) {
  const itemClass =
    'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors'
  return (
    <nav
      aria-label="Editing surface"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5"
    >
      <Link
        to="/workflows/$workflowId/canvas"
        params={{ workflowId }}
        search={versionParam ? { version: versionParam } : {}}
        className={cn(itemClass, 'text-muted-foreground hover:text-foreground')}
      >
        <Workflow className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Canvas</span>
      </Link>
      <span aria-current="page" className={cn(itemClass, 'bg-card text-foreground shadow-sm')}>
        <FileCode2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Code</span>
      </span>
    </nav>
  )
}

function HeaderToggle({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'h-8 w-8 px-0',
        active ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground/70',
      )}
    >
      {children}
    </Button>
  )
}
