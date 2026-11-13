import type { WorkspaceSlugs } from '../dashboard-paths'
import { libraryCodePath } from '../dashboard-paths'

/**
 * The Library IDE on an item a workflow uses, opened from that workflow's
 * workspace: its own Library for a workspace item, the project's for a
 * project item.
 */
export function libraryItemHref(
  scope: WorkspaceSlugs,
  item: { itemId: string; owner: 'workspace' | 'project' },
  file?: string,
): string {
  const place = item.owner === 'workspace' ? scope : { org: scope.org, project: scope.project }
  return libraryCodePath(place, { item: item.itemId, ...(file && { file }) })
}
