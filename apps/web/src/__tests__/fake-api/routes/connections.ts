import {
  availableConnections,
  connectionSummary,
  orgAccounts,
  orgConnections,
  projectConnections,
} from '../../fixtures/api/connections'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** The org's accounts and a project's: lists, the Settings summary, what can be added. */
export function connectionRoutes(api: FakeApiContext): RouteTable {
  const seed = () => api.data.seed
  const orgOf = (req: FakeRequest) => seed().orgs.find((o) => o.slug === req.query.org)
  const projectOf = (req: FakeRequest) => seed().projects.find((p) => p.id === req.params.id)
  return {
    'GET /oauth/cloudflare/status': { enabled: true },
    'GET /connections': (req: FakeRequest) => {
      const org = orgOf(req)
      if (!org) return apiError(404, 'Not found')
      return { data: orgConnections(seed(), org.id, req.query.project), nextCursor: null }
    },
    'GET /connections/accounts': (req: FakeRequest) => {
      const org = orgOf(req)
      return org
        ? { data: orgAccounts(seed(), org.id), nextCursor: null }
        : apiError(404, 'Not found')
    },
    'GET /projects/:id/connections': (req: FakeRequest) => {
      const project = projectOf(req)
      return project ? projectConnections(seed(), project) : apiError(404, 'Not found')
    },
    'GET /projects/:id/connections/summary': (req: FakeRequest) => {
      const project = projectOf(req)
      return project
        ? connectionSummary(seed(), project, req.query.workspaceId)
        : apiError(404, 'Not found')
    },
    'GET /projects/:id/connections/available': (req: FakeRequest) => {
      const project = projectOf(req)
      return project ? { data: availableConnections(seed(), project) } : apiError(404, 'Not found')
    },
  }
}
