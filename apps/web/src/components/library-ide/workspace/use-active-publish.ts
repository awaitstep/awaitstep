import { useMemo, useState } from 'react'
import { useLibraryCheck } from '../../../data/dashboard/library'
import type { LibraryWorkspace } from '../../../hooks/use-library-workspace'
import type { DependencyConflict } from '../../../lib/monaco/library-config'
import { checkProblems, conflictProblems } from '../../../lib/library/check-problems'
import { itemRoot } from '../../../lib/library/ide-index'
import { publishState } from '../publish-state'

/**
 * The active item's publish check: its findings about the saved files (with
 * the IDE's dependency conflicts) for Problems, and what the Publish button
 * says, held back while the item has unsaved files.
 */
export function useActivePublish(ws: LibraryWorkspace, conflicts: readonly DependencyConflict[]) {
  const activeItem = ws.activeItemId ? (ws.index.itemById.get(ws.activeItemId) ?? null) : null
  const check = useLibraryCheck(activeItem?.id ?? null, { enabled: ws.canEdit })
  const [publishing, setPublishing] = useState(false)
  const saved = useMemo(
    () => [
      ...(activeItem && check.data ? checkProblems(activeItem, check.data.problems) : []),
      ...conflictProblems(conflicts),
    ],
    [activeItem, check.data, conflicts],
  )
  const itemDirty = activeItem
    ? [...ws.dirty].some((path) => path.startsWith(`${itemRoot(activeItem)}/`))
    : false
  const publish = activeItem
    ? publishState(check.data, check.isFetching, itemDirty, check.isError)
    : null
  return { activeItem, check, saved, publish, publishing, setPublishing }
}
