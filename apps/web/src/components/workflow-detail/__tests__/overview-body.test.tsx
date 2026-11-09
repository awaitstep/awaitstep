import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { LiveDeployment } from '@awaitstep/ir'
import type { WorkflowOverview } from '../use-workflow-overview'
import { OverviewBody } from '../overview-body'
import { useOrgStore } from '../../../stores/org-store'
import { BASE, VERSIONS, VIEWER, renderWithPages } from './fixtures/workspace-pages'

vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const WORKFLOW = { id: 'wf_1', name: 'Lead enrichment', createdAt: '', updatedAt: '' }
const LIVE: LiveDeployment = {
  id: 'c-prod',
  name: 'Acme production',
  deploymentId: 'd1',
  serviceUrl: 'https://awaitstep-abc.workers.dev',
  versionId: 'v3',
  version: 12,
  versionLocked: false,
  deployedAt: '2026-11-05T09:00:00.000Z',
  deployedByName: 'Ama',
}

function overview(live: boolean): WorkflowOverview {
  return {
    versions: VERSIONS,
    versionsHasMore: false,
    versionsLoadingMore: false,
    loadMoreVersions: vi.fn(),
    live: live ? [LIVE] : [],
    deployedVersion: live ? { id: 'v3', version: 12, locked: 0 } : undefined,
    deployBlocked: false,
  } as unknown as WorkflowOverview
}

const HOURS = Array.from({ length: 24 }, (_, i) =>
  i === 23 ? { runs: 5, complete: 3, failed: 2 } : { runs: 0, complete: 0, failed: 0 },
)

describe('OverviewBody (WorkflowDetail)', () => {
  it('lists versions for a Viewer with nothing to deploy', () => {
    renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={overview(true)}
        runs24h={{ all: 128, failed: 3, byHour: HOURS }}
        neverDeployed={false}
      />,
      { '["workflow-runs","wf_1"]': [] },
      VIEWER,
    )
    expect(screen.getByText('3 versions in all')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Deploy' })).not.toBeInTheDocument()
  })

  it('says none ran today for a workflow that has run before, and nothing while the day loads', () => {
    const { unmount } = renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={overview(true)}
        runs24h={{ all: 0, failed: 0, byHour: [], ranEver: true }}
        neverDeployed={false}
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    const day = screen.getByRole('region', { name: 'Status' })
    expect(within(day).getByText('None in 24h')).toBeVisible()
    expect(within(day).queryByText('No runs yet')).not.toBeInTheDocument()
    // A deployed workflow without runs: what to do, not "deploy it".
    expect(screen.getByText('Trigger it to see runs here.')).toBeVisible()
    unmount()
    renderWithPages(
      <OverviewBody workflow={WORKFLOW} overview={overview(true)} neverDeployed={false} />,
      { '["workflow-runs","wf_1"]': [] },
    )
    const band = screen.getByRole('region', { name: 'Status' })
    expect(within(band).queryByText(/runs yet|in 24h|failed/)).not.toBeInTheDocument()
  })

  it('offers no Deploy on a locked version, and none at all while the live one is locked', () => {
    const locked = {
      ...overview(true),
      versions: VERSIONS.map((v) => (v.id === 'v1' ? { ...v, locked: 1 } : v)),
    } as WorkflowOverview
    const { unmount } = renderWithPages(
      <OverviewBody workflow={WORKFLOW} overview={locked} neverDeployed={false} />,
      { '["workflow-runs","wf_1"]': [] },
    )
    expect(
      screen.getAllByRole('link', { name: 'Deploy' }).map((a) => a.getAttribute('href')),
    ).toEqual([`${BASE}/deploy?version=v2`])
    expect(screen.getByRole('button', { name: 'Deploy' })).toHaveAttribute(
      'title',
      'This version is locked',
    )
    unmount()
    renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={{ ...overview(true), deployBlocked: true } as WorkflowOverview}
        neverDeployed={false}
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    expect(screen.queryByRole('link', { name: 'Deploy' })).not.toBeInTheDocument()
  })

  it('reads as never deployed: no URL yet, no runs yet, and what to do (WorkflowDraft)', () => {
    renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={{ ...overview(false), versions: [VERSIONS[0]!] } as WorkflowOverview}
        runs24h={{ all: 0, failed: 0, byHour: [] }}
        neverDeployed
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    const band = screen.getByRole('region', { name: 'Status' })
    expect(within(band).getByText('Not deployed')).toBeVisible()
    expect(within(band).getByText(/^v12 saved /)).toBeVisible()
    expect(within(band).getByText('The URL appears once the workflow is deployed.')).toBeVisible()
    expect(within(band).getByText('No runs yet')).toBeVisible()
    expect(screen.getByText('Deploy it, then trigger a run.')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'All runs →' })).not.toBeInTheDocument()
  })
})

