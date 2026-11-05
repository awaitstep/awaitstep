import { useState } from 'react'
import type { ItemKind } from '../../types/dashboard/items'
import type { ItemStart, NewItemRequest } from './new-item-dialog'

export type NewItem = ReturnType<typeof useNewItem>

/**
 * New workflow / New function: opens the dialog that names it (render
 * `NewItemDialog` with `dialog` while it's set). A workflow starts on the
 * template picker unless `start` says blank; the dialog can change that.
 */
export function useNewItem() {
  const [request, setRequest] = useState<NewItemRequest | null>(null)

  function start(kind: ItemKind, startFrom: ItemStart = 'template') {
    setRequest({ kind, start: startFrom })
  }

  function close() {
    setRequest(null)
  }

  return { start, dialog: request ? { request, onClose: close } : null }
}
