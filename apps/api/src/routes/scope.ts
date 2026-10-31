import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '../lib/validation.js'
import { orgListingRecord, toScopeResponse } from '../lib/scope-records.js'
import type { AppEnv } from '../types.js'

const scopeQuerySchema = z.object({
  org: z.string().min(1).max(100),
  project: z.string().min(1).max(100).optional(),
  workspace: z.string().min(1).max(100).optional(),
})

// The dashboard's own reads: where a URL points, which organizations the
// session has, and what is failing across one. Session-only (the router),
// since each answers for a person, not for a key.
export const scope = new Hono<AppEnv>()

scope.get('/scope', zValidator('query', scopeQuerySchema), async (c) => {
  const slugs = c.req.valid('query')
  if (slugs.workspace !== undefined && slugs.project === undefined) {
    return c.json({ error: 'A workspace needs its project' }, 400)
  }
  const rows = await c.get('db').getScopeBySlugs(c.get('userId'), slugs)
  return c.json(toScopeResponse(rows, slugs))
})

scope.get('/orgs', async (c) => {
  const rows = await c.get('db').listOrganizationsForMember(c.get('userId'))
  return c.json({ data: rows.map(orgListingRecord) })
})

/** Org home's "Failing now": behind requireOrganization (`?org=` or `?organizationId=`) and session-only. */
scope.get('/failing', async (c) => {
  const data = await c.get('db').listFailingWorkflows(c.get('organizationId'), c.get('userId'))
  return c.json({ data })
})
