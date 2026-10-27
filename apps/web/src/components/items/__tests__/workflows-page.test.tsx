import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AMA,
  PRIYA,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { FunctionsPage } from '../functions-page'
import { WorkflowsPage } from '../workflows-page'

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const it_ = { ...sales, workspace: 'it' }

beforeEach(() => resetDashboardData(new Date()))

function renderWorkflows(
  options: { userId?: string; scenario?: 'loading' | 'error'; dialog?: string } = {},
  slugs = sales,
) {
  const onCloseDialog = vi.fn()
  const result = renderWithDashboardData(
    <WorkflowsPage slugs={slugs} dialog={options.dialog} onCloseDialog={onCloseDialog} />,
    options,
  )
  return { ...result, onCloseDialog }
}

const desktopList = () => screen.getAllByRole('list', { name: 'Workflows in Sales' })[0]!
const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

describe('Workflows page', () => {
  it('lists Sales’s workflows with the board’s pills, statuses and last runs', async () => {
    renderWorkflows()
    const list = await waitFor(desktopList)
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Lead enrichment',
      'Quote follow-up',
      'Inbound webhook triage',
      'Weekly pipeline report',
    ])
    expect(within(list).getByText('Deployed · v12')).toBeInTheDocument()
    expect(within(list).getByText('Never run')).toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Filter workflows' })
    expect(within(filters).getByRole('button', { name: 'Failing 1' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Drafts 1' })).toBeInTheDocument()
  })

  it('leads each row to the sample-data placeholder, not the editor', async () => {
    renderWorkflows()
    const list = await waitFor(desktopList)
    const link = within(list).getByRole('link', { name: 'Lead enrichment' })
    expect(link.getAttribute('href')).toMatch(/^\/acme\/items\/itm_/)
  })

  it('narrows to the failing workflow', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    await userEvent.click(screen.getByRole('button', { name: 'Failing 1' }))
    expect(
      within(desktopList())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Lead enrichment'])
  })

  it('shows what IT shares, read-only, under "Shared with Sales"', async () => {
    renderWorkflows()
    const heading = await screen.findByRole('heading', { name: 'Shared with Sales' })
    const section = heading.closest('section')!
    expect(within(section).getByText('Provision account')).toBeInTheDocument()
    expect(within(section).getByText('Send Slack alert')).toBeInTheDocument()
    expect(within(section).getAllByText(/from IT/)).toHaveLength(2)
  })

  it('shares a workflow, which then shows as shared with IT', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    const toggle = screen.getByRole('switch', { name: 'Share Quote follow-up with Project 101' })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())

    renderWorkflows({}, it_)
    const heading = await screen.findByRole('heading', { name: 'Shared with IT' })
    expect(within(heading.closest('section')!).getByText('Quote follow-up')).toBeInTheDocument()
  })

  it('won’t unshare Lead enrichment while IT calls it', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    const toggle = screen.getByRole('switch', { name: 'Share Lead enrichment with Project 101' })
    expect(toggle).toHaveAccessibleDescription(/Called by IT/)
  })

  it('New workflow adds an untitled draft at the top and counts it', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    await userEvent.click(within(topBar()).getByRole('button', { name: 'New workflow' }))
    await waitFor(() =>
      expect(within(desktopList()).getAllByRole('link')[0]).toHaveTextContent('Untitled workflow'),
    )
    expect(screen.getByRole('button', { name: 'Drafts 2' })).toBeInTheDocument()
  })

  it('offers Import as a link to ?new=import', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    expect(within(topBar()).getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/workflows?new=import',
    )
  })

  it('imports an exported file as a draft and closes the dialog', async () => {
    const { onCloseDialog } = renderWorkflows({ dialog: 'import' })
    const dialog = await screen.findByRole('dialog', { name: 'Import a workflow' })
    const file = new File(
      [JSON.stringify({ metadata: { name: 'Lead scoring' }, nodes: [] })],
      'x.json',
      {
        type: 'application/json',
      },
    )
    await userEvent.upload(within(dialog).getByLabelText(/Workflow file/), file)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(onCloseDialog).toHaveBeenCalled())
    // The route drops ?new on close; here the dialog stays, so the list sits behind it.
    const list = screen.getAllByRole('list', { name: 'Workflows in Sales', hidden: true })[0]!
    await waitFor(() =>
      expect(within(list).getAllByRole('link', { hidden: true })[0]).toHaveTextContent(
        'Lead scoring',
      ),
    )
  })

  it('says where a function export went, since it isn’t on this list', async () => {
    const { onCloseDialog } = renderWorkflows({ dialog: 'import' })
    const dialog = await screen.findByRole('dialog', { name: 'Import a workflow' })
    const file = new File(
      [JSON.stringify({ kind: 'script', metadata: { name: 'Score lead' }, nodes: [] })],
      'score-lead.ir.json',
      { type: 'application/json' },
    )
    await userEvent.upload(within(dialog).getByLabelText(/Workflow file/), file)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    const status = await within(dialog).findByRole('status')
    expect(status).toHaveTextContent('Score lead is a draft under Functions')
    expect(within(status).getByRole('link', { name: 'Functions' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/functions',
    )
    expect(onCloseDialog).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(onCloseDialog).toHaveBeenCalled()
  })

  it('shows why a file that isn’t an export can’t be imported', async () => {
    renderWorkflows({ dialog: 'import' })
    const dialog = await screen.findByRole('dialog', { name: 'Import a workflow' })
    const file = new File(['not json'], 'notes.json', { type: 'application/json' })
    await userEvent.upload(within(dialog).getByLabelText(/Workflow file/), file)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    expect(await within(dialog).findByText(/isn’t a workflow export/)).toBeInTheDocument()
  })

  it('reads as the board’s skeleton while loading, with New workflow disabled', async () => {
    renderWorkflows({ scenario: 'loading' })
    expect(await screen.findByRole('status')).toHaveTextContent('Loading workflows')
    expect(within(topBar()).getByRole('button', { name: 'New workflow' })).toBeDisabled()
    expect(within(topBar()).queryByRole('link', { name: 'Import' })).not.toBeInTheDocument()
  })

  it('shows the load error with its ID, counts tries, and the reassurance', async () => {
    renderWorkflows({ scenario: 'error' })
    expect(await screen.findByRole('heading', { name: 'We couldn’t load workflows' })).toBeVisible()
    expect(screen.getByText(/^req_/)).toBeInTheDocument()
    expect(screen.getByText(/Your deployed workflows keep running/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /Try again \(1\)/ })).toBeInTheDocument()
    expect(screen.getByText(/Still not answering after 2 tries/)).toBeInTheDocument()
  })
})

