import { RunStatusBadge } from '../monitoring/run-status-badge'
import { RunDetailSheet } from '../monitoring/run-detail-sheet'
import type { RunSummary } from '../../lib/api-client'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useSheetStore } from '../../stores/sheet-store'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'
import { NO_RUNS_MESSAGE } from '../monitoring/no-runs-copy'
import { RouterShellLink } from '../navigation/router-shell-link'

interface RecentRunsProps {
  workflowId: string
  runs: RunSummary[]
}

const SHOWN = 8
const ROW_CLASS =
  'flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/30'

export function RecentRuns({ workflowId, runs }: RecentRunsProps) {
  const { openRunSheet } = useSheetStore()
  // In a workspace a run opens as its own page; the old pages open the sheet.
  const inWorkspace = useEditorScope() !== null
  const links = useWorkflowLinks(workflowId)
  const shown = runs.slice(0, SHOWN)

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/70">Recent Runs</h2>
        {runs.length > 0 && (
          <RouterShellLink
            href={links.runs}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
          >
            View all
          </RouterShellLink>
        )}
      </div>
      {runs.length > 0 ? (
        <div className="mt-3 rounded-md border border-border">
          {shown.map((run, i) => {
            const className = cn(ROW_CLASS, i < shown.length - 1 && 'border-b border-border')
            const content = (
              <>
                <div className="flex items-center gap-3">
                  <RunStatusBadge status={run.status} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {run.instanceId.slice(0, 12)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground/60">{timeAgo(run.createdAt)}</span>
              </>
            )
            return inWorkspace ? (
              <RouterShellLink key={run.id} href={links.run(run.id)} className={className}>
                {content}
              </RouterShellLink>
            ) : (
              <button
                key={run.id}
                type="button"
                onClick={() => openRunSheet({ runId: run.id, workflowId })}
                className={className}
              >
                {content}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {NO_RUNS_MESSAGE}
        </div>
      )}
      {!inWorkspace && <RunDetailSheet />}
    </section>
  )
}
