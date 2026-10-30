import { Hono } from 'hono'
import { z } from 'zod'
import {
  AUDIT_LEVELS,
  AUDIT_PERIODS,
  AUDIT_PERIOD_MS,
  HIDDEN_AUDIT_EVENTS,
  isWorkspaceColour,
  type AuditEvent,
  type AuditLevel,
  type AuditPeriod,
} from '@awaitstep/ir'
import type { AuditEventRow } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import type { AppEnv } from '../types.js'

// The organization's audit log (B7): `GET /audit-events?org=`. Owners and
// admins, or an organization key holding `audit: read` (the router). Newest
// first, kept for 90 days.

const auditQuerySchema = paginationQuerySchema.extend({
  level: z.enum(AUDIT_LEVELS as [AuditLevel, ...AuditLevel[]]).optional(),
  period: z.enum(AUDIT_PERIODS as [AuditPeriod, ...AuditPeriod[]]).default('7d'),
  search: z.string().trim().max(200).optional(),
})

function auditEventRecord(row: AuditEventRow): AuditEvent {
  const { scope, ...rest } = row
  return {
    ...rest,
    scope: {
      level: scope.level,
      name: scope.name,
      ...(isWorkspaceColour(scope.colour) && { colour: scope.colour }),
    },
  }
}

export const audit = new Hono<AppEnv>()

audit.get('/', zValidator('query', auditQuerySchema), async (c) => {
  const { cursor, limit, level, period, search } = c.req.valid('query')
  const since = new Date(Date.now() - AUDIT_PERIOD_MS[period]).toISOString()
  const page = await c.get('db').listAuditEvents(
    {
      organizationId: c.get('organizationId'),
      level,
      since,
      search: search || undefined,
      hiddenEvents: HIDDEN_AUDIT_EVENTS,
    },
    { cursor, limit },
  )
  return c.json({ ...page, data: page.data.map(auditEventRecord) })
})
