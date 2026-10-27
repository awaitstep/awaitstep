import { timeAgoOrDay } from '../../lib/time'
import type { FunctionTraffic, WorkspaceItem } from '../../types/dashboard/items'
import { RESULT_LABEL } from '../runs/run-format'
import type { RunOutcome } from '../ui/run-history-bars'

// How a workspace's workflows and functions read on their lists, in the
// boards' words: "Deployed · v12", "Failed 5m ago", "2,140 req · 0.2% errors".

export type WorkflowFilter = 'all' | 'deployed' | 'draft' | 'failing'

/** Its latest finished run failed. */
export function isFailing(item: WorkspaceItem): boolean {
  return item.lastRun?.result === 'failed'
}

export function matchesFilter(item: WorkspaceItem, filter: WorkflowFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'failing') return isFailing(item)
  return item.status === filter
}

export function filterCounts(items: WorkspaceItem[]): Record<WorkflowFilter, number> {
  const count = (filter: WorkflowFilter) => items.filter((i) => matchesFilter(i, filter)).length
  return {
    all: items.length,
    deployed: count('deployed'),
    draft: count('draft'),
    failing: count('failing'),
  }
}

/** The status pill's look: green once deployed. */
export function statusVariant(item: Pick<WorkspaceItem, 'status'>): 'success' | 'neutral' {
  return item.status === 'deployed' ? 'success' : 'neutral'
}

/** "Deployed · v12", or "Draft". */
export function statusLabel(item: Pick<WorkspaceItem, 'status' | 'version'>): string {
  return item.status === 'deployed' && item.version !== null
    ? `Deployed · v${item.version}`
    : 'Draft'
}

/** "Failed 5m ago", "Succeeded 22m ago", or "Never run". */
export function lastRunLabel(item: WorkspaceItem, now: Date = new Date()): string {
  if (!item.lastRun) return 'Never run'
  return `${RESULT_LABEL[item.lastRun.result]} ${timeAgoOrDay(item.lastRun.at, now)}`
}

/** The finished runs among the last ten, for `RunHistoryBars`. */
export function runOutcomes(item: WorkspaceItem): RunOutcome[] {
  return item.recentRuns.flatMap((result): RunOutcome[] =>
    result === 'succeeded' ? ['ok'] : result === 'failed' ? ['fail'] : [],
  )
}

/** "2,140 req · 0.2% errors", "312 req · 0 errors". */
export function trafficLabel(traffic: FunctionTraffic): string {
  const requests = `${traffic.requests.toLocaleString('en-US')} req`
  if (traffic.errorRate === 0) return `${requests} · 0 errors`
  const percent = Math.round(traffic.errorRate * 1000) / 10
  return `${requests} · ${percent}% errors`
}

/** A function's second line: "POST /crm/sync · updates leads from the CRM". */
export function functionSummary(item: Pick<WorkspaceItem, 'route' | 'description'>): string {
  const description = item.description
    ? item.description.charAt(0).toLowerCase() + item.description.slice(1)
    : null
  return [item.route, description].filter(Boolean).join(' · ')
}
