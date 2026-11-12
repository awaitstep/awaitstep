import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { DataSourceProvider } from '../../../data/dashboard/source'
import { ProjectFileConflictError } from '../../../lib/api-client'
import { LibraryPage } from '../library-page'
import { salesSummary } from './fixtures/library-rows'

const api = vi.hoisted(() => ({
  getSummary: vi.fn(),
  duplicateItem: vi.fn(),
  deleteItem: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
}))
const goTo = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/library-api', () => ({ libraryApi: api }))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const project = { org: 'acme', project: 'project-101' }

function renderPage(place: typeof sales | typeof project = sales) {
  const name = 'workspace' in place ? 'Sales' : 'Project 101'
  return renderWithDashboardData(
    <DataSourceProvider source="api">
      <LibraryPage place={place} placeName={name} projectName="Project 101" />
    </DataSourceProvider>,
  )
}

beforeEach(() => {
  resetDashboardData(new Date())
  api.getSummary.mockResolvedValue(salesSummary())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Library page', () => {
  it('lists own rows with version, draft and used-by, and the project’s read-only', async () => {
    renderPage()
    const own = await screen.findByRole('table', { name: 'Library items in Sales' })
    const lead = within(own).getByText('Lead scoring').closest('tr')!
    expect(lead).toHaveTextContent('v1.4.2')
    expect(lead).toHaveTextContent('3 consumers')
    const quote = within(own).getByText('Quote parser').closest('tr')!
    expect(quote).toHaveTextContent('draft')
    expect(quote).toHaveTextContent('Not used yet')
    expect(within(own).getByText('Lead scoring')).toHaveAttribute(
      'href',
      '/acme/project-101/sales/library/code?item=lead',
    )

    const shared = screen.getByRole('table', { name: 'Library items from Project 101' })
    const addr = within(shared).getByText('Normalise address')
    expect(addr).toHaveAttribute('href', '/acme/project-101/library/code?item=addr')
    expect(within(shared).queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
    expect(
      screen.getByText('Workflows pick up the latest published version on their next deploy.'),
    ).toBeVisible()
    expect(api.getSummary).toHaveBeenCalledTimes(1)
  })

  it('filters both tables by kind, with counts of the own rows', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Library items in Sales' })
    const kind = screen.getByRole('group', { name: 'Kind' })
    expect(within(kind).getByRole('button', { name: /All/ })).toHaveTextContent('3')
    expect(within(kind).getByRole('button', { name: /Modules/ })).toHaveTextContent('2')
    expect(within(kind).getByRole('button', { name: /Nodes/ })).toHaveTextContent('1')
    await userEvent.click(within(kind).getByRole('button', { name: /Nodes/ }))
    expect(screen.queryByText('Lead scoring')).not.toBeInTheDocument()
    expect(screen.getByText('Sales digest')).toBeVisible()
    expect(screen.queryByText('Normalise address')).not.toBeInTheDocument()
  })

  it('shows the empty state with both New buttons, and none for a viewer', async () => {
    const empty = { own: [], fromProject: [], counts: { module: 0, node: 0, marketplace: 0 } }
    api.getSummary.mockResolvedValue(salesSummary(empty))
    const { unmount } = renderPage()
    expect(await screen.findByRole('heading', { name: 'Nothing in Sales yet' })).toBeVisible()
    const card = screen.getByRole('heading', { name: 'Nothing in Sales yet' }).parentElement!
    expect(within(card).getByRole('button', { name: 'New module' })).toBeVisible()
    expect(within(card).getByRole('button', { name: 'New node' })).toBeVisible()
    unmount()

    api.getSummary.mockResolvedValue(
      salesSummary({
        ...empty,
        viewerCan: { create: { allowed: false, reason: 'Changing library items needs an Editor' } },
      }),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Nothing in Sales yet' })
    expect(screen.queryByRole('button', { name: 'New module' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New node' })).not.toBeInTheDocument()
  })

  it('copies a module’s import path; a node has none to copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Lead scoring' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy import path' }))
    expect(writeText).toHaveBeenCalledWith('#modules/lead-scoring')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Sales digest' }))
    expect(await screen.findByRole('menuitem', { name: 'Open in IDE' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Copy import path' })).not.toBeInTheDocument()
  })

  it('shows the API’s refusal when deleting a module something uses, and deletes nothing', async () => {
    api.deleteItem.mockRejectedValue(
      new ProjectFileConflictError('Can’t delete: used by Post to Slack', null),
    )
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Lead scoring' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Lead scoring?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Can’t delete: used by Post to Slack',
    )
    expect(api.deleteItem).toHaveBeenCalledWith('lead')
  })

  it('duplicates under "<name> copy" and opens the copy in the IDE', async () => {
    api.duplicateItem.mockResolvedValue({ id: 'lead-2' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Lead scoring' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate Lead scoring' })
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('Lead scoring copy')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicate' }))
    expect(api.duplicateItem).toHaveBeenCalledWith('lead', { name: 'Lead scoring copy' })
    expect(goTo).toHaveBeenCalledWith('/acme/project-101/sales/library/code?item=lead-2')
  })

  it('creates a module from the top bar and opens it in the IDE', async () => {
    api.createItem.mockResolvedValue({ id: 'new-1' })
    renderPage()
    await screen.findByRole('table', { name: 'Library items in Sales' })
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    await userEvent.click(within(topBar).getByRole('button', { name: 'New module' }))
    const dialog = await screen.findByRole('dialog', { name: 'New module' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Fmt')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(api.createItem).toHaveBeenCalledWith(sales, { kind: 'module', name: 'Fmt' })
    expect(goTo).toHaveBeenCalledWith('/acme/project-101/sales/library/code?item=new-1')
  })

  it('shows the project’s own items and installed marketplace nodes on the project page', async () => {
    api.getSummary.mockResolvedValue(
      salesSummary({
        fromProject: [],
        marketplace: [{ nodeId: 'stripe', name: 'Stripe', version: '4.2.0' }],
      }),
    )
    renderPage(project)
    expect(await screen.findByRole('heading', { name: 'In Project 101' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'From the marketplace' })).toBeVisible()
    const market = screen.getByRole('table', { name: 'Installed marketplace nodes' })
    expect(within(market).getByText('Stripe').closest('tr')).toHaveTextContent('v4.2.0')
    expect(api.getSummary).toHaveBeenCalledWith(project)
  })
})
