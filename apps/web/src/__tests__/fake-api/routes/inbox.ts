import { inboxPage } from '../../fixtures/api/inbox'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** The Inbox and What's new: the list, the badge count, and the visit. */
export function inboxRoutes(api: FakeApiContext): RouteTable {
  const page = (req: FakeRequest) => {
    const org = api.data.seed.orgs.find((o) => o.slug === req.query.org)
    return org ? inboxPage(api.data.seed, org.id, api.viewer) : null
  }
  return {
    'GET /notifications': (req: FakeRequest) => page(req) ?? apiError(404, 'Not found'),
    'GET /notifications/count': (req: FakeRequest) => {
      const answer = page(req)
      return answer ? { unread: answer.counts.unread } : apiError(404, 'Not found')
    },
    'POST /notifications/:id/read': { ok: true },
    'POST /notifications/read-all': { updated: 0 },
    'POST /access-requests/:id/approve': { ok: true, alreadyEditing: false },
    'POST /access-requests/:id/decline': { ok: true, alreadyEditing: false },
    'GET /releases/visit': () => {
      const visit = api.data.seed.releaseVisits.find((v) => v.userId === api.viewer)
      return { lastVisit: visit?.at ?? null, seen: visit?.seenIds ?? [] }
    },
    'PUT /releases/visit': (req: FakeRequest) => ({
      lastVisit: api.now.toISOString(),
      seen: (req.body as { seen: string[] }).seen,
    }),
  }
}
