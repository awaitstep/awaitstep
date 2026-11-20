import { orgMembers, projectMembers, workspacePeople } from '../../fixtures/api/members'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** Who can open a place: the reads the pages draw people from. */
export function memberRoutes(api: FakeApiContext): RouteTable {
  return {
    'GET /members': (req: FakeRequest) => {
      const seed = api.data.seed
      const org = seed.orgs.find((o) => o.slug === req.query.org)
      if (!org) return apiError(404, 'Not found')
      if (!req.query.project) return { data: orgMembers(seed, org.id) }
      const project = seed.projects.find((p) => p.orgId === org.id && p.slug === req.query.project)
      return project ? projectMembers(seed, project) : apiError(404, 'Not found')
    },
    'GET /workspaces/:id/members': (req: FakeRequest) => ({
      data: workspacePeople(api.data.seed, req.params.id!),
    }),
  }
}
