import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { resetMockDb } from '../../../../mocks/dashboard/db'
import {
  TopBarSlotProvider,
  TopBarSlotTarget,
} from '../../../../components/navigation/top-bar-slot'
import { MockScenarioProvider, type MockScenario } from '../../scenario-context'

// Renders a dashboard page against the real dummy server, the way the app
// does: React Query, the `?mock=` / `?as=` context and the top bar's slot.
// Page tests use this instead of mocking the hooks, so they exercise the seam.

export { resetMockDb as resetDashboardData }
/** The dummy tables, for asserting what a page's mutation wrote. */
export { getDb as dashboardDb } from '../../../../mocks/dashboard/db'
export { AMA, DANIEL, PRIYA, TOM } from '../../../../mocks/dashboard/fixtures/people'
/** A failure the dummy server can be made to answer with. */
export { MockApiError } from '../../../../mocks/dashboard/scenario'
/** The dummy server, for spying on how often a page asks it. */
export { mockServer as dashboardServer } from '../../../../mocks/dashboard/server'

interface Options {
  scenario?: MockScenario
  userId?: string
}

export function renderWithDashboardData(ui: ReactElement, options: Options = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // A wrapper, so `rerender` keeps the providers and the cache.
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MockScenarioProvider scenario={options.scenario} userId={options.userId}>
          <TopBarSlotProvider>
            <header aria-label="Top bar">
              <TopBarSlotTarget />
            </header>
            {children}
          </TopBarSlotProvider>
        </MockScenarioProvider>
      </QueryClientProvider>
    )
  }
  const result = render(ui, { wrapper: Wrapper })
  return { ...result, client }
}
