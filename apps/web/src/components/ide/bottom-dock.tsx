import { useMemo } from 'react'
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkspaceProblems } from '../../hooks/use-workspace-problems'
import {
  countBySeverity,
  diagnosticProblems,
  type Problem,
  type ProblemSeverity,
} from '../../lib/ide/problems'
import type { SourceDiagnostic } from '../../lib/api-client'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore, type DockTab } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { cn } from '../../lib/utils'
import type { TestSessionState } from '../../hooks/use-test-session'
import { OutputPanel } from './output-panel'
import { RunPanel } from './run-panel'

interface BottomDockProps {
  workflowId: string
  /** What the server found while producing this source, if anything. */
  diagnostics?: SourceDiagnostic[]
  /**
   * Owned by the workspace, not by this component: the dock unmounts when it
   * is hidden, and holding the session here meant hiding it dropped the
   * stream and threw away the logs.
   */
  testSession: TestSessionState
}

const TABS: { id: DockTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'run', label: 'Run' },
]

export function BottomDock({ workflowId, diagnostics, testSession }: BottomDockProps) {
  const { dockTab, showDock, toggleDock } = useIdeLayoutStore(
    useShallow((s) => ({ dockTab: s.dockTab, showDock: s.showDock, toggleDock: s.toggleDock })),
  )
  const revealLocation = useIdeStore((s) => s.revealLocation)
  const markers = useWorkspaceProblems(workflowId)
  // Server findings first: they explain the markers below them.
  const problems = useMemo(
    () => [...diagnosticProblems(diagnostics ?? []), ...markers],
    [diagnostics, markers],
  )
  const counts = countBySeverity(problems)
  const hideHint = formatShortcut(IDE_SHORTCUTS.toggleDock, isMacPlatform())

  function handleProblemSelect(problem: Problem) {
    // A workflow-level finding has no file to reveal.
    if (!problem.file) return
    revealLocation({ path: problem.file, line: problem.line, column: problem.column })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <div role="tablist" className="flex items-center gap-1">
          {TABS.map((tab) => (
            <DockTabButton
              key={tab.id}
              tab={tab.id}
              label={tab.label}
              active={dockTab === tab.id}
              badge={tab.id === 'problems' ? problems.length : 0}
              live={tab.id === 'run' && testSession.session?.status === 'running'}
              onSelect={showDock}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={toggleDock}
          title={`Hide panel (${hideHint})`}
          aria-label="Hide panel"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {dockTab === 'problems' && (
          <ProblemsList problems={problems} counts={counts} onSelect={handleProblemSelect} />
        )}
        {dockTab === 'output' && <OutputPanel entries={testSession.logs} />}
        {dockTab === 'run' && <RunPanel session={testSession} />}
      </div>
    </div>
  )
}

function DockTabButton({
  tab,
  label,
  active,
  badge,
  live,
  onSelect,
}: {
  tab: DockTab
  label: string
  active: boolean
  badge: number
  /** A session is running behind this tab, whether or not it is open. */
  live?: boolean
  onSelect: (tab: DockTab) => void
}) {
  function handleClick() {
    onSelect(tab)
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={handleClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground',
      )}
    >
      {label}
      {live && (
        <span
          aria-label="Test session running"
          className="h-1.5 w-1.5 rounded-full bg-status-success"
        />
      )}
      {badge > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-[10px] tabular-nums tracking-normal',
            active ? 'bg-muted/80 text-foreground' : 'bg-muted/50 text-muted-foreground',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

const SEVERITY_ICONS: Record<ProblemSeverity, { Icon: typeof CircleAlert; className: string }> = {
  error: { Icon: CircleAlert, className: 'text-status-error' },
  warning: { Icon: TriangleAlert, className: 'text-status-warning' },
  info: { Icon: Info, className: 'text-status-info' },
}

function ProblemsList({
  problems,
  counts,
  onSelect,
}: {
  problems: Problem[]
  counts: Record<ProblemSeverity, number>
  onSelect: (problem: Problem) => void
}) {
  if (problems.length === 0) {
    return (
      <DockEmptyState
        icon={CircleAlert}
        title="No problems detected"
        description="Diagnostics for open files appear here as you type."
      />
    )
  }

  return (
    <div className="py-1">
      <div className="px-3 pb-1 text-[11px] text-muted-foreground/60">
        {counts.error} error{counts.error === 1 ? '' : 's'}, {counts.warning} warning
        {counts.warning === 1 ? '' : 's'}
        {counts.info > 0 && `, ${counts.info} info`}
      </div>
      {problems.map((problem, index) => (
        <ProblemRow
          key={`${problem.file}:${problem.line}:${problem.column}:${index}`}
          problem={problem}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function ProblemRow({ problem, onSelect }: { problem: Problem; onSelect: (p: Problem) => void }) {
  const { Icon, className } = SEVERITY_ICONS[problem.severity]

  function handleClick() {
    onSelect(problem)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-start gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-muted/40"
    >
      <Icon className={cn('mt-px h-3.5 w-3.5 shrink-0', className)} />
      <span className="min-w-0 flex-1">
        <span className="text-foreground/90">{problem.message}</span>
        {problem.code && <span className="ml-1.5 text-muted-foreground/50">{problem.code}</span>}
        <span className="ml-2 font-mono text-muted-foreground/60">
          {problem.file}:{problem.line}:{problem.column}
        </span>
      </span>
    </button>
  )
}

function DockEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CircleAlert
  title: string
  description: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
      <Icon className="mb-1 h-5 w-5 text-muted-foreground/30" />
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground/60">{description}</p>
    </div>
  )
}
