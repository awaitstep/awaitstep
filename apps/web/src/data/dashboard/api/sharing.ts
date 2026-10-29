import type { ApiSharedItem, ApiSharing } from '../../../lib/dashboard-api'
import type { SharedItem, Sharing } from '../../../types/dashboard/items'

// Shares as the API answers them → the rows the Workflows switch, the
// overview's "Shared with" card and the project's Shared library render.

export function toSharing(sharing: ApiSharing | null): Sharing | null {
  return sharing ? { sharedAt: sharing.sharedAt, sharedBy: sharing.sharedBy } : null
}

export function toSharedItem(item: ApiSharedItem): SharedItem {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    version: item.version,
    sharedAt: item.sharedAt,
    sharedBy: item.sharedBy,
    from: item.from,
    usedBy: item.usedBy,
    canOpen: item.canOpen,
    unshare: item.unshare,
  }
}
