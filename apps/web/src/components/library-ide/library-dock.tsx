import { useMemo } from 'react'
import { groupProblems, type Problem } from '../../lib/ide/problems'
import { useIdeStore } from '../../stores/ide-store'
import { ProblemsList } from '../ide/problems-list'

interface LibraryDockProps {
  live: Problem[]
  saved: Problem[]
  dirty: ReadonlySet<string>
}

/**
 * The bottom panel: Problems only (28d's Run and Quick test come later).
 * As-you-type markers above, the publish check's findings about the saved
 * files below.
 */
export function LibraryDock({ live, saved, dirty }: LibraryDockProps) {
  const revealLocation = useIdeStore((s) => s.revealLocation)
  const groups = useMemo(() => groupProblems(live, saved, dirty), [live, saved, dirty])

  function handleSelect(problem: Problem) {
    if (!problem.file) return
    revealLocation({ path: problem.file, line: problem.line, column: problem.column })
  }

  return (
    <section aria-label="Problems" className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-8 shrink-0 items-center border-b border-border px-3 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Problems ({live.length + saved.length})
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ProblemsList groups={groups} savedAt={null} onSelect={handleSelect} />
      </div>
    </section>
  )
}
