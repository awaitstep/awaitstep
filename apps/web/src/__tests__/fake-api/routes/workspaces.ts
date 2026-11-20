import { workspaceKeys } from '../../fixtures/api/keys'
import { projectSummary } from '../../fixtures/api/project-summary'
import { workspaceOverview } from '../../fixtures/api/workspace-overview'
import { workspaceCounts } from '../../fixtures/api/workflows'
import { workspacePeople } from '../../fixtures/api/members'
import { workspaceVariables } from '../../fixtures/api/variables'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** An org's projects, a project's workspaces, and a workspace's own reads (settings counts). */
export function workspaceRoutes(api: FakeApiContext): RouteTable {
  return {
    'GET /projects': (req: FakeRequest) => {
      const prefix = `${req.query.org}/`
      const data = Object.entries(api.data.projects)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, project]) => project)
      return { data, nextCursor: null }
    },
    'GET /projects/:id/summary': (req: FakeRequest) => {
      const project = api.data.seed.projects.find((p) => p.id === req.params.id)
      return project ? projectSummary(api.data.seed, project, api.now) : apiError(404, 'Not found')
    },
    'GET /workspaces': (req: FakeRequest) => {
      const prefix = `${req.query.org}/${req.query.project}/`
      const data = Object.entries(api.data.workspaces)
        .filter(([key]) => key.startsWith(prefix))
        // Counted at read time, as the scope is: the lists and the page agree.
        .map(([, workspace]) =>
          api.data.seed.workspaces.some((w) => w.id === workspace.id)
            ? { ...workspace, counts: workspaceCounts(api.data.seed, workspace.id, api.now) }
            : workspace,
        )
      return { data }
    },
    // A PATCH answers the row as saved: the scope's copy with the changed fields.
    'PATCH /workspaces/:id': (req: FakeRequest) => {
      const workspace = Object.values(api.data.workspaces).find((w) => w.id === req.params.id)
      return workspace ? { ...workspace, ...(req.body as object) } : apiError(404, 'Not found')
    },
    'GET /workspaces/:id/overview': (req: FakeRequest) =>
      api.data.seed.workspaces.some((w) => w.id === req.params.id)
        ? workspaceOverview(api.data.seed, req.params.id!, api.now)
        : apiError(404, 'Not found'),
    'GET /workspaces/:id/settings-counts': (req: FakeRequest) => {
      const seed = api.data.seed
      const id = req.params.id!
      if (!seed.workspaces.some((w) => w.id === id)) return apiError(404, 'Not found')
      const keys = workspaceKeys(seed, id, api.now)
      return {
        members: workspacePeople(seed, id).length,
        keys: keys.own.length + keys.reaching.length,
        variables: workspaceVariables(seed, id, api.now).length,
      }
    },
  }
}
