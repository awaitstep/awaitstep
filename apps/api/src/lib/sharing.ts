import { z } from 'zod'
import { ACCESS_REASONS, unshareCapability, type Allowed } from '@awaitstep/ir'
import type { SharedWorkflowRow, SharingRow } from '@awaitstep/db'
import { paginationQuerySchema } from './pagination.js'

/** `PUT /workflows/:id/share`: the switch's new state. */
export const shareBodySchema = z.object({ shared: z.boolean() })

export const sharedListQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(['workflow', 'script']).optional(),
})

export interface SharingRecord {
  sharedAt: string
  sharedBy: { id: string; name: string }
}

export interface WorkspaceRefRecord {
  id: string
  slug: string
  name: string
  colour: string
}

/**
 * An item shared to the project as anyone in it sees it: what it is and
 * where it lives, never its code. `canOpen` is whether the viewer may open
 * its workspace (and so the item).
 */
export interface SharedItemRecord extends SharingRecord {
  id: string
  name: string
  kind: 'workflow' | 'script'
  version: number | null
  from: WorkspaceRefRecord
  /** Workspaces that call it: filled in once the Call Workflow node links callers (D-B6-3). */
  usedBy: WorkspaceRefRecord[]
  canOpen: boolean
  unshare: Allowed
}

export function sharingRecord(row: Omit<SharingRow, 'changed'>): SharingRecord | null {
  // On is `shared_at`; the sharer may be unknown (left the org), never the share.
  if (!row.sharedAt) return null
  return { sharedAt: row.sharedAt, sharedBy: personOf(row.sharedBy, row.sharedByName) }
}

/**
 * The person behind a share or a lock. The name is read only while they are in
 * the organization; once they have left, neither their name nor their id is shown.
 */
export function personOf(id: string | null, name: string | null): { id: string; name: string } {
  return name === null ? { id: '', name: 'Someone' } : { id: id ?? '', name }
}

export function shareResponse(row: SharingRow): { sharing: SharingRecord | null } {
  return { sharing: sharingRecord(row) }
}

/**
 * `where` decides the Unshare button: in the project's Shared library it is
 * the viewer's share rights in the item's workspace; on a workspace's
 * "Shared with" list it is always "unshare it from its own workspace".
 * `opens` is false for a caller that opens nothing here whatever its
 * creator may (a workspace key on another workspace's list).
 */
export function sharedItemRecord(
  row: SharedWorkflowRow,
  where: 'project' | 'workspace',
  opens = true,
): SharedItemRecord {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    version: row.deployedVersion,
    sharedAt: row.sharedAt,
    sharedBy: personOf(row.sharedBy, row.sharedByName),
    from: row.from,
    usedBy: [],
    canOpen: opens && row.viewerRole !== null,
    unshare:
      where === 'project'
        ? unshareCapability(row.viewerRole, row.from.name)
        : { allowed: false, reason: ACCESS_REASONS.unshareElsewhere },
  }
}
