import {
  Command,
  History,
  Loader2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Save,
  Search,
  Workflow,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { IDE_SHORTCUTS, formatShortcut, type IdeShortcutId } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useSwitchView } from '../../hooks/use-switch-view'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { WorkflowTitle } from '../workflows/workflow-title'
import { WorkspaceChrome } from '../workflows/workspace-chrome'
import { cn } from '../../lib/utils'

interface IdeHeaderProps {
  workflowId: string
  workflowName: string
  kind?: 'workflow' | 'script'
  /** The version whose source is loaded (not necessarily the latest). */
  version?: number
  /** Set when `?version=` points at an older version than the current one. */
  historicalVersion?: number
  /** Carried across so the canvas opens the same version being read here. */
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
  versionParam,
  dirtyCount,
  canEdit,
  saving,
  onSave,
}: IdeHeaderProps) {
  const { explorerOpen, dockOpen, previewOpen, toggleExplorer, toggleDock, togglePreview } =
    useIdeLayoutStore(
      useShallow((s) => ({
        explorerOpen: s.explorerOpen,
        dockOpen: s.dockOpen,
        previewOpen: s.previewOpen,
        toggleExplorer: s.toggleExplorer,
        toggleDock: s.toggleDock,
        togglePreview: s.togglePreview,
      })),
    )
  const showDialog = useIdeStore((s) => s.showDialog)
  const isMac = isMacPlatform()
  const hint = (id: IdeShortcutId) => formatShortcut(IDE_SHORTCUTS[id], isMac)
  const switchView = useSwitchView(workflowId)

  function handleOpenLatest() {
    void switchView('ide')
  }

  function handleOpenCanvas() {
    void switchView('canvas', { version: versionParam })
  }

  function handleQuickOpen() {
    showDialog('quickOpen')
  }

  function handlePalette() {
    showDialog('palette')
  }

  const title = (
    <WorkflowTitle name={workflowName} kind={kind} version={version}>
      {historicalVersion !== undefined && (
        <button
          type="button"
          onClick={handleOpenLatest}
          title="You are viewing an older version — open the latest"
          className="hidden shrink-0 items-center gap-1 rounded bg-status-warning/10 px-1.5 py-0.5 text-xs font-medium text-status-warning transition-colors hover:bg-status-warning/20 md:inline-flex"
        >
          <History className="h-3 w-3" />
          Viewing v{historicalVersion} · back to latest
        </button>
      )}
    </WorkflowTitle>
  )

  return (
    <WorkspaceChrome
      title={title}
      actions={
        <>
          {/* Mirrors the canvas header's Code button, in the same slot. The
              preview carries its own way over, but it can be closed — and
              then the command palette was the only route left. */}
          <button
            type="button"
            onClick={handleOpenCanvas}
            title="Open the canvas, where the graph can be edited"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground/70 md:px-2.5"
          >
            <Workflow className="h-3.5 w-3.5" />
            <span className="hidden text-xs md:inline">Canvas</span>
          </button>
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
          {/* The third pane, so it takes the third panel icon — and a label,
              because "preview of what?" is not answerable from an icon. */}
          <HeaderToggle
            active={previewOpen}
            label="Preview"
            title={`${previewOpen ? 'Hide' : 'Show'} canvas preview (${hint('togglePreview')})`}
            onClick={togglePreview}
          >
            <PanelRight className="h-3.5 w-3.5" />
          </HeaderToggle>
          <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
          <HeaderToggle title={`Go to file (${hint('quickOpen')})`} onClick={handleQuickOpen}>
            <Search className="h-3.5 w-3.5" />
          </HeaderToggle>
          <HeaderToggle
            title={`Command palette (${hint('commandPalette')})`}
            onClick={handlePalette}
          >
            <Command className="h-3.5 w-3.5" />
          </HeaderToggle>
        </>
      }
    />
  )
}

function HeaderToggle({
  active,
  label,
  title,
  onClick,
  children,
}: {
  active?: boolean
  /** Shown beside the icon on wider screens; icon-only without it. */
  label?: string
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
        'h-8',
        label ? 'gap-1.5 px-2 md:px-2.5' : 'w-8 px-0',
        active ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground/70',
      )}
    >
      {children}
      {label && <span className="hidden text-xs md:inline">{label}</span>}
    </Button>
  )
}
