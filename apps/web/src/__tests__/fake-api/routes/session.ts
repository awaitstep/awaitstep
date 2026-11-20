import type { ApiScope } from '../../../lib/dashboard-api'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'
import { viewerFixture } from './fixture-lookup'

/** `GET /scope`: the fixtures named by the slugs, or which one isn't there. */
function scopeOf(api: FakeApiContext, req: FakeRequest): ApiScope {
  const { org: orgSlug = '', project: projectSlug, workspace: workspaceSlug } = req.query
  const org = api.data.orgs[orgSlug]
  if (!org) {
    return { found: false, notFound: { kind: 'organization', slug: orgSlug, parent: null } }
  }
  if (!projectSlug) return { found: true, org }
  const project = api.data.projects[`${orgSlug}/${projectSlug}`]
  if (!project) {
    return {
      found: false,
      notFound: { kind: 'project', slug: projectSlug, parent: { name: org.name, slug: org.slug } },
    }
  }
  if (!workspaceSlug) return { found: true, org, project }
  const workspace = api.data.workspaces[`${orgSlug}/${projectSlug}/${workspaceSlug}`]
  if (!workspace) {
    return {
      found: false,
      notFound: {
        kind: 'workspace',
        slug: workspaceSlug,
        parent: { name: project.name, slug: project.slug },
      },
    }
  }
  return { found: true, org, project, workspace }
}

/** The session's own reads: where a URL points, the org list, a project's setup counts. */
export function sessionRoutes(api: FakeApiContext): RouteTable {
  return {
    'GET /scope': (req: FakeRequest) => scopeOf(api, req),
    'GET /orgs': () => ({ data: viewerFixture(api.data.orgListings, api.viewer, 'org list') }),
    'GET /projects/:projectId/setup': (req: FakeRequest) =>
      api.data.projectSetup[req.params.projectId!] ?? apiError(404, 'Not found'),
  }
}
