import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api-client'
import { useOrgStore } from '../../../stores/org-store'
import { LegacyItemRedirect, legacyItemTarget } from '../legacy-item-redirect'

const navigated = vi.hoisted(() => [] as unknown[])
const loaded = vi.hoisted(() => ({
  workflow: { id: 'wf_1', workspaceId: 'ws_sales' } as unknown,
  /** The status the read fails with, if it does. */
  failWith: null as number | null,
}))

vi.mock('@tanstack/react-router', () => ({
  Navigate: (props: unknown) => {
    navigated.push(props)
    return null
  },
  useLocation: () => ({ pathname: '/workflows/wf_1' }),
}))
vi.mock('../../ui/shell-link', () => ({
  ShellLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('../../../lib/queries', () => ({
  queries: {
    workflows: {
      detail: (id: string) => ({
        queryKey: ['workflow', id],
        queryFn: async () => {
          if (loaded.failWith) throw new ApiError('Failed', loaded.failWith)
          return loaded.workflow
        },
      }),
    },
  },
}))
vi.mock('../../../data/dashboard/workspaces', () => ({
  useWorkspaces: (_org: string, _project: string, { enabled }: { enabled: boolean }) => ({
    data: enabled ? [{ id: 'ws_sales', slug: 'sales' }] : undefined,
    isError: false,
  }),
}))

const SALES = { org: 'acme', project: 'core', workspace: 'sales' }

function seedSwitcher() {
  useOrgStore.setState({
    appReady: true,
    organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme', createdAt: '' }],
    projects: [
      {
        id: 'prj_1',
        organizationId: 'org_1',
        name: 'Core',
        slug: 'core',
        createdAt: '',
        updatedAt: '',
      },
    ],
    activeOrganizationId: 'org_1',
    activeProjectId: 'prj_1',
  })
}

function renderRedirect(page: Parameters<typeof LegacyItemRedirect>[0]['page']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LegacyItemRedirect workflowId="wf_1" page={page} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  useOrgStore.getState().clear()
  navigated.length = 0
  loaded.failWith = null
})

describe('legacyItemTarget', () => {
  it('maps each old page to its workspace URL', () => {
    const base = '/acme/core/sales/workflows/wf_1'
    expect(legacyItemTarget(SALES, 'wf_1', { kind: 'overview' })).toBe(`${base}/overview`)
    expect(legacyItemTarget(SALES, 'wf_1', { kind: 'runs' })).toBe(`${base}/runs`)
    expect(legacyItemTarget(SALES, 'wf_1', { kind: 'deployments' })).toBe(`${base}/deployments`)
    expect(legacyItemTarget(SALES, 'wf_1', { kind: 'deploy', version: 'v 2' })).toBe(
      `${base}/deploy?version=v+2`,
    )
    expect(legacyItemTarget(SALES, 'wf_1', { kind: 'run', runId: 'run_9' })).toBe(
      `${base}/runs/run_9`,
    )
    expect(
      legacyItemTarget(SALES, 'wf_1', {
        kind: 'editor',
        search: { view: 'ide', version: 'v1', file: 'lib/a.ts' },
      }),
    ).toBe(`${base}?view=ide&version=v1&file=lib%2Fa.ts`)
  })
})

describe('LegacyItemRedirect', () => {
  it('replaces an old link with the workflow’s own workspace URL', async () => {
    seedSwitcher()
    renderRedirect({ kind: 'editor', search: { view: 'canvas' } })
    await vi.waitFor(() => expect(navigated).toHaveLength(1))
    expect(navigated[0]).toEqual({
      to: '/acme/core/sales/workflows/wf_1',
      search: { view: 'canvas' },
      replace: true,
    })
  })

  it('says not found when the switcher’s project has no such workflow', async () => {
    seedSwitcher()
    loaded.failWith = 404
    renderRedirect({ kind: 'overview' })
    expect(await screen.findByRole('heading', { name: 'We can’t find that page' })).toBeVisible()
    expect(navigated).toHaveLength(0)
  })

  it('says not found once the org has no project to look in, instead of loading forever', async () => {
    seedSwitcher()
    useOrgStore.setState({ projects: [], activeProjectId: null, projectsFetchState: 'success' })
    renderRedirect({ kind: 'overview' })
    expect(await screen.findByRole('heading', { name: 'We can’t find that page' })).toBeVisible()
  })

  it('offers a retry, not not-found, when the read fails for another reason', async () => {
    seedSwitcher()
    loaded.failWith = 503
    renderRedirect({ kind: 'overview' })
    expect(
      await screen.findByText('We couldn’t open this workflow', {}, { timeout: 5000 }),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'We can’t find that page' })).toBeNull()
  })
})
