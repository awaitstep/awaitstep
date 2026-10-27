import type { ReactNode } from 'react'
import { ShellLinkProvider } from '../ui/shell-link'
import {
  MockScenarioProvider,
  parseMockScenario,
  parseMockUser,
} from '../../data/dashboard/scenario-context'
import { RouterShellLink } from './router-shell-link'

/** The dev-only search params every dashboard URL may carry. */
export interface DashboardSearch {
  mock?: string
  as?: string
}

export const DASHBOARD_SEARCH_KEYS = ['mock', 'as'] as const

/** Keeps only the dashboard's own params, as strings. */
export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const pick = (key: keyof DashboardSearch) =>
    typeof search[key] === 'string' ? (search[key] as string) : undefined
  return { mock: pick('mock'), as: pick('as') }
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
