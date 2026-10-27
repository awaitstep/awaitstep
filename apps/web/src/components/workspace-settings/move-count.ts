import { plural } from '../../lib/plural'
import type { WorkspaceItem } from '../../types/dashboard/items'

/** What a move covers: "2 workflows", "1 function", "1 workflow and 2 functions". */
export function moveCount(items: Pick<WorkspaceItem, 'kind'>[]): string {
  const workflows = items.filter((i) => i.kind === 'workflow').length
  const functions = items.length - workflows
  if (functions === 0) return plural(workflows, 'workflow')
  if (workflows === 0) return plural(functions, 'function')
  return `${plural(workflows, 'workflow')} and ${plural(functions, 'function')}`
}
