import type { ReactNode } from 'react'
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { useNotificationCount, useReleases } from '../../data/dashboard/inbox'
import { useViewer } from '../../data/dashboard/session'
import { withOverlay } from '../../lib/dashboard-paths'
import { useThemeStore } from '../../stores/theme-store'
import type { Organization } from '../../stores/org-store'
import { DashboardOverlays } from '../inbox/dashboard-overlays'
import { DashboardFrame, type FrameScope } from './dashboard-frame'
import { countFresh, useDashboardPage } from './dashboard-shell'
import type { DashboardSearch } from './dashboard-providers'
import { useBorrowedOrg } from './current-org'
import type { RailOverlays } from './nav-model'

/** The frame scope for an org-less page: its borrowed org, no project or workspace. */
function orgLessScope(org: Organization): FrameScope {
  const name = org.name || org.slug
  return {
    slugs: { org: org.slug },
    org: {
      name,
      initial: name.charAt(0).toUpperCase(),
      logo: org.logo ?? null,
    },
  }
}

/**
 * The dashboard frame around a top-level, org-less page (your account, the API
 * Playground). It reuses the whole rail, panel and top bar, framed by the
 * current organization, but runs no scope gate: the page belongs to you, not to
 * a slug in the URL, so there is nothing to resolve or forbid.
 */
export function OrgLessShell({ children }: { children: ReactNode }) {
  const org = useBorrowedOrg()
  const declaredPage = useDashboardPage()
  const viewer = useViewer()
  const { theme, setTheme } = useThemeStore()
  const { href } = useLocation()
  const search = useSearch({ strict: false }) as DashboardSearch
  const navigate = useNavigate()
  const notifications = useNotificationCount(org.slug)
  const releases = useReleases(org.slug)

  // A new history entry, as opening one is: Back reopens it rather than standing still.
  function handleCloseOverlay() {
    void navigate({ href: withOverlay(href, null) })
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const overlays: RailOverlays = {
    here: href,
    unread: notifications.data ?? 0,
    freshReleases: countFresh(releases.data),
  }

  return (
    <DashboardFrame
      scope={orgLessScope(org)}
      page={declaredPage}
      viewer={viewer.data ?? null}
      overlays={overlays}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    >
      {children}
      <DashboardOverlays org={org.slug} open={search.open} onClose={handleCloseOverlay} />
    </DashboardFrame>
  )
}
