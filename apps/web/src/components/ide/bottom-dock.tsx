import { X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { Problem, ProblemGroups } from '../../lib/ide/problems'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import type { TestSessionState } from '../../hooks/use-test-session'
import { DockTabs, dockPanelId, dockTabId } from './dock-tabs'
import { ProblemsList } from './problems-list'
import { QuickTestPanel } from './quick-test-panel'
import { TestSessionPanel } from './test-session-panel'

interface BottomDockProps {
  workflowId: string
  /** Problems by when they were checked; owned by the workspace, which the status bar shares. */
  groups: ProblemGroups
  /** When the saved files were last checked ("14:01"), or null. */
  savedAt: string | null
  /**
   * Owned by the workspace, not by this component: the dock unmounts when it
   * is hidden, and holding the session here meant hiding it dropped the
   * stream and threw away the logs.
   */
  testSession: TestSessionState
  /** Saves every unsaved file; resolves to how many were written. */
  onSaveAll: () => Promise<number>
  /** The Trigger button: the workspace's one trigger, which asks when it should. */
  onTrigger: () => void
  /** The file in the editor, with unsaved edits applied — what Quick test runs. */
  activeFile: { path: string; source: string } | null
}

export function BottomDock({
  workflowId,
  groups,
  savedAt,
  testSession,
  activeFile,
  onSaveAll,
  onTrigger,
}: BottomDockProps) {
  const { dockTab, showDock, toggleDock } = useIdeLayoutStore(
    useShallow((s) => ({ dockTab: s.dockTab, showDock: s.showDock, toggleDock: s.toggleDock })),
  )
  const revealLocation = useIdeStore((s) => s.revealLocation)
  const hideHint = formatShortcut(IDE_SHORTCUTS.toggleDock, isMacPlatform())

  function handleProblemSelect(problem: Problem) {
    // A workflow-level finding has no file to reveal.
    if (!problem.file) return
    revealLocation({ path: problem.file, line: problem.line, column: problem.column })
  }

  // Esc hands the keyboard back to the editor. A dialog opened from here is
  // portaled, but React still bubbles its keys through this element, so only
  // keys that really came from inside the dock count — and one that a menu or
  // dialog already used (it called preventDefault) is not ours.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return
    useIdeStore.getState().editorHandle?.focus()
  }

  return (
    <div onKeyDown={handleKeyDown} className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <DockTabs
          active={dockTab}
          problemCount={groups.live.length + groups.saved.length}
          sessionRunning={testSession.session?.status === 'running'}
          onSelect={showDock}
        />
        <button
          type="button"
          onClick={toggleDock}
          title={`Hide panel (${hideHint})`}
          aria-label="Hide panel"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        role="tabpanel"
        id={dockPanelId(dockTab)}
        aria-labelledby={dockTabId(dockTab)}
        className="min-h-0 flex-1 overflow-auto"
      >
        {dockTab === 'problems' && (
          <ProblemsList groups={groups} savedAt={savedAt} onSelect={handleProblemSelect} />
        )}
        {dockTab === 'session' && (
          <TestSessionPanel session={testSession} onSaveAll={onSaveAll} onTrigger={onTrigger} />
        )}
        {dockTab === 'quickTest' && (
          <QuickTestPanel workflowId={workflowId} activeFile={activeFile} />
        )}
      </div>
    </div>
  )
}
