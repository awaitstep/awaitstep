import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { WorkflowOverview } from '../use-workflow-overview'
import { FunctionBody } from '../function-body'
import { OverviewBody } from '../overview-body'
import { BASE, VERSIONS, VIEWER, renderWithPages } from './fixtures/workspace-pages'

vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const WORKFLOW = { id: 'wf_1', name: 'Lead enrichment', createdAt: '', updatedAt: '' }
const LIVE = {
  id: 'd1',
  workflowId: 'wf_1',
  versionId: 'v3',
  connectionId: 'c-prod',
  serviceName: 'svc',
  serviceUrl: 'https://awaitstep-abc.workers.dev',
  status: 'success',
  error: null,
  createdAt: '2026-11-05T09:00:00.000Z',
}

function overview(live: boolean): WorkflowOverview {
  return {
    versions: VERSIONS,
    versionsHasMore: false,
    versionsLoadingMore: false,
    loadMoreVersions: vi.fn(),
    activeDeployment: live ? LIVE : undefined,
    deployedVersion: live ? { id: 'v3', version: 12, locked: 0 } : undefined,
    deployBlocked: false,
  } as unknown as WorkflowOverview
}

const ACCOUNTS = new Map([['c-prod', 'Acme production']])

const HOURS = Array.from({ length: 24 }, (_, i) =>
  i === 23 ? { runs: 5, complete: 3, failed: 2 } : { runs: 0, complete: 0, failed: 0 },
)

describe('OverviewBody (WorkflowDetail)', () => {
  it('bands what is live, where a POST runs it and the day’s runs, hour by hour', () => {
    renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={overview(true)}
        accounts={ACCOUNTS}
        runs24h={{ all: 128, failed: 3, byHour: HOURS }}
        neverDeployed={false}
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    const band = screen.getByRole('region', { name: 'Status' })
    expect(within(band).getByText('Live · v12')).toBeVisible()
    expect(within(band).getByText(/^on Acme production, /)).toBeVisible()
    expect(within(band).getByRole('link', { name: /Open/ })).toHaveAttribute(
      'href',
      'https://awaitstep-abc.workers.dev',
    )
    expect(within(band).getByText('awaitstep-abc.workers.dev')).toBeVisible()
    // Only runs started from AwaitStep are recorded: the band says so beside the URL.
    expect(
      within(band).getByText('POST to run it. Only runs started from AwaitStep show in Runs.'),
    ).toBeVisible()
    expect(within(band).getByText('128')).toBeVisible()
    expect(within(band).getByText('3 failed')).toHaveClass('text-status-error')
    expect(within(band).getByRole('img', { name: 'Runs over the last 24 hours' })).toBeVisible()
    // Versions beside Recent runs; the live one is tagged, the others can go out.
    expect(screen.getByText('3 versions in all')).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: 'Deploy' }).map((a) => a.getAttribute('href')),
    ).toEqual([`${BASE}/deploy?version=v2`, `${BASE}/deploy?version=v1`])
    expect(screen.getByText('deployed')).toBeVisible()
  })

  it('lists versions for a Viewer with nothing to deploy', () => {
    renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={overview(true)}
        accounts={ACCOUNTS}
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
        accounts={ACCOUNTS}
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
      <OverviewBody
        workflow={WORKFLOW}
        overview={overview(true)}
        accounts={ACCOUNTS}
        neverDeployed={false}
      />,
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
      <OverviewBody
        workflow={WORKFLOW}
        overview={locked}
        accounts={ACCOUNTS}
        neverDeployed={false}
      />,
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
        accounts={ACCOUNTS}
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
        accounts={ACCOUNTS}
        runs24h={{ all: 0, failed: 0, byHour: [] }}
        neverDeployed
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    const band = screen.getByRole('region', { name: 'Status' })
    expect(within(band).getByText('Not deployed')).toBeVisible()
    expect(within(band).getByText(/^v12 saved /)).toBeVisible()
    expect(within(band).getByText('Deploy it to get a URL and start running.')).toBeVisible()
    expect(within(band).getByText('The URL appears once the workflow is deployed.')).toBeVisible()
    expect(within(band).getByText('No runs yet')).toBeVisible()
    expect(screen.getByText('1 so far')).toBeVisible()
    expect(screen.getByText('Deploy it, then trigger a run.')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'All runs →' })).not.toBeInTheDocument()
  })
})

describe('FunctionBody (FunctionDetail)', () => {
  it('draws only what is recorded: its version, where it is live and its versions', () => {
    renderWithPages(
      <FunctionBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={overview(true)}
        accounts={ACCOUNTS}
        neverDeployed={false}
      />,
      {},
    )
    expect(screen.queryByText(/Used by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Calls/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Recent runs')).not.toBeInTheDocument()
    expect(screen.getByText('Versions')).toBeVisible()
    expect(screen.getByText('awaitstep-abc.workers.dev')).toBeVisible()
  })

  it('says it isn’t published yet, before its first deploy (FunctionDraft)', () => {
    renderWithPages(
      <FunctionBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={{ ...overview(false), versions: [VERSIONS[0]!] } as WorkflowOverview}
        accounts={ACCOUNTS}
        neverDeployed
      />,
      {},
    )
    expect(screen.getAllByText('Not published')).toHaveLength(2)
    expect(screen.getByText('1 so far')).toBeVisible()
    expect(screen.getByText('Publish it to call it')).toBeVisible()
  })
})
