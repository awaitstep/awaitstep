import {
  Command,
  Download,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Search,
  Variable,
} from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EnvVarsDialog } from '../workflows/env-vars-dialog'
import { IDE_SHORTCUTS, formatShortcut, type IdeShortcutId } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { exportWorkflowFile } from '../../lib/export-workflow'
import { deployBadge as buildDeployBadge, type DeployBadge } from '../../lib/workflows/deploy-badge'
import { useIdeShortcuts } from '../../hooks/use-ide-shortcuts'
import { useSwitchView } from '../../hooks/use-switch-view'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { TopBarMenuItem } from '../workflows/top-bar-menu'
import { UnifiedTopBar, type TopBarToggle, type TopBarVersion } from '../workflows/unified-top-bar'
import type { EditorView } from '../workflows/view-switch'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { readOnlyReason } from '../../lib/workflows/read-only-reason'

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
  /** What is deployed, if anything; the same pill the canvas shows. */
  deployState: Parameters<typeof buildDeployBadge>[0]
  /** Files with unsaved changes; drives the Save button and its badge. */
  dirtyCount: number
  canEdit: boolean
  /** The viewer's role can't edit (a Viewer); the reason is theirs to read. */
  viewOnlyReason?: string
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
  deployState,
  dirtyCount,
  canEdit,
  viewOnlyReason,
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
  const nodeCount = useWorkflowStore((s) => s.nodes.length)
  const isMac = isMacPlatform()
  const hint = (id: IdeShortcutId) => formatShortcut(IDE_SHORTCUTS[id], isMac)
  const switchView = useSwitchView(workflowId)
  const links = useWorkflowLinks(workflowId)
  const [envOpen, setEnvOpen] = useState(false)

  function handleOpenLatest() {
    void switchView('ide')
  }

  function handleSelectView(view: EditorView) {
    if (view === 'canvas') void switchView('canvas', { version: versionParam })
  }

  function handleEnvVars() {
    setEnvOpen(true)
  }

  useIdeShortcuts({ envVars: handleEnvVars })

  function handleQuickOpen() {
    showDialog('quickOpen')
  }

  function handlePalette() {
    showDialog('palette')
  }

  const badge = buildDeployBadge(deployState)
  const topBarVersion: TopBarVersion =
    historicalVersion !== undefined
      ? { kind: 'viewing', version: historicalVersion, onBackToLatest: handleOpenLatest }
      : version
        ? { kind: 'current', version }
        : { kind: 'blank' }

  function saveTitle() {
    if (!canEdit)
      return readOnlyReason({ viewOnlyReason, olderVersion: historicalVersion !== undefined })
    if (saving) return 'Saving…'
    if (dirtyCount === 0) return 'No unsaved files'
    return `Save all files (${hint('saveAll')}). ${hint('save')} saves the open file.`
  }

  const toggles: TopBarToggle[] = [
    {
      id: 'side-bar',
      icon: PanelLeft,
      pressed: explorerOpen,
      title: `${explorerOpen ? 'Hide' : 'Show'} side bar (${hint('toggleExplorer')})`,
      onClick: toggleExplorer,
    },
    {
      id: 'dock',
      icon: PanelBottom,
      pressed: dockOpen,
      title: `${dockOpen ? 'Hide' : 'Show'} panel (${hint('toggleDock')})`,
      onClick: toggleDock,
    },
    // The third pane takes the third panel icon, and a label: "preview of
    // what?" is not answerable from an icon.
    {
      id: 'preview',
      label: 'Preview',
      icon: PanelRight,
      pressed: previewOpen,
      title: `${previewOpen ? 'Hide' : 'Show'} canvas preview (${hint('togglePreview')})`,
      onClick: togglePreview,
    },
  ]

  const workflowActions: TopBarMenuItem[] = [
    // Variables belong to the workflow: a Viewer can look, and an older version has them too.
    {
      id: 'env-vars',
      label: 'Environment variables…',
      icon: Variable,
      onSelect: handleEnvVars,
      shortcut: hint('envVars'),
      takesFocus: true,
    },
    {
      id: 'export',
      label: 'Export',
      icon: Download,
      onSelect: exportWorkflowFile,
      disabled: nodeCount === 0,
      // The export is the saved workflow: the graph and its saved files.
      hint:
        nodeCount === 0
          ? 'Nothing to export yet'
          : dirtyCount > 0
            ? 'Without your unsaved file edits'
            : undefined,
    },
  ]
  const navigation: TopBarMenuItem[] = [
    {
      id: 'quick-open',
      label: 'Go to file',
      icon: Search,
      shortcut: hint('quickOpen'),
      onSelect: handleQuickOpen,
      takesFocus: true,
    },
    {
      id: 'palette',
      label: 'Command palette',
      icon: Command,
      shortcut: hint('commandPalette'),
      onSelect: handlePalette,
      takesFocus: true,
    },
  ]

  return (
    <>
      <UnifiedTopBar
        surface="code"
        name={workflowName}
        kind={kind}
        overviewHref={links.overview}
        version={topBarVersion}
        nodeCount={nodeCount}
        deployBadge={badge ? withHref(badge, links.deployments) : null}
        onSelectView={handleSelectView}
        toggles={toggles}
        accessBadge={viewOnlyReason ? { label: 'View only', title: viewOnlyReason } : undefined}
        save={{
          label: 'Save all',
          count: dirtyCount,
          saving,
          disabled: !canEdit || saving || dirtyCount === 0,
          title: saveTitle(),
          onClick: onSave,
        }}
        menu={[workflowActions, navigation]}
      />
      <EnvVarsDialog workflowId={workflowId} open={envOpen} onOpenChange={setEnvOpen} />
    </>
  )
}

function withHref(badge: DeployBadge, href: string) {
  return { ...badge, href }
}
