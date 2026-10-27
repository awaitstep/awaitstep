import type { ItemKind } from '../../types/dashboard/items'

/** What the UI calls each kind: the API's `script` is a Function. */
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  workflow: 'Workflow',
  script: 'Function',
}
