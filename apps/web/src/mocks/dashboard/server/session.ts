import type { OrgListing, OrgSummary, Viewer } from '../../../types/dashboard/session'
import { getDb } from '../db'
import { frameEndpoint, mutation, notFoundError } from '../scenario'
import { orgListingRecord, orgRecord, personById } from './records'
import { requireScope } from './resolve'

export const getViewer = frameEndpoint((ctx): Viewer => {
  const db = getDb()
  const last = db.orgMembers
    .filter((m) => m.userId === ctx.userId && m.lastOpenedAt)
    .sort((a, b) => b.lastOpenedAt!.localeCompare(a.lastOpenedAt!))[0]
  return {
    ...personById(db, ctx.userId),
    lastOrgSlug: last ? (db.orgs.find((o) => o.id === last.orgId)?.slug ?? null) : null,
  }
})

/** The viewer's organizations (frame data: no scenario empties or fails it). */
export const listOrgs = frameEndpoint((ctx): OrgListing[] => {
  const db = getDb()
  return db.orgMembers
    .filter((m) => m.userId === ctx.userId)
    .map((m) => db.orgs.find((o) => o.id === m.orgId))
    .filter((o) => o !== undefined)
    .map((o) => orgListingRecord(db, ctx, o))
})

/** Records the org as last opened, so the next sign-in lands there. */
export const openOrg = mutation((ctx, orgSlug: string): OrgSummary => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const membership = db.orgMembers.find((m) => m.orgId === org.id && m.userId === ctx.userId)
  if (!membership) throw notFoundError()
  membership.lastOpenedAt = new Date().toISOString()
  return orgRecord(db, ctx, org)
})
