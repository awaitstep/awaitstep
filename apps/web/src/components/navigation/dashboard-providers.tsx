import type { ReactNode } from 'react'
import { ShellLinkProvider } from '../ui/shell-link'
import {
  MockScenarioProvider,
  parseMockScenario,
  parseMockUser,
} from '../../data/dashboard/scenario-context'
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
  /** With `variable`: `1` overrides an inherited value instead of editing it. */
  override?: string
  /** Workspace settings: the open tab (`members`, `keys`, `variables`); none = General. */
  tab?: string
}

/** Kept from page to page; the dialog params are not, so a dialog doesn't follow you around. */
export const DASHBOARD_SEARCH_KEYS = ['mock', 'as'] as const

/** Keeps only the dashboard's own params, as strings. */
export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const pick = (key: keyof DashboardSearch) =>
    typeof search[key] === 'string' ? (search[key] as string) : undefined
  return {
    mock: pick('mock'),
    as: pick('as'),
    new: pick('new'),
    then: pick('then'),
    access: pick('access'),
    project: pick('project'),
    variable: pick('variable'),
    override: pick('override'),
    tab: pick('tab'),
  }
}

interface DashboardProvidersProps {
  search: DashboardSearch
  children: ReactNode
}

/**
 * What every page of the new dashboard renders inside: the dummy session the
 * URL asks for (`?mock=`, `?as=`) and router-aware kit links.
 */
export function DashboardProviders({ search, children }: DashboardProvidersProps) {
  return (
    <MockScenarioProvider
      scenario={parseMockScenario(search.mock)}
      userId={parseMockUser(search.as)}
    >
      <ShellLinkProvider link={RouterShellLink}>{children}</ShellLinkProvider>
    </MockScenarioProvider>
  )
}
