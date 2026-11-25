import { create } from 'zustand'
import { LONG_TOAST_MS, type ActionToastOptions } from './action-toast'

/** What a save said of the version it wrote: saved, but a deploy or a test would refuse it. */
export interface SaveWarning {
  nodeId: string
  nodeName: string
  message: string
}

/**
 * What the last save warned of, by node: a node shows it as a badge until a
 * save comes back without it. One editor is open at a time, so the last save
 * is the open workflow's.
 */
export const useSaveWarningsStore = create<{ byNode: ReadonlyMap<string, string> }>(() => ({
  byNode: new Map(),
}))

function mark(warnings: readonly SaveWarning[]): void {
  const byNode = new Map<string, string>()
  for (const warning of warnings) {
    if (!byNode.has(warning.nodeId)) byNode.set(warning.nodeId, warning.message)
  }
  const current = useSaveWarningsStore.getState().byNode
  if (byNode.size === 0 && current.size === 0) return
  useSaveWarningsStore.setState({ byNode })
}

/** The warnings last said of each workflow, so a save that repeats them says nothing. */
const said = new Map<string, string>()

/** "Saved with 1 warning" / "Saved with 3 warnings". */
export function savedWithWarnings(count: number): string {
  return count === 1 ? 'Saved with 1 warning' : `Saved with ${count} warnings`
}

/**
 * Marks the nodes a save warned of, and says it, once: saves follow each other closely, and the
 * same warning on each would bury everything else. Said again once it has
 * changed, or has gone and come back.
 */
export function announceSaveWarnings(
  workflowId: string,
  warnings: readonly SaveWarning[] | undefined,
  notify: { info(text: string, options?: ActionToastOptions): void },
): void {
  mark(warnings ?? [])
  if (!warnings?.length) {
    said.delete(workflowId)
    return
  }
  const key = warnings.map((warning) => `${warning.nodeId}\n${warning.message}`).join('\n\n')
  if (said.get(workflowId) === key) return
  said.set(workflowId, key)
  const [first] = warnings
  notify.info(savedWithWarnings(warnings.length), {
    description: first!.nodeName ? `${first!.nodeName}: ${first!.message}` : first!.message,
    duration: LONG_TOAST_MS,
  })
}

/** Forgets what was said (tests). */
export function resetSaveWarnings(): void {
  said.clear()
  useSaveWarningsStore.setState({ byNode: new Map() })
}
