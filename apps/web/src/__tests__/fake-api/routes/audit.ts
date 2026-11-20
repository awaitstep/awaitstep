import type { AuditFilter } from '@awaitstep/ir'
import { auditPage } from '../../fixtures/api/audit'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** The org's audit log, a page at a time. */
export function auditRoutes(api: FakeApiContext): RouteTable {
  return {
    'GET /audit-events': (req: FakeRequest) => {
      const org = api.data.seed.orgs.find((o) => o.slug === req.query.org)
      return org
        ? auditPage(api.data.seed, org.id, req.query as AuditFilter, api.now)
        : apiError(404, 'Not found')
    },
  }
}
