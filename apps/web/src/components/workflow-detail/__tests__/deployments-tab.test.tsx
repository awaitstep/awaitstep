import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { LiveDeployment } from '@awaitstep/ir'
import { DeploymentsTab } from '../deployments-tab'
import { BASE, VERSIONS, VIEWER, renderWithPages } from './fixtures/workspace-pages'

vi.mock('../../overview/deploy-action', () => ({
  DeployButton: () => <button type="button">Deploy</button>,
}))
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
  connectionName: null as string | null,
})
const WORKFLOW = { id: 'wf_1', name: 'Lead enrichment', createdAt: '', updatedAt: '' }
const ACCOUNTS = new Map([
  ['c-prod', 'Acme production'],
  ['c-stage', 'Checkout staging'],
])

type Row = ReturnType<typeof deploy>

/** What the API's `deployedWith` says of these rows: each account's newest success. */
function liveOf(deployments: Row[], locked: string[] = []): LiveDeployment[] {
  const seen = new Set<string>()
  return deployments.flatMap((d) => {
    if (d.status !== 'success' || seen.has(d.connectionId)) return []
    seen.add(d.connectionId)
    return [
      {
        id: d.connectionId,
        name: ACCOUNTS.get(d.connectionId) ?? d.connectionId,
        deploymentId: d.id,
        serviceUrl: d.serviceUrl,
        versionId: d.versionId,
        version: d.version,
        versionLocked: locked.includes(d.connectionId),
        deployedAt: d.createdAt,
        deployedByName: d.createdByName,
      },
    ]
  })
}

function renderTab(
  deployments: Row[],
  lockedAccounts: string[] = [],
  neverDeployed = true,
  access = undefined as Parameters<typeof renderWithPages>[2],
  offered = ['c-prod', 'c-stage'],
) {
  const live = liveOf(deployments, lockedAccounts)
  return renderWithPages(
    <DeploymentsTab
      workflow={WORKFLOW}
      accounts={ACCOUNTS}
      overview={{
        live,
        offeredIds: new Set(offered),
        lockedOn: (id) => !!id && lockedAccounts.includes(id),
      }}
      neverDeployed={neverDeployed}
    />,
    { '["deployments","wf_1"]': deployments, '["versions","wf_1"]': VERSIONS },
    access,
  )
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('DeploymentsTab (WorkflowDeployments)', () => {
  it('says what is live on each account, by whom, with its URL to open', () => {
    renderTab([
      deploy('d3', 'v3', 'success', 'c-prod', 'Ama Mensah'),
      deploy('d2', 'v2', 'success', 'c-stage', null),
      deploy('d1', 'v1', 'failed', 'c-prod', 'Lena Ortiz'),
    ])
    expect(screen.getByText('v12 on Acme production')).toBeVisible()
    expect(screen.getByText('v11 on Checkout staging')).toBeVisible()
    expect(screen.getByText(/awaitstep-abc\.workers\.dev · deployed by Ama Mensah,/)).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute(
      'href',
      'https://awaitstep-abc.workers.dev',
    )
  })

  it('marks an account the project no longer deploys to', () => {
    renderTab([deploy('d3', 'v3', 'success', 'c-prod', null)], [], false, undefined, [])
    expect(screen.getByText('Not this project’s any more')).toBeVisible()
  })

  it('tags each account’s newest deploy live, the taken-down and failed ones, and rolls back to the row’s account', () => {
    renderTab([
      deploy('d4', 'v3', 'success', 'c-prod', 'Ama Mensah'),
      deploy('d3', 'v2', 'success', 'c-stage', null),
      deploy('d2', 'v2', 'success', 'c-prod', null),
      deploy('d1', 'v1', 'failed', 'c-prod', 'Lena Ortiz'),
      deploy('d0', 'v1', 'taken_down', 'c-stage', null),
    ])
    const [liveProd, liveStage, older, failed, takenDown] = rows()
    expect(liveProd).toHaveTextContent('v12live')
    expect(liveStage).toHaveTextContent('v11live')
    expect(within(liveStage!).queryByRole('link', { name: 'Roll back' })).toBeNull()
    expect(older).not.toHaveTextContent('live')
    expect(within(older!).getByRole('link', { name: 'Roll back' })).toHaveAttribute(
      'href',
      `${BASE}/deploy?version=v2&connection=c-prod`,
    )
    expect(failed).toHaveTextContent('failed')
    expect(within(failed!).queryByRole('link', { name: 'Roll back' })).toBeNull()
    expect(takenDown).toHaveTextContent('taken down')
    expect(within(takenDown!).getByRole('link', { name: 'Redeploy' })).toHaveAttribute(
      'href',
      `${BASE}/deploy?version=v1&connection=c-stage`,
    )
    expect(
      screen.getByText('Rolling back redeploys that version to the same account.'),
    ).toBeVisible()
  })

  it('offers no Roll back to an account the project dropped: Deploy would go elsewhere', () => {
    renderTab(
      [
        deploy('d3', 'v3', 'success', 'c-stage', null),
        deploy('d2', 'v2', 'taken_down', 'c-prod', null),
      ],
      [],
      false,
      undefined,
      ['c-stage'],
    )
    const [, dropped] = rows()
    expect(within(dropped!).queryByRole('link', { name: 'Redeploy' })).toBeNull()
  })

  it('names a row’s account from the list itself', () => {
    renderTab([{ ...deploy('d2', 'v2', 'taken_down', 'c-gone', null), connectionName: 'Old prod' }])
    expect(rows()[0]).toHaveTextContent('Old prod')
  })

  it('offers a Viewer no Roll back', () => {
    renderTab(
      [
        deploy('d3', 'v3', 'success', 'c-prod', 'Ama Mensah'),
        deploy('d2', 'v2', 'success', 'c-stage', null),
      ],
      [],
      false,
      VIEWER,
    )
    expect(screen.queryByRole('link', { name: 'Roll back' })).toBeNull()
  })

  it('holds Roll back only on the account whose live version is locked', () => {
    renderTab(
      [
        deploy('d4', 'v3', 'success', 'c-prod', null),
        deploy('d3', 'v3', 'success', 'c-stage', null),
        deploy('d2', 'v2', 'success', 'c-prod', null),
        deploy('d1', 'v2', 'success', 'c-stage', null),
      ],
      ['c-prod'],
    )
    const [, , onProd, onStage] = rows()
    expect(within(onProd!).getByRole('button', { name: 'Roll back' })).toBeDisabled()
    expect(within(onStage!).getByRole('link', { name: 'Roll back' })).toHaveAttribute(
      'href',
      `${BASE}/deploy?version=v2&connection=c-stage`,
    )
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
      `${BASE}/deploy?version=v0&connection=c-prod`,
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

  it('says a taken-down workflow isn’t deployed, not that it never was', () => {
    renderTab([], [], false)
    expect(screen.getByText('Not deployed')).toBeVisible()
    expect(screen.queryByText('Never deployed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeVisible()
  })

  it('says it has never gone out, and offers Deploy (WorkflowDraft)', () => {
    renderTab([])
    expect(screen.getByText('Never deployed')).toBeVisible()
    expect(
      screen.getByText(
        'The live URL, who deployed what, and rollback all appear here after the first deploy.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeVisible()
  })
})
