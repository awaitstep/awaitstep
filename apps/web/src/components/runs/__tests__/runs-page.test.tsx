import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  installFakeApi,
  renderWithDashboardApi,
  reply,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { workspaceRuns } from '../../../__tests__/fixtures/api/runs'
import { RunsPage } from '../runs-page'

const download = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/download-file', () => ({ downloadTextFile: download }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => {
  download.mockReset()
})

function renderPage(api: FakeApi = installFakeApi()) {
  renderWithDashboardApi(<RunsPage slugs={sales} />, { api })
  return api
}

/** Pages of 4, so the seed's runs make a few. */
function smallPages(): FakeApi {
  const api = installFakeApi()
  api.on('GET /runs', (req) => workspaceRuns(api.data.seed, 'ws_sales', { ...req.query, limit: 4 }))
  return api
}

const table = () => screen.getByRole('table', { name: 'Runs in Sales' })
const bodyRows = () => within(table()).getAllByRole('row').slice(1)

describe('Runs page', () => {
  it('leaves a function’s request id unlinked: it has no run page', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Runs in Sales' })
    const request = bodyRows().find((row) => row.textContent?.includes('req_31c9'))!
    expect(within(request).queryByRole('link', { name: 'req_31c9' })).not.toBeInTheDocument()
  })

  it('narrows by result and by search', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Runs in Sales' })
    await userEvent.click(screen.getByRole('button', { name: /^Running/ }))
    await waitFor(() => expect(bodyRows()).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /^All/ }))
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search by workflow or run ID' }),
      'run_8f2c',
    )
    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(bodyRows()[0]).toHaveTextContent('run_8f2c')
  })

  it('pages Older and back Newer', async () => {
    renderPage(smallPages())
    await screen.findByRole('table', { name: 'Runs in Sales' })
    const pager = screen.getByRole('navigation', { name: 'Runs pages' })
    expect(within(pager).getByRole('button', { name: 'Newer' })).toBeDisabled()
    await userEvent.click(within(pager).getByRole('button', { name: 'Older' }))
    await waitFor(() => expect(bodyRows()[0]).not.toHaveTextContent('run_8f2c'))
    expect(within(pager).getByRole('button', { name: 'Newer' })).toBeEnabled()
    await userEvent.click(within(pager).getByRole('button', { name: 'Newer' }))
    await waitFor(() => expect(bodyRows()[0]).toHaveTextContent('run_8f2c'))
  })

  it('ignores a second Older while the first page is still loading', async () => {
    renderPage(smallPages())
    await screen.findByRole('table', { name: 'Runs in Sales' })
    const pager = screen.getByRole('navigation', { name: 'Runs pages' })
    await userEvent.dblClick(within(pager).getByRole('button', { name: 'Older' }))
    await waitFor(() => expect(within(pager).getByRole('button', { name: 'Newer' })).toBeEnabled())
    await userEvent.click(within(pager).getByRole('button', { name: 'Newer' }))
    // One Newer is back on the first page: the stack held one cursor, not two.
    await waitFor(() => expect(bodyRows()[0]).toHaveTextContent('run_8f2c'))
    expect(within(pager).getByRole('button', { name: 'Newer' })).toBeDisabled()
  })

  it('says so when the export fails, instead of failing silently', async () => {
    download.mockImplementation(() => {
      throw new Error('blocked')
    })
    renderPage()
    await screen.findByRole('table', { name: 'Runs in Sales' })
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    await userEvent.click(within(topBar).getByRole('button', { name: 'Export' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The export didn’t finish')
    expect(within(topBar).getByRole('button', { name: 'Export' })).toBeEnabled()
  })

  it('exports the filtered runs as CSV', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Runs in Sales' })
    await userEvent.click(screen.getByRole('button', { name: /^Failed/ }))
    await waitFor(() =>
      expect(bodyRows().every((row) => row.textContent?.includes('Failed'))).toBe(true),
    )
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    await userEvent.click(within(topBar).getByRole('button', { name: 'Export' }))
    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    const [name, csv, type] = download.mock.calls[0]!
    expect(name).toMatch(/^sales-runs-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(type).toBe('text/csv')
    const lines = (csv as string).trim().split('\n').slice(1)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((line) => line.startsWith('Failed,'))).toBe(true)
  })

  it('shows the load error under ?mock=error', async () => {
    const api = installFakeApi()
    api.on('GET /runs', reply(503, { error: 'Unavailable' }))
    renderPage(api)
    expect(await screen.findByRole('heading', { name: 'We couldn’t load runs' })).toBeVisible()
  })

  it('puts the search first in the toolbar, before the result filter and the period', async () => {
    renderPage()
    const search = await screen.findByRole('searchbox', { name: 'Search by workflow or run ID' })
    const result = screen.getByRole('group', { name: 'Result' })
    expect(search.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
