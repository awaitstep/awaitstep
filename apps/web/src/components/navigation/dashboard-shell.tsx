import type { ReactNode } from 'react'
import { useLocation, useMatches, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useNotifications, useReleases } from '../../data/dashboard/inbox'
import { useProjects } from '../../data/dashboard/projects'
import { useViewer } from '../../data/dashboard/session'
import { useScope } from '../../data/dashboard/workspaces'
import { chooseOrgPath, orgPath, projectPath, withOverlay } from '../../lib/dashboard-paths'
import { useThemeStore } from '../../stores/theme-store'
import type { ReleaseFeed } from '../../types/dashboard/inbox'
import type { NotFound, ScopeLookup, ScopeSlugs } from '../../types/dashboard/scope'
import { LoadError } from '../ui/load-error'
import { NotFoundView } from '../ui/not-found-view'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { PageBody } from '../shell/page-intro'
import { DashboardOverlays } from '../inbox/dashboard-overlays'
import type { DashboardPage } from './dashboard-page'
import type { DashboardSearch } from './dashboard-providers'
import { DashboardFrame, type FrameScope } from './dashboard-frame'
import type { LastProject, RailOverlays } from './nav-model'
import { recentProjects } from './scope-memory'

function countFresh(feed: ReleaseFeed | undefined): number {
  return feed?.releases.filter((r) => r.fresh).length ?? 0
}

function useScopeSlugs(): ScopeSlugs {
  const params = useParams({ strict: false }) as Partial<ScopeSlugs>
  return { org: params.org!, project: params.project, workspace: params.workspace }
}

/** The page the deepest matched route declares, if any. */
function useDashboardPage(): DashboardPage | null {
  const matches = useMatches()
  const declared = matches.map((match) => match.staticData.dashboardPage).filter(Boolean)
  return declared[declared.length - 1] ?? null
}

function frameScope(slugs: ScopeSlugs, lookup: ScopeLookup | undefined): FrameScope {
  const found = lookup?.found ? lookup : null
  const org = found?.org.org
  const project = found?.project?.project
  const workspace = found?.workspace?.workspace
  return {
    slugs,
    org: {
      name: org?.name ?? slugs.org,
      initial: org?.initial ?? slugs.org.charAt(0).toUpperCase(),
      logo: org?.logo ?? null,
    },
    project: project && { name: project.name, initial: project.initial },
    workspace: workspace && {
      name: workspace.name,
      initial: workspace.initial,
      colour: workspace.colour,
    },
  }
}

/**
 * The org's most recent project the viewer can still open, with its name, for
 * org settings' "Back to …". Asks for the project list on that page only.
 */
function useLastProject(org: string, enabled: boolean): LastProject | null {
  const projects = useProjects(org, { enabled })
  const list = projects.data
  if (!list) return null
  const match = recentProjects(org)
    .map((slug) => list.find((project) => project.slug === slug))
    .find((project) => project !== undefined)
  return match ? { slug: match.slug, name: match.name } : null
}

/**
 * The new dashboard's frame around every page, and its one scope gate: it
 * resolves every slug in the URL at once, and shows the page only when the
 * viewer can open all of them. Missing and hidden scopes look the same.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const slugs = useScopeSlugs()
  const declaredPage = useDashboardPage()
  const scope = useScope(slugs)
  const viewer = useViewer()
  const last = useLastProject(slugs.org, declaredPage?.kind === 'org-settings')
  const { theme, setTheme } = useThemeStore()
  const { pathname, href } = useLocation()
  const search = useSearch({ strict: false }) as DashboardSearch
  const navigate = useNavigate()
  const notifications = useNotifications(slugs.org)
  const releases = useReleases(slugs.org)

  // A new history entry, as opening one is: Back reopens it rather than standing still.
  function handleCloseOverlay() {
    void navigate({ href: withOverlay(href, null) })
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handleRetry() {
    void scope.refetch()
  }

  const overlays: RailOverlays = {
    here: href,
    unread: notifications.data?.counts.unread ?? 0,
    freshReleases: countFresh(releases.data),
  }
  const found = scope.data?.found === true
  const notFound = scope.data && !scope.data.found ? scope.data.notFound : null

  let content: ReactNode
  if (scope.isPending) content = <ScopeLoading />
  else if (scope.isError)
    content = (
      <PageBody>
        <LoadError
          title="We couldn’t open this page"
          detail="Something went wrong while looking up where you are. Nothing was changed."
          onRetry={handleRetry}
          retrying={scope.isFetching}
        />
      </PageBody>
    )
  else if (notFound) content = <ScopeNotFound notFound={notFound} slugs={slugs} path={pathname} />
  else content = children

  return (
    <DashboardFrame
      scope={frameScope(slugs, scope.data)}
      page={found ? declaredPage : null}
      viewer={viewer.data ?? null}
      lastProject={last}
      overlays={overlays}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    >
      {content}
      {found && (
        <DashboardOverlays org={slugs.org} open={search.open} onClose={handleCloseOverlay} />
      )}
    </DashboardFrame>
  )
}

function ScopeLoading() {
  return (
    <PageBody>
      <LoadingRegion label="Loading">
        <Bone className="h-8 w-56" />
        <Bone className="h-4 w-96 max-w-full" />
      </LoadingRegion>
    </PageBody>
  )
}

interface ScopeNotFoundProps {
  notFound: NotFound
  slugs: ScopeSlugs
  path: string
}

/** The same page whether the scope is missing or hidden from the viewer. */
export function ScopeNotFound({ notFound, slugs, path }: ScopeNotFoundProps) {
  const backToProjects = { label: 'Back to projects', href: orgPath(slugs.org) }
  const links =
    notFound.kind === 'organization'
      ? { primary: { label: 'Choose an organization', href: chooseOrgPath() } }
      : notFound.kind === 'workspace' && notFound.parent
        ? {
            primary: {
              label: `Open ${notFound.parent.name}`,
              href: projectPath({ org: slugs.org, project: notFound.parent.slug }),
            },
            secondary: backToProjects,
          }
        : { primary: backToProjects }
  return (
    <PageBody>
      <NotFoundView
        kind={notFound.kind}
        name={notFound.slug}
        parentName={notFound.parent?.name}
        path={path}
        {...links}
      />
    </PageBody>
  )
}

/** A dashboard URL that names no page, e.g. `/acme/project-101/sales/nope`. */
export function PageNotFound() {
  const slugs = useScopeSlugs()
  const { pathname } = useLocation()
  const name = pathname.split('/').filter(Boolean).pop() ?? ''
  return (
    <PageBody>
      <NotFoundView
        kind="page"
        name={name}
        path={pathname}
        primary={{ label: 'Back to projects', href: orgPath(slugs.org) }}
      />
    </PageBody>
  )
}
