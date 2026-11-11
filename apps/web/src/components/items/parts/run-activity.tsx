import { cn } from '../../../lib/utils'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { RunHistoryBars } from '../../ui/run-history-bars'
import { isFailing, lastRunLabel, runOutcomes } from '../item-format'

/** The activity column of a workflow or function row: its last ten runs and latest result. */
export function RunActivity({ item }: { item: WorkspaceItem }) {
  const failing = isFailing(item)
  return (
    <>
      <RunHistoryBars runs={runOutcomes(item)} />
      <span className={cn('text-2xs', failing ? 'text-status-error' : 'text-muted-foreground')}>
        {lastRunLabel(item)}
      </span>
    </>
  )
}
