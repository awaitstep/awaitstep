import { marketplace, resourceCounts } from '../../fixtures/api/resources'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** Resources: the node catalog, the tab counts, and a node change's plain answer. */
export function resourceRoutes(api: FakeApiContext): RouteTable {
  const orgOf = (req: FakeRequest) => api.data.seed.orgs.find((o) => o.slug === req.query.org)
  return {
    'GET /marketplace': (req: FakeRequest) => {
      const org = orgOf(req)
      return org ? { nodes: marketplace(api.data.seed, org.id) } : apiError(404, 'Not found')
    },
    'POST /marketplace/:change': {},
    'GET /resources/counts': (req: FakeRequest) => {
      const org = orgOf(req)
      return org ? resourceCounts(api.data.seed, org.id, api.now) : apiError(404, 'Not found')
    },
  }
}
