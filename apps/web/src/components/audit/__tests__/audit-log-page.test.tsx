import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { mockServer } from '../../../mocks/dashboard/server'
import { AuditLogPage } from '../audit-log-page'

const download = vi.fn()
vi.mock('../../../lib/download-file', () => ({
  downloadTextFile: (...args: unknown[]) => download(...args),
}))

beforeEach(() => {
  resetDashboardData(new Date())
  download.mockReset()
})

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })
const list = () => screen.getByRole('list', { name: 'Audit events in Acme Inc' })
const rows = () => within(list()).getAllByRole('listitem')

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('Audit log', () => {
  it('reads as AuditLog: the seven events of the last 7 days with their scope', async () => {
    renderWithDashboardData(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    expect(rows()).toHaveLength(7)
    expect(rows()[0]).toHaveTextContent('Tom Becker tried to delete the workspace IT')
    expect(rows()[0]).toHaveTextContent('Blocked by the deletion lock · 81.2.69.x')
    expect(rows()[0]).toHaveTextContent('Project 101')
    expect(rows()[1]).toHaveTextContent('Project 101 · Sales')
    expect(rows()[4]).toHaveTextContent('Acme Inc')
    expect(
      screen.getByText('Showing 7 of 7 events in the last 7 days · kept for 90 days'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled()
  })

  it('narrows by level and search', async () => {
    renderWithDashboardData(<AuditLogPage org="acme" />)
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
    renderWithDashboardData(<AuditLogPage org="acme" />)
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
    renderWithDashboardData(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search people, actions, targets' }),
      'zzz',
    )
    expect(await screen.findByText('No events match “zzz”.')).toBeVisible()
  })

  it('exports the filtered events as CSV', async () => {
    renderWithDashboardData(<AuditLogPage org="acme" />)
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

  it('tells members only org owners and admins can see it', async () => {
    renderWithDashboardData(<AuditLogPage org="acme" />, { userId: DANIEL })
    expect(
      await screen.findByText('Only org owners and admins can see the audit log.'),
    ).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(within(topBar()).queryByRole('button', { name: 'Export CSV' })).toBeNull()
  })

  it('shows skeletons while loading, and the error card when it fails', async () => {
    const { unmount } = renderWithDashboardData(<AuditLogPage org="acme" />, {
      scenario: 'loading',
    })
    expect(await screen.findByText('Loading the audit log')).toBeInTheDocument()
    expect(within(topBar()).getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    unmount()
    renderWithDashboardData(<AuditLogPage org="acme" />, { scenario: 'error' })
    expect(await screen.findByText(/We couldn’t load the audit log/)).toBeVisible()
  })

  it('keeps the filters up when the request fails, so they can be changed', async () => {
    renderWithDashboardData(<AuditLogPage org="acme" />, { scenario: 'error' })
    await screen.findByText(/We couldn’t load the audit log/)
    expect(screen.getByRole('searchbox', { name: 'Search people, actions, targets' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Level' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Period' })).toBeVisible()
  })

  it('starts afresh in another org: no search, level or page carried over', async () => {
    const { rerender } = renderWithDashboardData(<AuditLogPage org="acme" />)
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
    const list = vi.spyOn(mockServer.audit, 'listAuditEvents')
    renderWithDashboardData(<AuditLogPage org="acme" />)
    await screen.findByRole('list', { name: 'Audit events in Acme Inc' })
    const before = list.mock.calls.length
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search people, actions, targets' }),
      'rotated',
    )
    expect(await screen.findByText('No events match “rotated”.')).toBeVisible()
    expect(list.mock.calls.length - before).toBe(1)
    expect(list.mock.calls.at(-1)![2]).toMatchObject({ search: 'rotated' })
    list.mockRestore()
  })
})
