import { createMemoryHistory, createRouter, isNotFound } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ACCOUNT_PAGES,
  ORG_PAGES,
  ORG_SETTINGS_PAGES,
  PROJECT_PAGES,
  RESERVED_SLUGS,
  WORKSPACE_PAGES,
  accountPath,
  dashboardPath,
  invitePath,
  orgPath,
  orgSettingsPath,
  projectPath,
  projectPagePath,
  projectWorkspacesPath,
  workspacePath,
} from '../../../lib/dashboard-paths'

const router = createRouter({ routeTree })
const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

/** The route a path would render, or null when only the not-found fallback matches. */
function leafRoute(path: string): string | null {
  const matches = router.matchRoutes(path)
  const leaf = matches[matches.length - 1]
  return leaf && leaf.routeId !== '__root__' ? leaf.routeId : null
}

describe('dashboard route tree', () => {
  const paths = [
    ...ORG_PAGES.map((page) => orgPath('acme', page)),
    ...ORG_SETTINGS_PAGES.map((page) => orgSettingsPath('acme', page)),
    projectWorkspacesPath(SALES),
    ...PROJECT_PAGES.map((page) => projectPagePath(SALES, page)),
    ...WORKSPACE_PAGES.map((page) => workspacePath(SALES, page)),
  ]

  it.each(paths)('has a page route for %s', (path) => {
    // `/{org}/{project}/settings` is an index route: its id keeps the trailing slash.
    const routeId = leafRoute(path)?.replace(/\/$/, '')
    expect(routeId).toBe(
      `/_authed${path.replace('/acme', '/$org').replace('/project-101', '/$project').replace('/sales', '/$workspace')}`,
    )
  })

  it('has landing routes for the bare scope URLs and the entry pages', () => {
    expect(leafRoute('/acme')).toBe('/_authed/$org/')
    expect(leafRoute('/acme/settings')).toBe('/_authed/$org/settings/')
    expect(leafRoute(projectPath(SALES))).toBe('/_authed/$org/$project/')
    expect(leafRoute('/acme/project-101/settings')).toBe('/_authed/$org/$project/settings/')
    expect(leafRoute('/acme/project-101/sales')).toBe('/_authed/$org/$project/$workspace/')
    expect(leafRoute(dashboardPath())).toBe('/_authed/dashboard')
    expect(leafRoute(invitePath('abc'))).toBe('/invite/$token')
  })

  it('serves the org-less pages at top level, under the _orgless layout', () => {
    for (const page of ACCOUNT_PAGES) {
      expect(leafRoute(accountPath(page))).toBe(`/_authed/_orgless/account/${page}`)
    }
    expect(leafRoute('/account')).toBe('/_authed/_orgless/account/')
    expect(leafRoute('/api-playground')).toBe('/_authed/_orgless/api-playground')
  })

  it('still answers stale /{org}/account links (they redirect to the top-level pages)', () => {
    expect(leafRoute('/acme/account')).toBe('/_authed/$org/account/')
    expect(leafRoute('/acme/account/profile')).toBe('/_authed/$org/account/profile')
    expect(leafRoute('/acme/account/sessions')).toBe('/_authed/$org/account/sessions')
  })

  // `api` has no web route: the same origin proxies /api to the API server.
  // `invite` has no page of its own, only /invite/$token (below).
  const routedOrgSlugs = RESERVED_SLUGS.org.filter((slug) => slug !== 'api' && slug !== 'invite')

  it.each(routedOrgSlugs)('lets no org be called "%s": another route owns its URL', (slug) => {
    expect(leafRoute(`/${slug}`)).not.toBe('/_authed/$org/')
  })

  it('sends an org’s pages to old routes when they have children', () => {
    expect(leafRoute('/workflows/projects')).toBe('/_authed/workflows/$workflowId/')
    expect(leafRoute('/runs/projects')).toBe('/_authed/runs/$runId')
    expect(leafRoute('/invite/projects')).toBe('/invite/$token')
  })

  // `items` has no page of its own; its ids sit one level down.
  it.each(RESERVED_SLUGS.project.filter((slug) => slug !== 'items'))(
    'lets no project be called "%s"',
    (slug) => {
      expect(leafRoute(`/acme/${slug}`)).not.toBe('/_authed/$org/$project/')
    },
  )

  it('keeps /{org}/items/{id} for the item placeholder, never a project’s workspace', () => {
    expect(leafRoute('/acme/items/itm_123')).toBe('/_authed/$org/items/$itemId')
  })

  it('lets no workspace take a project page’s name', () => {
    expect(leafRoute('/acme/project-101/workspaces')).toBe('/_authed/$org/$project/workspaces')
    expect(leafRoute('/acme/project-101/members')).toBe('/_authed/$org/$project/members')
    expect(leafRoute('/acme/project-101/settings')).toBe('/_authed/$org/$project/settings/')
  })

  it('keeps the old Settings → Workspaces URL, which forwards to the project’s page', () => {
    expect(leafRoute('/acme/project-101/settings/workspaces')).toBe(
      '/_authed/$org/$project/settings/workspaces',
    )
  })
})

describe('dashboard route guards', () => {
  type BeforeLoad = (ctx: { params: { org: string } }) => void
  const beforeLoad = router.routesById['/_authed/$org'].options.beforeLoad as unknown as BeforeLoad

  function thrownBy(org: string): unknown {
    try {
      beforeLoad({ params: { org } })
      return null
    } catch (error) {
      return error
    }
  }

  it.each(['dashboard', 'workflows', 'settings', 'api'])(
    'sends a URL under the reserved slug "%s" to the app’s 404, not an org page',
    (slug) => {
      expect(isNotFound(thrownBy(slug))).toBe(true)
    },
  )

  it('lets an ordinary slug through to the org lookup', () => {
    expect(thrownBy('acme')).toBeNull()
    expect(thrownBy('setings')).toBeNull()
  })
})

describe('dashboard search params', () => {
  function routerAt(path: string) {
    return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  }

  it('keeps ?mock and ?as when /dashboard sends you into an org', () => {
    const location = routerAt('/dashboard?as=priya&mock=viewer').buildLocation({
      to: '/$org/projects',
      params: { org: 'acme' },
    })
    expect(location.search).toEqual({ as: 'priya', mock: 'viewer' })
  })

  it('lets a switcher’s ?new reach the page, without carrying it to the next one', () => {
    const router = routerAt('/acme/project-101/sales/runs?as=daniel')
    const toDialog = router.buildLocation({
      to: '/$org/projects',
      params: { org: 'acme' },
      search: { new: 'project' },
    })
    expect(toDialog.search).toEqual({ as: 'daniel', new: 'project' })
    const onward = routerAt('/acme/projects?new=project&as=daniel').buildLocation({
      to: '/$org/audit',
      params: { org: 'acme' },
    })
    expect(onward.search).toEqual({ as: 'daniel' })
  })

  it('keeps them across a page change inside the dashboard, and drops anything else', () => {
    const location = routerAt('/acme/audit?as=daniel&page=2').buildLocation({
      to: '/$org/$project/$workspace/runs',
      params: { org: 'acme', project: 'project-101', workspace: 'sales' },
    })
    expect(location.search).toEqual({ as: 'daniel' })
  })
})
