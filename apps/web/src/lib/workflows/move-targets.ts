import type { Workspace } from '../../types/dashboard/workspaces'

/**
 * Where a workflow in `from` can be moved: the project's other workspaces
 * the viewer can build in. The API refuses a move into any other.
 */
export function moveTargets(workspaces: readonly Workspace[], from: string): Workspace[] {
  return workspaces.filter((w) => w.slug !== from && w.viewerCanEdit)
}
