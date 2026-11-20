import { orgKeys, projectKeys, workspaceKeys } from '../../fixtures/api/keys'
import { workspaceBySlugs } from '../../fixtures/api/workflows'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** API keys at the org, a project or a workspace: what each settings page lists. */
export function keyRoutes(api: FakeApiContext): RouteTable {
  const seed = () => api.data.seed
  return {
    // The created key and its secret, shown once: `ask_` and forty characters.
    'POST /api-keys': (req: FakeRequest) => {
      const body = req.body as {
        name: string
        level: string
        permissions: unknown
        expiresAt: string | null
      }
      return {
        id: 'key_new',
        level: body.level,
        name: body.name,
        keyPrefix: 'ask_Nw8kTq2z',
        keySuffix: 'f00d',
        permissions: body.permissions,
        createdBy: api.viewer,
        createdByName: null,
        createdAt: api.now.toISOString(),
        lastUsedAt: null,
        expiresAt: body.expiresAt,
        projects: [],
        workspaces: [],
        key: `ask_${'Nw8kTq2zLm5xRb7cVd9fHj3kPq6sTu1wXy4zAb8c'}`,
      }
    },
    'GET /api-keys': (req: FakeRequest) => {
      const { org: orgSlug, project: projectSlug, workspace } = req.query
      const org = seed().orgs.find((o) => o.slug === orgSlug)
      if (!org) return apiError(404, 'Not found')
      if (workspace) {
        const ws = workspaceBySlugs(seed(), req.query)
        return ws ? workspaceKeys(seed(), ws.id, api.now) : apiError(404, 'Not found')
      }
      if (projectSlug) {
        const project = seed().projects.find((p) => p.orgId === org.id && p.slug === projectSlug)
        return project ? projectKeys(seed(), project.id, api.now) : apiError(404, 'Not found')
      }
      return orgKeys(seed(), org.id)
    },
  }
}
