import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  asOrgRole,
  installFakeApi,
  renderWithDashboardApi,
  reply,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { AuditLogPage } from '../audit-log-page'

const download = vi.fn()
vi.mock('../../../lib/download-file', () => ({
  downloadTextFile: (...args: unknown[]) => download(...args),
}))

beforeEach(() => {
  download.mockReset()
})

function render(ui: React.ReactElement, api: FakeApi = installFakeApi()) {
  return { ...renderWithDashboardApi(ui, { api }), api }
}

/** The log's read refused, or kept waiting. */
function withLog(state: 'loading' | 'error'): FakeApi {
  const api = installFakeApi()
  if (state === 'loading') api.hang('GET /audit-events')
  else api.on('GET /audit-events', reply(503, { error: 'Unavailable' }))
  return api
}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })
const list = () => screen.getByRole('list', { name: 'Audit events in Acme Inc' })
const rows = () => within(list()).getAllByRole('listitem')

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('Audit log', () => {
  it('narrows by level and search', async () => {
    render(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Level' })).getByRole('button', {
        name: 'Workspace',
      }),
    )
    await waitFor(() => expect(rows()).toHaveLength(3))
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Level' })).getByRole('button', { name: 'All' }),
    )
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search people, actions, targets' }),
      'deletion lock',
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveTextContent('Ama Mensah turned on the deletion lock for Project 101')
  })

  it('pages the last 90 days with Older and Newer', async () => {
    render(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    await pick(screen.getByRole('combobox', { name: 'Period' }), 'Last 90 days')
    await waitFor(() =>
      expect(
        screen.getByText('Showing 25 of 47 events in the last 90 days · kept for 90 days'),
      ).toBeVisible(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Older' }))
    await waitFor(() => expect(rows()).toHaveLength(22))
    await userEvent.click(screen.getByRole('button', { name: 'Newer' }))
    await waitFor(() => expect(rows()).toHaveLength(25))
  })

  it('says when nothing matches', async () => {
    render(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search people, actions, targets' }),
      'zzz',
    )
    expect(await screen.findByText('No events match “zzz”.')).toBeVisible()
  })

  it('exports the filtered events as CSV', async () => {
    render(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Level' })).getByRole('button', {
        name: 'Organization',
      }),
    )
    await waitFor(() => expect(rows()).toHaveLength(2))
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(download).toHaveBeenCalled())
    const [name, csv, type] = download.mock.calls[0]!
    expect(name).toMatch(/^acme-audit-log-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(type).toBe('text/csv')
    const lines = (csv as string).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('Ama Mensah,invited,sam@acme.test')
  })

  it('shows a member the no-access panel: why, their role, and the owners and admins by name', async () => {
    const api = installFakeApi({ viewer: DANIEL })
    asOrgRole(api, 'acme', 'member')
    render(<AuditLogPage org="acme" />, api)
    const panel = await screen.findByRole('region', { name: 'You can’t see the audit log' })
    expect(panel).toHaveTextContent('kept to owners and admins')
    expect(panel).toHaveTextContent(/You’re an? (Member|Viewer) of Acme Inc/)
    const givers = await within(panel).findByRole('list', { name: 'Who can give you access' })
    const roles = within(givers)
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '')
    expect(roles.length).toBeGreaterThan(0)
    for (const row of roles) expect(row).toMatch(/(Owner|Admin)$/)
    expect(within(panel).getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
    expect(screen.queryByRole('list', { name: /Audit events/ })).not.toBeInTheDocument()
    expect(within(topBar()).queryByRole('button', { name: 'Export CSV' })).toBeNull()
  })

  it('labels the period select', async () => {
    render(<AuditLogPage org="acme" />)
    expect(await screen.findByRole('combobox', { name: 'Period' })).toBeInTheDocument()
  })

  it('shows skeletons while loading, and the error card when it fails', async () => {
    const { unmount } = render(<AuditLogPage org="acme" />, withLog('loading'))
    expect(await screen.findByText('Loading the audit log')).toBeInTheDocument()
    expect(within(topBar()).getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    unmount()
    render(<AuditLogPage org="acme" />, withLog('error'))
    expect(await screen.findByText(/We couldn’t load the audit log/)).toBeVisible()
  })

  it('keeps the filters up when the request fails, so they can be changed', async () => {
    render(<AuditLogPage org="acme" />, withLog('error'))
    await screen.findByText(/We couldn’t load the audit log/)
    expect(screen.getByRole('searchbox', { name: 'Search people, actions, targets' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Level' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Period' })).toBeVisible()
  })

  it('starts afresh in another org: no search, level or page carried over', async () => {
    const { rerender } = render(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search people, actions, targets' }),
      'tom',
    )
    rerender(<AuditLogPage org="bolt-labs" />)
    rerender(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    expect(screen.getByRole('searchbox', { name: 'Search people, actions, targets' })).toHaveValue(
      '',
    )
    expect(rows()).toHaveLength(7)
  })

  it('waits for typing to stop before searching', async () => {
    const { api } = render(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    const before = api.requestsTo('GET /audit-events').length
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search people, actions, targets' }),
      'rotated',
    )
    expect(await screen.findByText('No events match “rotated”.')).toBeVisible()
    expect(api.requestsTo('GET /audit-events').length - before).toBe(1)
    expect(api.lastRequest('GET /audit-events').query).toMatchObject({ search: 'rotated' })
  })
})
