import { useWorkspaceItems } from '../../data/dashboard/items'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'

/**
 * Which welcome a workspace page shows in place of its content: the
 * workspace's own (`EmptyWorkspace`) while it has no workflows and no
 * functions. A new project's welcome (`EmptyProject`) is the project's page,
 * `/{org}/{project}/workspaces`, never a workspace's.
 */
export type EmptyView = 'workspace' | null

export function emptyViewFor(facts: { workflows: number; functions: number }): EmptyView {
  return facts.workflows > 0 || facts.functions > 0 ? null : 'workspace'
}

/**
 * The welcome for this workspace's Overview, Workflows and Functions pages,
 * from its item lists (so `?mock=empty` shows it); undefined until both load.
 */
export function useEmptyView(slugs: WorkspaceSlugs): EmptyView | undefined {
  const workflows = useWorkspaceItems(slugs, 'workflow').data
  const functions = useWorkspaceItems(slugs, 'script').data
  if (!workflows || !functions) return undefined
  return emptyViewFor({ workflows: workflows.length, functions: functions.length })
}
