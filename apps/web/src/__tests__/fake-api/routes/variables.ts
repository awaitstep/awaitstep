import { orgVariables, projectVariables, workspaceVariables } from '../../fixtures/api/variables'
import { workspaceBySlugs } from '../../fixtures/api/workflows'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** Variables at the org (Resources), a project and a workspace, as their pages list them. */
export function variableRoutes(api: FakeApiContext): RouteTable {
  const seed = () => api.data.seed
  const orgOf = (req: FakeRequest) => seed().orgs.find((o) => o.slug === req.query.org)
  /** What a write answers: the row as stored, with the names it skipped. */
  const written = (req: FakeRequest) => {
    const body = req.body as { name?: string; value?: string; isSecret?: boolean }
    return {
      id: req.params.id ?? `var_new_${body.name ?? 'x'}`,
      level: req.query.workspace ? 'workspace' : req.query.project ? 'project' : 'organization',
      organizationId: orgOf(req)?.id ?? '',
      projectId: null,
      workspaceId: null,
      name: body.name ?? '',
      value: body.isSecret ? '••••••••' : (body.value ?? ''),
      isSecret: body.isSecret ?? false,
      createdBy: api.viewer,
      createdAt: api.now.toISOString(),
      updatedAt: api.now.toISOString(),
      skipped: [],
    }
  }
  return {
    'POST /env-vars': written,
    'PATCH /env-vars/:id': written,
    'DELETE /env-vars/:id': { ok: true },
    'GET /env-vars': (req: FakeRequest) => {
      const org = orgOf(req)
      return org ? orgVariables(seed(), org.id, api.now) : apiError(404, 'Not found')
    },
    'GET /env-vars/resolved': (req: FakeRequest) => {
      const org = orgOf(req)
      if (!org) return apiError(404, 'Not found')
      if (req.query.workspace) {
        const ws = workspaceBySlugs(seed(), req.query)
        return ws
          ? { data: workspaceVariables(seed(), ws.id, api.now) }
          : apiError(404, 'Not found')
      }
      const project = seed().projects.find(
        (p) => p.orgId === org.id && p.slug === req.query.project,
      )
      return project
        ? { data: projectVariables(seed(), project.id, api.now) }
        : apiError(404, 'Not found')
    },
  }
}
