import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { WorkflowOverview } from '../use-workflow-overview'
import { FunctionBody } from '../function-body'
import { OverviewBody } from '../overview-body'
import { BASE, VERSIONS, renderWithPages } from './fixtures/workspace-pages'

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
    deployBlocked: false,
  } as unknown as WorkflowOverview
}

const ACCOUNTS = new Map([['c-prod', 'Acme production']])

describe('OverviewBody (WorkflowDetail)', () => {
  it('shows the version and who saved it, what is live and where, and the day’s runs', () => {
    renderWithPages(
      <OverviewBody
        workflow={WORKFLOW}
        overview={overview(true)}
        accounts={ACCOUNTS}
        runs24h={{ all: 128, failed: 3 }}
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    expect(screen.getByText('v12', { selector: 'span' })).toBeVisible()
    expect(screen.getByText(/^Updated .* by Ama Mensah$/)).toBeVisible()
    expect(screen.getByText('Live')).toBeVisible()
    expect(screen.getByText(/^Acme production · /)).toBeVisible()
    expect(screen.getByText('128')).toBeVisible()
    expect(screen.getByText('3 failed')).toBeVisible()
    expect(screen.getByText('3 versions in all')).toBeVisible()
    // The live version is tagged, the others can be deployed.
    expect(
      screen.getAllByRole('link', { name: 'Deploy' }).map((a) => a.getAttribute('href')),
    ).toEqual([`${BASE}/deploy?version=v2`, `${BASE}/deploy?version=v1`])
    expect(screen.getByText('deployed')).toBeVisible()
    expect(screen.getByText('awaitstep-abc.workers.dev')).toBeVisible()
  })

  it('offers no Deploy on a locked version, and none at all while the live one is locked', () => {
    const locked = {
      ...overview(true),
      versions: VERSIONS.map((v) => (v.id === 'v1' ? { ...v, locked: 1 } : v)),
    } as WorkflowOverview
    const { unmount } = renderWithPages(
      <OverviewBody workflow={WORKFLOW} overview={locked} accounts={ACCOUNTS} />,
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
      />,
      { '["workflow-runs","wf_1"]': [] },
    )
    expect(screen.queryByRole('link', { name: 'Deploy' })).not.toBeInTheDocument()
  })

  it('offers no URL to POST to while nothing is live', () => {
    renderWithPages(
      <OverviewBody workflow={WORKFLOW} overview={overview(false)} accounts={ACCOUNTS} />,
      { '["workflow-runs","wf_1"]': [] },
    )
    expect(screen.getByText('Not deployed')).toBeVisible()
    expect(screen.queryByText('POST to run it.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Deploy' })).toHaveLength(3)
  })
})

describe('FunctionBody (FunctionDetail)', () => {
  it('draws only what is recorded: its version, where it is live and its versions', () => {
    renderWithPages(
      <FunctionBody
        workflow={{ ...WORKFLOW, kind: 'script' }}
        overview={overview(true)}
        accounts={ACCOUNTS}
      />,
      {},
    )
    expect(screen.queryByText(/Used by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Calls/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Recent runs')).not.toBeInTheDocument()
    expect(screen.getByText('Versions')).toBeVisible()
    expect(screen.getByText('awaitstep-abc.workers.dev')).toBeVisible()
  })
})
