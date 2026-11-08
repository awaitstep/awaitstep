import type { ItemKind, SharedItem, WorkspaceItem } from '../../types/dashboard/items'
import type { WorkspaceRun } from '../../types/dashboard/runs'

// What the workspace Overview (`WsOverview`) derives from the lists it
// already loads; no endpoint of its own.

export interface AttentionItem {
  item: { id: string; name: string; kind: ItemKind }
  /** The latest failed run, with where it stopped and why. */
  run: WorkspaceRun | null
  /** Failures among the last ten runs. */
  failures: number
  total: number
}

/** Items whose latest run failed, with that run (from the failed runs, newest first). */
export function needsAttention(
  items: WorkspaceItem[],
  failedRuns: WorkspaceRun[],
): AttentionItem[] {
  return items
    .filter((item) => item.lastRun?.result === 'failed')
    .map((item) => ({
      item,
      run: failedRuns.find((run) => run.workflowId === item.id) ?? null,
      failures: item.recentRuns.filter((result) => result === 'failed').length,
      total: item.recentRuns.length,
    }))
}

/** "Lead enrichment failed at "Fetch company"". */
export function attentionTitle(entry: AttentionItem): string {
  const step = entry.run?.failure?.step
  return step ? `${entry.item.name} failed at “${step}”` : `${entry.item.name} failed`
}

/** "3 of the last 10 runs failed · CRM returned 429". */
export function attentionDetail(entry: AttentionItem): string {
  const count = `${entry.failures} of the last ${entry.total} runs failed`
  const reason = entry.run?.failure?.message
  return reason ? `${count} · ${reason}` : count
}

export interface SharedSummary {
  /** This workspace's shared items, with who calls them. */
  out: WorkspaceItem[]
  /** Other workspaces' shared items, read-only here. */
  in: SharedItem[]
}

export function sharedSummary(items: WorkspaceItem[], sharedIn: SharedItem[]): SharedSummary {
  return { out: items.filter((item) => item.sharing !== null), in: sharedIn }
}

/** "Lead enrichment · used by IT". */
export function sharedOutLabel(item: { name: string; usedBy?: { name: string }[] }): string {
  if (!item.usedBy || item.usedBy.length === 0) return item.name
  return `${item.name} · used by ${item.usedBy.map((w) => w.name).join(', ')}`
}

/**
 * Overview "Recent runs", as `WsOverview` draws it: each item's latest
 * finished run, newest first (runs arrive newest first).
 */
export function latestRunPerItem(runs: WorkspaceRun[], limit: number): WorkspaceRun[] {
  const seen = new Set<string>()
  const latest: WorkspaceRun[] = []
  for (const run of runs) {
    if (run.result === 'running' || seen.has(run.workflowId)) continue
    seen.add(run.workflowId)
    latest.push(run)
    if (latest.length === limit) break
  }
  return latest
}
