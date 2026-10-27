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
}

/** Kept from page to page; `new` and `then` are not, so a dialog doesn't follow you around. */
export const DASHBOARD_SEARCH_KEYS = ['mock', 'as'] as const

/** Keeps only the dashboard's own params, as strings. */
export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const pick = (key: keyof DashboardSearch) =>
    typeof search[key] === 'string' ? (search[key] as string) : undefined
  return { mock: pick('mock'), as: pick('as'), new: pick('new'), then: pick('then') }
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
