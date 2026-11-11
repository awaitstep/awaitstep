import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { RunsTab } from '../runs-tab'
import { BASE, VERSIONS, renderWithPages } from './fixtures/workspace-pages'

vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('../../overview/deploy-action', () => ({
  DeployButton: () => <button type="button">Deploy</button>,
}))
vi.mock('../../../hooks/use-active-run-sync', () => ({ useActiveRunSync: () => undefined }))

const WORKFLOW = { id: 'wf_1', name: 'Lead enrichment', createdAt: '', updatedAt: '' }

const run = (
  id: string,
  status: string,
  versionId: string | null,
  ms: number,
  versionNumber: number | null = null,
) => ({
  id,
  workflowId: 'wf_1',
  versionId,
  versionNumber,
  connectionId: null,
  instanceId: id,
  status,
  output: null,
  error: null,
  createdAt: '2026-11-05T09:00:00.000Z',
  updatedAt: new Date(Date.parse('2026-11-05T09:00:00.000Z') + ms).toISOString(),
})

describe('RunsTab', () => {
  it('reads Result · Run · Version · Took · Started, each run opening its page', () => {
    renderWithPages(
      <RunsTab workflow={WORKFLOW} neverDeployed={false} runs24h={{ all: 128, failed: 3 }} />,
      {
        '["workflow-runs","wf_1",null]': [
          run('run_a', 'errored', 'v3', 1200),
          run('run_b', 'complete', 'v2', 900),
          run('run_c', 'running', 'gone', 0),
        ],
        '["versions","wf_1"]': VERSIONS,
      },
    )
    expect(screen.getByText('128 in the last 24h · 3 failed')).toBeVisible()
    const [failed, ok, going] = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(failed).toHaveTextContent('Failed')
    expect(failed).toHaveTextContent('v12')
    expect(failed).toHaveTextContent('1.2s')
    expect(within(failed!).getByRole('link', { name: 'run_a' })).toHaveAttribute(
      'href',
      `${BASE}/runs/run_a`,
    )
    expect(ok).toHaveTextContent('Succeeded')
    expect(ok).toHaveTextContent('v11')
    // Still going: no duration; a version not loaded reads as a dash.
    expect(going).toHaveTextContent('Running')
    expect(going).toHaveTextContent('—')
  })

  it('names the version a run kept after that version was deleted', () => {
    renderWithPages(<RunsTab workflow={WORKFLOW} neverDeployed={false} />, {
      '["workflow-runs","wf_1",null]': [run('run_old', 'complete', null, 900, 4)],
    })
    const [old] = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(old).toHaveTextContent('v4')
  })
})
