import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { DeploymentsTab } from '../deployments-tab'
import { BASE, VERSIONS, renderWithPages } from './fixtures/workspace-pages'

vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const NUMBERS: Record<string, number> = { v3: 12, v2: 11, v1: 10, v0: 4 }

const deploy = (
  id: string,
  versionId: string,
  status: string,
  connectionId: string,
  by: string | null,
  versionLocked = 0,
) => ({
  id,
  workflowId: 'wf_1',
  versionId,
  connectionId,
  serviceName: id,
  serviceUrl: status === 'success' ? 'https://awaitstep-abc.workers.dev' : null,
  status,
  error: null,
  createdAt: '2026-11-05T09:00:00.000Z',
  createdByName: by,
  version: NUMBERS[versionId] ?? null,
  versionLocked,
})
const ACCOUNTS = new Map([
  ['c-prod', 'Acme production'],
  ['c-stage', 'Checkout staging'],
])

function renderTab(deployments: unknown[], deployBlocked = false) {
  return renderWithPages(
    <DeploymentsTab workflowId="wf_1" accounts={ACCOUNTS} deployBlocked={deployBlocked} />,
    { '["deployments","wf_1"]': deployments, '["versions","wf_1"]': VERSIONS },
  )
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('DeploymentsTab (WorkflowDeployments)', () => {
  it('says what is live, on which account, by whom, with its URL to open', () => {
    renderTab([
      deploy('d3', 'v3', 'success', 'c-prod', 'Ama Mensah'),
      deploy('d2', 'v2', 'success', 'c-stage', null),
      deploy('d1', 'v1', 'failed', 'c-prod', 'Lena Ortiz'),
    ])
    expect(screen.getByText('v12 on Acme production')).toBeVisible()
    expect(screen.getByText(/awaitstep-abc\.workers\.dev · deployed by Ama Mensah,/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://awaitstep-abc.workers.dev',
    )
  })

  it('lists the history with live and failed tags, and Roll back only where it can go out again', () => {
    renderTab([
      deploy('d3', 'v3', 'success', 'c-prod', 'Ama Mensah'),
      deploy('d2', 'v2', 'success', 'c-stage', null),
      deploy('d1', 'v1', 'failed', 'c-prod', 'Lena Ortiz'),
    ])
    const [live, older, failed] = rows()
    expect(live).toHaveTextContent('v12live')
    expect(within(live!).queryByRole('link', { name: 'Roll back' })).toBeNull()
    expect(older).toHaveTextContent('Checkout staging')
    expect(within(older!).getByRole('link', { name: 'Roll back' })).toHaveAttribute(
      'href',
      `${BASE}/deploy?version=v2`,
    )
    expect(failed).toHaveTextContent('failed')
    expect(within(failed!).queryByRole('link', { name: 'Roll back' })).toBeNull()
    expect(
      screen.getByText('Rolling back redeploys that version. Nothing is deleted from Cloudflare.'),
    ).toBeVisible()
  })

  it('holds Roll back while the deployed version is locked: a disabled button, not a link', () => {
    renderTab(
      [
        deploy('d3', 'v3', 'success', 'c-prod', null),
        deploy('d2', 'v2', 'success', 'c-prod', null),
      ],
      true,
    )
    expect(screen.queryByRole('link', { name: 'Roll back' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll back' })).toBeDisabled()
  })

  it('rolls back to a version older than the ones loaded: the row knows its number', () => {
    renderTab([
      deploy('d3', 'v3', 'success', 'c-prod', null),
      deploy('d0', 'v0', 'success', 'c-prod', null),
    ])
    const older = rows()[1]!
    expect(older).toHaveTextContent('v4')
    expect(within(older).getByRole('link', { name: 'Roll back' })).toHaveAttribute(
      'href',
      `${BASE}/deploy?version=v0`,
    )
  })

  it('offers no Roll back to a version that is itself locked, saying why', () => {
    renderTab([
      deploy('d3', 'v3', 'success', 'c-prod', null),
      deploy('d2', 'v2', 'success', 'c-prod', null, 1),
    ])
    const button = screen.getByRole('button', { name: 'Roll back' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'This version is locked')
  })

  it('points to Deploy when it has never gone out', () => {
    renderTab([])
    expect(screen.getByRole('link', { name: 'Deploy it' })).toHaveAttribute(
      'href',
      `${BASE}/deploy`,
    )
  })
})
