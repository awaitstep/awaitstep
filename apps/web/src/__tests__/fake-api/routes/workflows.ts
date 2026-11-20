import {
  createdWorkflow,
  sharedItem,
  workflowRow,
  workspaceBySlugs,
} from '../../fixtures/api/workflows'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

const page = <T>(data: T[]) => ({ data, nextCursor: null })

/** Workflows and functions: a workspace's list, what is shared, and the two writes. */
export function workflowRoutes(api: FakeApiContext): RouteTable {
  const seed = () => api.data.seed
  return {
    'GET /workflows': (req: FakeRequest) => {
      const ws = workspaceBySlugs(seed(), req.query)
      if (!ws) return apiError(404, 'Workspace not found')
      const items = seed().items.filter(
        (i) => i.workspaceId === ws.id && (!req.query.kind || i.kind === req.query.kind),
      )
      return page(items.map((item) => workflowRow(seed(), item)))
    },
    'GET /workspaces/:id/shared': (req: FakeRequest) => {
      const ws = seed().workspaces.find((w) => w.id === req.params.id)
      if (!ws) return apiError(404, 'Workspace not found')
      const siblings = new Set(
        seed()
          .workspaces.filter((w) => w.projectId === ws.projectId && w.id !== ws.id)
          .map((w) => w.id),
      )
      const items = seed().items.filter(
        (i) =>
          i.sharing &&
          siblings.has(i.workspaceId) &&
          (!req.query.kind || i.kind === req.query.kind),
      )
      return page(
        items.map((i) =>
          sharedItem(seed(), i, {
            allowed: false,
            reason: 'Only its own workspace can unshare it',
          }),
        ),
      )
    },
    'GET /projects/:id/shared': (req: FakeRequest) => {
      const inProject = new Set(
        seed()
          .workspaces.filter((w) => w.projectId === req.params.id)
          .map((w) => w.id),
      )
      const items = seed().items.filter((i) => i.sharing && inProject.has(i.workspaceId))
      return page(items.map((i) => sharedItem(seed(), i, { allowed: true })))
    },
    'POST /workflows': (req: FakeRequest) => {
      const ws = workspaceBySlugs(seed(), req.query)
      if (!ws) return apiError(404, 'Workspace not found')
      return createdWorkflow(ws.id, req.body as { name: string }, api.now)
    },
    'POST /workflows/:id/versions': () => ({ id: 'ver_imported' }),
    'GET /workspaces/:id/access-request': null,
    'POST /workspaces/:id/access-requests': (req: FakeRequest) => ({
      id: 'req_new',
      workspaceId: req.params.id,
      from: { id: api.viewer, name: seed().people.find((p) => p.id === api.viewer)?.name ?? '' },
      to: { id: 'usr_ama', name: 'Ama Mensah' },
      status: 'pending',
      at: api.now.toISOString(),
    }),
    'PUT /workflows/:id/share': (req: FakeRequest) => {
      const shared = (req.body as { shared: boolean }).shared
      return {
        sharing: shared
          ? { sharedAt: api.now.toISOString(), sharedBy: { id: api.viewer, name: 'You' } }
          : null,
      }
    },
  }
}