describe('Workflows page for a Viewer', () => {
  it('is read-only: Viewer pill, note, disabled switches, no New or Import', async () => {
    renderWorkflows({ userId: PRIYA })
    await waitFor(desktopList)
    expect(within(topBar()).getByText('Viewer')).toBeInTheDocument()
    expect(within(topBar()).queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument()
    expect(within(topBar()).queryByRole('link', { name: 'Import' })).not.toBeInTheDocument()
    expect(screen.getByText(/Read-only in Sales/)).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Share Quote follow-up with Project 101' }),
    ).toHaveAccessibleDescription('Only Editors can share')
  })

  it('asks for edit access once, naming who was asked, and remembers it', async () => {
    const first = renderWorkflows({ userId: PRIYA })
    await waitFor(desktopList)
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Ask for edit access' }))
    expect(await within(topBar()).findByRole('status')).toHaveTextContent('Asked Ama Mensah')
    first.unmount()

    renderWorkflows({ userId: PRIYA })
    expect(await within(topBar()).findByText('Asked Ama Mensah')).toBeInTheDocument()
    expect(
      within(topBar()).queryByRole('button', { name: 'Ask for edit access' }),
    ).not.toBeInTheDocument()
  })
})

describe('Functions page', () => {
  it('lists functions with route, status, traffic and a sharing pill', async () => {
    renderWithDashboardData(<FunctionsPage slugs={sales} />, { userId: AMA })
    const table = await screen.findByRole('table', { name: 'Functions in Sales' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('CRM sync')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('POST /crm/sync · updates leads from the CRM')).toBeVisible()
    expect(within(rows[0]!).getByText('2,140 req · 0.2% errors')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Private')).toBeInTheDocument()
    // WsFunctions draws Pricing webhook as Shared, but WsOverview and ProjectShared
    // count Sales as "1 out" (Lead enrichment); the fixture follows those two.
    expect(within(rows[1]!).getByText('Private')).toBeInTheDocument()
    expect(
      within(rows[0]!).getByRole('img', { name: /Requests over the last 24 hours/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Functions answer requests straight away/)).toBeInTheDocument()
  })

  it('New function adds "Untitled function"', async () => {
    renderWithDashboardData(<FunctionsPage slugs={sales} />)
    await screen.findByRole('table', { name: 'Functions in Sales' })
    await userEvent.click(within(topBar()).getByRole('button', { name: 'New function' }))
    expect(await screen.findByText('Untitled function')).toBeInTheDocument()
  })

  it('gives a Viewer the request instead of New function', async () => {
    renderWithDashboardData(<FunctionsPage slugs={sales} />, { userId: PRIYA })
    await screen.findByRole('table', { name: 'Functions in Sales' })
    expect(within(topBar()).getByRole('button', { name: 'Ask for edit access' })).toBeVisible()
    expect(within(topBar()).queryByRole('button', { name: 'New function' })).not.toBeInTheDocument()
  })
})
