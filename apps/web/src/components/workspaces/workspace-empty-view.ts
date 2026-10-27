import { useWorkspaceItems } from '../../data/dashboard/items'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'

/** Which welcome a workspace page shows in place of its content (D-P2-5). */
export type EmptyView = 'project' | 'workspace' | null

/**
 * A workspace with no workflows and no functions shows a welcome: the
 * project's (`EmptyProject`) when it is the project's only workspace, so a
 * brand-new project, else the workspace's own (`EmptyWorkspace`).
 */
export function emptyViewFor(facts: {
  workflows: number
  functions: number
  workspacesInProject: number
}): EmptyView {
  if (facts.workflows > 0 || facts.functions > 0) return null
  return facts.workspacesInProject === 1 ? 'project' : 'workspace'
}

/**
 * The welcome for this workspace's Overview, Workflows and Functions pages,
 * from its item lists (so `?mock=empty` shows it); undefined until both load.
 */
export function useEmptyView(
  slugs: WorkspaceSlugs,
  workspacesInProject: number,
): EmptyView | undefined {
  const workflows = useWorkspaceItems(slugs, 'workflow').data
  const functions = useWorkspaceItems(slugs, 'script').data
  if (!workflows || !functions) return undefined
  return emptyViewFor({
    workflows: workflows.length,
    functions: functions.length,
    workspacesInProject,
  })
}
