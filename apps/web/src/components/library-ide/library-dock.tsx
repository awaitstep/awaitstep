import { useMemo } from 'react'
import { X } from 'lucide-react'
import { groupProblems, type Problem } from '../../lib/ide/problems'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { DockTabs, dockPanelId, dockTabId } from '../ide/dock-tabs'
import { ProblemsList } from '../ide/problems-list'
import { Button } from '../ui/button'

const LIBRARY_DOCK_TABS = [{ id: 'problems', label: 'Problems' }] as const

function noop() {}

interface LibraryDockProps {
  live: Problem[]
  saved: Problem[]
  dirty: ReadonlySet<string>
}

/**
 * The bottom panel (28d's strip): Problems, with its count and Hide. Run
 * and Quick test come later.
 * As-you-type markers above, the publish check's findings about the saved
 * files below.
 */
export function LibraryDock({ live, saved, dirty }: LibraryDockProps) {
  const revealLocation = useIdeStore((s) => s.revealLocation)
  const toggleDock = useIdeLayoutStore((s) => s.toggleDock)
  const groups = useMemo(() => groupProblems(live, saved, dirty), [live, saved, dirty])

  function handleSelect(problem: Problem) {
    if (!problem.file) return
    revealLocation({ path: problem.file, line: problem.line, column: problem.column })
  }

  return (
    <section aria-label="Problems" className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <DockTabs
          tabs={LIBRARY_DOCK_TABS}
          active="problems"
          problemCount={live.length + saved.length}
          sessionRunning={false}
          onSelect={noop}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleDock}
          title={`Hide panel (${formatShortcut(IDE_SHORTCUTS.toggleDock, isMacPlatform())})`}
          aria-label="Hide panel"
          className="size-6 text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <div
        role="tabpanel"
        id={dockPanelId('problems')}
        aria-labelledby={dockTabId('problems')}
        className="min-h-0 flex-1 overflow-auto"
      >
        <ProblemsList groups={groups} savedAt={null} onSelect={handleSelect} />
      </div>
    </section>
  )
}
