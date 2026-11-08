import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useWorkspaceScope } from './use-workspace-scope'

export type EmptyView = 'workspace' | null

/** Nothing built yet in a workspace: its counts say so, without the item lists. */
export function emptyViewFor(facts: { workflows: number; functions: number }): EmptyView {
  return facts.workflows > 0 || facts.functions > 0 ? null : 'workspace'
}

/**
 * The welcome for this workspace's Overview, Workflows and Functions pages,
 * from the workspace's own counts in `/scope`; undefined until it arrives.
 */
export function useEmptyView(slugs: WorkspaceSlugs): EmptyView | undefined {
  const scope = useWorkspaceScope(slugs)
  if (!scope) return undefined
  return emptyViewFor(scope.workspace.workspace.counts)
}
