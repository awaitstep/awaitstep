import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { onTestFinished } from 'vitest'
import { TopBarSlotProvider, TopBarSlotTarget } from '../../components/navigation/top-bar-slot'
import { MockScenarioProvider } from '../../data/dashboard/scenario-context'
import { DataSourceProvider } from '../../data/dashboard/source'
import { useAuthStore } from '../../stores/auth-store'
import { authSession } from '../fixtures/api'
import { installFakeApi, type FakeApi, type FakeApiOptions } from './fake-api'

/** The query client a dashboard test renders with: no retries, so a refusal shows at once. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/**
 * The app's providers on the API source, as `DashboardProviders` sets them up
 * for a signed-in person, plus the top bar's slot. A wrapper, so `rerender`
 * keeps the providers and the cache.
 */
export function dashboardApiWrapper(client: QueryClient, viewer: string) {
  return function DashboardApiWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source="api">
          <MockScenarioProvider scenario="empty" userId={viewer} real>
            <TopBarSlotProvider>
              <header aria-label="Top bar">
                <TopBarSlotTarget />
              </header>
              {children}
            </TopBarSlotProvider>
          </MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
}

/** Signs `api.viewer` in, as the dashboard's layout does from its loader. */
export function signInAs(api: FakeApi): void {
  useAuthStore.getState().setSession(authSession(api.now, api.viewer))
  onTestFinished(() => useAuthStore.getState().clear())
}

export interface RenderWithDashboardApiOptions extends FakeApiOptions {
  /**
   * A fake installed (and changed) before the render: the page asks on its
   * first render, so an answer it needs then is set up first. The fake's
   * own options then go to `installFakeApi`, not here.
   */
  api?: FakeApi
}

/**
 * Renders a dashboard page against the fake API: the hooks take their API
 * branch, so the page runs its real `dashboardApi` calls and mappers.
 */
export function renderWithDashboardApi(
  ui: ReactElement,
  options: RenderWithDashboardApiOptions = {},
) {
  const { api: installed, ...fakeOptions } = options
  if (installed && Object.keys(fakeOptions).length > 0) {
    throw new Error(
      'Fake API: pass viewer, now and routes to installFakeApi when handing over `api`',
    )
  }
  const api = installed ?? installFakeApi(fakeOptions)
  signInAs(api)
  const client = createTestQueryClient()
  const result = render(ui, { wrapper: dashboardApiWrapper(client, api.viewer) })
  return { ...result, client, api }
}