describe('OverviewBody for a function (FunctionDetail)', () => {
  it('looks like a workflow’s: the band, its URL to call, versions, and where requests would be', () => {
    renderWithPages(
      <OverviewBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={overview(true)}
        neverDeployed={false}
      />,
      {},
    )
    const band = screen.getByRole('region', { name: 'Status' })
    expect(within(band).getByText('Live · v12')).toBeVisible()
    expect(within(band).getByText('awaitstep-abc.workers.dev')).toBeVisible()
    expect(within(band).getByText('POST to call it.')).toBeVisible()
    expect(within(band).getByText('Requests, 24h')).toBeVisible()
    expect(within(band).getByText('Not recorded.')).toBeVisible()
    expect(within(band).queryByText(/Runs, 24h/)).toBeNull()
    expect(screen.getByText('Versions')).toBeVisible()
    expect(screen.getByText('Recent requests')).toBeVisible()
    expect(screen.getByText('No requests to show')).toBeVisible()
    expect(screen.queryByText('Recent runs')).toBeNull()
  })

  it('says publish, not deploy, on a function’s versions', () => {
    renderWithPages(
      <OverviewBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={overview(true)}
        neverDeployed={false}
      />,
      {},
    )
    expect(screen.getByText('published')).toBeVisible()
    expect(screen.queryByText('deployed')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Publish' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Deploy' })).toBeNull()
  })

  it('doesn’t call a live function unpublished when its deployment has no URL', () => {
    const live = overview(true)
    const noUrl = {
      ...live,
      live: [{ ...LIVE, serviceUrl: null }],
    } as WorkflowOverview
    renderWithPages(
      <OverviewBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={noUrl}
        neverDeployed={false}
      />,
      {},
    )
    const band = screen.getByRole('region', { name: 'Status' })
    expect(within(band).getByText('No URL to show for this deployment.')).toBeVisible()
    expect(within(band).queryByText(/once the function is published/)).toBeNull()
  })

  it('asks for no runs: a function has none', () => {
    // A project to call, so a runs request would reach fetch rather than throw first.
    useOrgStore.setState({ activeOrganizationId: 'org_1', activeProjectId: 'prj_1' })
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [], nextCursor: null })))
    renderWithPages(
      <OverviewBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={overview(true)}
        neverDeployed={false}
      />,
      {},
    )
    expect(fetch.mock.calls.filter((call) => String(call[0]).includes('/runs'))).toEqual([])
    fetch.mockRestore()
    useOrgStore.getState().clear()
  })

  it('says it isn’t published yet, before its first deploy (FunctionDraft)', () => {
    renderWithPages(
      <OverviewBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={{ ...overview(false), versions: [VERSIONS[0]!] } as WorkflowOverview}
        neverDeployed
      />,
      {},
    )
    expect(screen.getByText('Not published')).toBeVisible()
    expect(screen.getByText('The URL appears once the function is published.')).toBeVisible()
    expect(screen.getByText('1 so far')).toBeVisible()
  })
})
