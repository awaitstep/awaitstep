import type { ApiRunFilter } from '../../../lib/dashboard-api'
import { workspaceRuns } from '../../fixtures/api/runs'
import { workspaceBySlugs } from '../../fixtures/api/workflows'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** A workspace's runs, a page at a time. */
export function runRoutes(api: FakeApiContext): RouteTable {
  return {
    // The org home's "Failing now": nothing failing unless a test says so.
    'GET /failing': { data: [] },
    'GET /runs': (req: FakeRequest) => {
      const ws = workspaceBySlugs(api.data.seed, req.query)
      return ws
        ? workspaceRuns(api.data.seed, ws.id, req.query as ApiRunFilter)
        : apiError(404, 'Not found')
    },
  }
}
