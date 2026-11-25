import { create } from 'zustand'
import { LONG_TOAST_MS, type ActionToastOptions } from './action-toast'

/** What a save said of the version it wrote: saved, but a deploy or a test would refuse it. */
export interface SaveWarning {
  nodeId: string
  nodeName: string
  message: string
}

/** The version a save wrote: its workflow and graph hash, and what it warned of. */
export interface WarnedSave {
  graphHash: string
  warnings?: readonly SaveWarning[]
}

interface SaveWarningsState {
  /** The version the marks are about; a node shows them only while the canvas shows it. */
  workflowId: string | null
  graphHash: string | null
  byNode: ReadonlyMap<string, string>
}

/**
 * What the last save warned of, by node, for the version it wrote. A node
 * shows it as a badge while the editor shows that version: another workflow
 * (a duplicate keeps the node ids), an older version, or a newer save does
 * not inherit it.
 */
export const useSaveWarningsStore = create<SaveWarningsState>(() => ({
  workflowId: null,
  graphHash: null,
  byNode: new Map(),
}))

/** The warning a node of the version on screen carries, if its last save warned of it. */
export function saveWarningOf(
  state: SaveWarningsState,
  shown: { workflowId: string | null; graphHash: string | null },
  nodeId: string | null,
): string | undefined {
  if (!nodeId || state.workflowId === null) return undefined
  if (state.workflowId !== shown.workflowId || state.graphHash !== shown.graphHash) return undefined
  return state.byNode.get(nodeId)
}

function mark(workflowId: string, graphHash: string, warnings: readonly SaveWarning[]): void {
  const byNode = new Map<string, string>()
  for (const warning of warnings) {
    if (!byNode.has(warning.nodeId)) byNode.set(warning.nodeId, warning.message)
  }
  const current = useSaveWarningsStore.getState()
  if (byNode.size === 0 && current.byNode.size === 0) return
  useSaveWarningsStore.setState({ workflowId, graphHash, byNode })
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
  saved: WarnedSave,
  notify: { info(text: string, options?: ActionToastOptions): void },
): void {
  const { warnings } = saved
  mark(workflowId, saved.graphHash, warnings ?? [])
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
  useSaveWarningsStore.setState({ workflowId: null, graphHash: null, byNode: new Map() })
}
