import type { ReactNode } from 'react'
import { ShellLinkProvider } from '../ui/shell-link'
import {
  MockScenarioProvider,
  parseMockScenario,
  parseMockUser,
} from '../../data/dashboard/scenario-context'
import { DataSourceProvider, type DataSource } from '../../data/dashboard/source'
import { useAuthStore } from '../../stores/auth-store'
import { RouterShellLink } from './router-shell-link'

/** The search params every dashboard URL may carry. */
export interface DashboardSearch {
  /** Dev only: a forced state (`loading`, `error`, `empty`, `viewer`). */
  mock?: string
  /** Dev only: the sample person the dummy session runs as. */
  as?: string
  /**
   * Which "New …" dialog to open on arrival (`project`, `workspace`, `org`):
   * the switchers link to it, and the page that owns the dialog reads it.
   */
  new?: string
  /** What follows the dialog: `import` after New project (P2 opens Import). */
  then?: string
  /** Org Members: whose access to edit (a user id), or `add` (P5's access editor). */
  access?: string
  /** With `access=add`: the project to add people to. */
  project?: string
  /** Variables: the variable to edit (P6's dialog). */
  variable?: string
  /** Workspace settings and Resources: the open tab; none = the first. */
  tab?: string
  /** The Inbox or What's new, open over the page (`inbox`, `whats-new`). */
  open?: string
}

/** Kept from page to page; the dialog params are not, so a dialog doesn't follow you around. */
export const DASHBOARD_SEARCH_KEYS = ['mock', 'as'] as const

/** Keeps only the dashboard's own params, as strings. */
export function validateDashboardSearch(
  search: Record<string, unknown>,
  allowMock: boolean = ALLOW_MOCK_SOURCE,
): DashboardSearch {
  // The router JSON-parses search values, so `?override=1` arrives as 1 and
  // `?variable=true` as true; our links build them as text, so read them back as text.
  const pick = (key: keyof DashboardSearch) => {
    const value = search[key]
    if (typeof value === 'string') return value
    return typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
  }
  return {
    // Dropped where the dummy source is off, so they are not carried from page to page either.
    mock: allowMock ? pick('mock') : undefined,
    as: allowMock ? pick('as') : undefined,
    new: pick('new'),
    then: pick('then'),
    access: pick('access'),
    project: pick('project'),
    variable: pick('variable'),
    tab: pick('tab'),
    open: pick('open'),
  }
}

interface DashboardProvidersProps {
  search: DashboardSearch
  children: ReactNode
}

/**
 * The dummy source is for `pnpm dev` and tests; a production build only ever shows real data.
 * Decided by the build mode, not `import.meta.env.DEV`: `vite build` is always `production`,
 * while DEV follows NODE_ENV, which the root `.env` sets to `development`.
 */
export function mockSourceAllowed(mode: string): boolean {
  return mode !== 'production'
}

const ALLOW_MOCK_SOURCE = mockSourceAllowed(import.meta.env.MODE)

/**
 * The real API, unless the URL asks for a dummy scenario or a sample person and
 * `allowMock` (a dev build). Elsewhere those params are ignored.
 */
export function dataSourceFor(
  search: Pick<DashboardSearch, 'mock' | 'as'>,
  allowMock: boolean,
): DataSource {
  return allowMock && (search.mock || search.as) ? 'mock' : 'api'
}

/**
 * What every page of the new dashboard renders inside: the data source the
 * URL asks for — the API, or the dummy session (`?mock=`, `?as=`) — and
 * router-aware kit links. On the API, features still on dummy data run as
 * the signed-in user against an empty dummy scope.
 */
export function DashboardProviders({ search, children }: DashboardProvidersProps) {
  const source = dataSourceFor(search, ALLOW_MOCK_SOURCE)
  const userId = useAuthStore((s) => s.user?.id)
  return (
    <DataSourceProvider source={source}>
      <MockScenarioProvider
        scenario={source === 'api' ? 'empty' : parseMockScenario(search.mock)}
        userId={source === 'api' ? (userId ?? 'you') : parseMockUser(search.as)}
        real={source === 'api'}
      >
        <ShellLinkProvider link={RouterShellLink}>{children}</ShellLinkProvider>
      </MockScenarioProvider>
    </DataSourceProvider>
  )
}
