import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AMA,
  PRIYA,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { FunctionsPage } from '../functions-page'
import { WorkflowsPage } from '../workflows-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const it_ = { ...sales, workspace: 'it' }

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
})

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

  it('leads each row to its Overview, under this workspace, on desktop and phone', async () => {
    renderWorkflows()
    const list = await waitFor(desktopList)
    const link = within(list).getByRole('link', { name: 'Lead enrichment' })
    // A row opens the workflow's Overview, as v1's list did.
    expect(link.getAttribute('href')).toMatch(
      /^\/acme\/project-101\/sales\/workflows\/itm_[^/]+\/overview$/,
    )
    // The phone's list, too.
    const phone = screen.getAllByRole('list', { name: 'Workflows in Sales' })[1]!
    expect(
      within(phone)
        .getByRole('link', { name: /Lead enrichment/ })
        .getAttribute('href'),
    ).toBe(link.getAttribute('href'))
  })

  it('leads a shared item to its own workspace, not this one', async () => {
    renderWorkflows()
    const heading = await screen.findByRole('heading', { name: 'Shared with Sales' })
    const links = within(heading.closest('section')!).getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(
        /^\/acme\/project-101\/it\/workflows\/[^/]+\/overview$/,
      )
    }
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
    const toggle = screen.getByRole('switch', { name: 'Shared with Project 101: Quote follow-up' })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())

    renderWorkflows({}, it_)
    const heading = await screen.findByRole('heading', { name: 'Shared with IT' })
    expect(within(heading.closest('section')!).getByText('Quote follow-up')).toBeInTheDocument()
  })

  it('won’t unshare Lead enrichment while IT calls it', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    const toggle = screen.getByRole('switch', { name: 'Shared with Project 101: Lead enrichment' })
    expect(toggle).toHaveAccessibleDescription(/Called by IT/)
  })

  it('New workflow names a draft in its dialog, then opens it on the template picker', async () => {
    renderWorkflows()
    await waitFor(desktopList)
    await userEvent.click(within(topBar()).getByRole('button', { name: 'New workflow' }))
    const dialog = await screen.findByRole('dialog', { name: 'New workflow' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Lead scoring')
    const create = within(dialog).getByRole('button', { name: 'Create workflow' })
    await userEvent.click(create)
    // The dialog stays up until the editor opens, so the list behind it is hidden from roles.
    const list = () => screen.getAllByRole('list', { name: 'Workflows in Sales', hidden: true })[0]!
    await waitFor(() =>
      expect(within(list()).getAllByRole('link', { hidden: true })[0]).toHaveTextContent(
        'Lead scoring',
      ),
    )
    expect(screen.getByRole('button', { name: 'Drafts 2', hidden: true })).toBeInTheDocument()
    const created = within(list()).getAllByRole('link', { hidden: true })[0]!.getAttribute('href')
    // The row opens its Overview; a new one opens straight in its editor.
    expect(created).toMatch(/\/overview$/)
    expect(goTo).toHaveBeenCalledWith(`${created!.replace(/\/overview$/, '')}?template=1`)
    expect(goTo).toHaveBeenCalledTimes(1)
    // Busy until the editor opens: a second click would make a second draft.
    expect(create).toBeDisabled()
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
      screen.getByRole('switch', { name: 'Shared with Project 101: Quote follow-up' }),
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

const functionsList = () => screen.getAllByRole('list', { name: 'Functions in Sales' })[0]!

function renderFunctions(
  options: { userId?: string; scenario?: 'loading' | 'error' } = {},
  slugs = sales,
) {
  return renderWithDashboardData(<FunctionsPage slugs={slugs} />, options)
}

describe('Functions page', () => {
  it('lists functions in the same rows as workflows, with description, status and runs', async () => {
    renderFunctions({ userId: AMA })
    const list = await waitFor(functionsList)
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['CRM sync', 'Pricing webhook'])
    const crm = within(list).getByRole('link', { name: 'CRM sync' })
    expect(crm.getAttribute('href')).toMatch(
      /^\/acme\/project-101\/sales\/workflows\/[^/]+\/overview$/,
    )
    expect(within(list).getByText('Updates leads from the CRM')).toBeVisible()
    expect(within(list).getByText('Deployed · v3')).toBeInTheDocument()
    expect(within(crm.closest('li')!).getByText('Succeeded 31m ago')).toBeVisible()
    expect(
      within(crm.closest('li')!).getByRole('img', { name: 'Last 10 runs: 10 succeeded' }),
    ).toBeInTheDocument()
    expect(
      within(list).getByRole('switch', { name: 'Shared with Project 101: CRM sync' }),
    ).not.toBeChecked()
    const filters = screen.getByRole('group', { name: 'Filter functions' })
    expect(within(filters).getByRole('button', { name: 'All 2' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Deployed 2' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Drafts 0' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Failing 0' })).toBeInTheDocument()
  })

  it('leads each row to its Overview, under this workspace, on desktop and phone', async () => {
    renderFunctions()
    const list = await waitFor(functionsList)
    const link = within(list).getByRole('link', { name: 'CRM sync' })
    const phone = screen.getAllByRole('list', { name: 'Functions in Sales' })[1]!
    expect(
      within(phone)
        .getByRole('link', { name: /CRM sync/ })
        .getAttribute('href'),
    ).toBe(link.getAttribute('href'))
    expect(within(phone).getByText('Succeeded 31m ago')).toBeVisible()
  })

  it('narrows to the draft function', async () => {
    const draft = dashboardDb().items.find((i) => i.name === 'Pricing webhook')!
    draft.status = 'draft'
    draft.version = null
    renderFunctions()
    await waitFor(functionsList)
    await userEvent.click(screen.getByRole('button', { name: 'Drafts 1' }))
    expect(
      within(functionsList())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Pricing webhook'])
  })

  it('counts a function whose last run failed under Failing', async () => {
    dashboardDb().runs.push({
      id: 'run_crm_failed',
      itemId: 'itm_crm_sync',
      result: 'failed',
      trigger: 'http',
      startedAt: new Date().toISOString(),
      durationMs: 12,
      waitingOn: null,
      httpStatus: 500,
      failure: null,
    })
    renderFunctions()
    await waitFor(functionsList)
    await userEvent.click(screen.getByRole('button', { name: 'Failing 1' }))
    expect(
      within(functionsList())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['CRM sync'])
  })

  it('shows what IT shares, read-only, under "Shared with Sales"', async () => {
    renderFunctions()
    const heading = await screen.findByRole('heading', { name: 'Shared with Sales' })
    const section = heading.closest('section')!
    expect(within(section).getByText('Provision account')).toBeInTheDocument()
    expect(within(section).getByText('Send Slack alert')).toBeInTheDocument()
  })

  it('shares a function, which then shows as shared with IT', async () => {
    renderFunctions({ userId: AMA })
    await waitFor(functionsList)
    const toggle = screen.getByRole('switch', { name: 'Shared with Project 101: CRM sync' })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())

    renderFunctions({}, it_)
    const heading = await screen.findByRole('heading', { name: 'Shared with IT' })
    expect(within(heading.closest('section')!).getByText('CRM sync')).toBeInTheDocument()
  })

  it('shows the failed run for a function that has one', async () => {
    dashboardDb().runs.push({
      id: 'run_crm_failed',
      itemId: 'itm_crm_sync',
      result: 'failed',
      trigger: 'http',
      startedAt: new Date().toISOString(),
      durationMs: 12,
      waitingOn: null,
      httpStatus: 500,
      failure: null,
    })
    renderFunctions({ userId: AMA })
    const list = await waitFor(functionsList)
    const row = within(list).getByRole('link', { name: 'CRM sync' }).closest('li')!
    expect(within(row).getByText(/^Failed /)).toHaveClass('text-status-error')
    expect(
      within(row).getByRole('img', { name: 'Last 10 runs: 9 succeeded, 1 failed' }),
    ).toBeInTheDocument()
  })

  it('New function adds the function named in its dialog', async () => {
    renderFunctions()
    await waitFor(functionsList)
    await userEvent.click(within(topBar()).getByRole('button', { name: 'New function' }))
    const dialog = await screen.findByRole('dialog', { name: 'New function' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Pricing hook')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create function' }))
    // The dialog stays up until the editor opens, so the list behind it is hidden from roles.
    const list = () => screen.getAllByRole('list', { name: 'Functions in Sales', hidden: true })[0]!
    await waitFor(() =>
      expect(within(list()).getAllByRole('link', { hidden: true })[0]).toHaveTextContent(
        'Pricing hook',
      ),
    )
    // Templates are workflow-shaped: a function opens straight on its canvas.
    expect(goTo).toHaveBeenCalledWith(
      expect.stringMatching(/^\/acme\/project-101\/sales\/workflows\/[^/?]+$/),
    )
  })

  it('gives a Viewer the request instead of New function, with the share switches locked', async () => {
    renderFunctions({ userId: PRIYA })
    const list = await waitFor(functionsList)
    expect(within(topBar()).getByRole('button', { name: 'Ask for edit access' })).toBeVisible()
    expect(within(topBar()).queryByRole('button', { name: 'New function' })).not.toBeInTheDocument()
    expect(screen.getByText(/Read-only in Sales/)).toBeInTheDocument()
    expect(
      within(list).getByRole('switch', { name: 'Shared with Project 101: CRM sync' }),
    ).toHaveAccessibleDescription('Only Editors can share')
  })

  it('reads as the same skeleton as Workflows while loading, with New function disabled', async () => {
    renderFunctions({ scenario: 'loading' })
    expect(await screen.findByRole('status')).toHaveTextContent('Loading functions')
    expect(within(topBar()).getByRole('button', { name: 'New function' })).toBeDisabled()
  })

  it('shows the load error with its ID and the reassurance', async () => {
    renderFunctions({ scenario: 'error' })
    expect(await screen.findByRole('heading', { name: 'We couldn’t load functions' })).toBeVisible()
    expect(screen.getByText(/^req_/)).toBeInTheDocument()
    expect(screen.getByText(/Your deployed workflows keep running/)).toBeInTheDocument()
  })
})
