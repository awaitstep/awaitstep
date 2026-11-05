import { useCreateItem } from '../../data/dashboard/items'
import { newItemPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ItemKind } from '../../types/dashboard/items'
import { useGoTo } from '../navigation/router-shell-link'

export type NewItem = ReturnType<typeof useNewItem>

/**
 * New workflow / New function: creates it in the workspace, then opens its
 * editor at the workspace URL. `blank` skips a workflow's template picker.
 */
export function useNewItem(slugs: WorkspaceSlugs, options: { blank?: boolean } = {}) {
  const goTo = useGoTo()
  // Opened from the hook's own success, not mutate's: from an empty state,
  // the button is gone by the time the lists have refetched.
  const create = useCreateItem(slugs, {
    onCreated: (item) => goTo(newItemPath(slugs, item, options)),
  })

  function start(kind: ItemKind) {
    create.mutate({ kind })
  }

  return {
    start,
    // From the click until the editor opens: a second click would make a second item.
    busy: create.isPending || create.isSuccess,
    error: create.error,
  }
}
