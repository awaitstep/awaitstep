import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { KeysPage } from '../keys-page'
import { VariablesPage } from '../variables-page'

const p101 = { org: 'acme', project: 'project-101' }
function noop() {}

beforeEach(() => {
  resetDashboardData(new Date())
  localStorage.clear()
})

const rowWith = (text: string) => screen.getByText(text).closest('tr') as HTMLElement
const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

describe('project API keys', () => {
  it('reads as KeysPage: level cards, the project keys, workspace key counts', async () => {
    renderWithDashboardData(<KeysPage slugs={p101} createOpen={false} onCloseCreate={noop} />)
    await screen.findByText('CI deploys')
    const levels = screen.getByRole('list', { name: 'Key levels' })
    const here = within(levels)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current'))
    expect(here).toHaveTextContent('Project keys')
    expect(within(levels).getByRole('link', { name: 'Org keys →' })).toHaveAttribute(
      'href',
      '/acme/settings/api-keys',
    )
    expect(rowWith('CI deploys')).toHaveTextContent('ask_p1…a71d')
    expect(rowWith('CI deploys')).toHaveTextContent('Workflows & functions: read · deploy')
    expect(rowWith('CI deploys')).toHaveTextContent('Never')
    expect(within(rowWith('Read-only dashboard')).getByText('In 3 days')).toHaveClass(
      'text-status-warning',
    )
    expect(rowWith('Read-only dashboard')).toHaveTextContent('+4')
    expect(screen.getByRole('link', { name: 'IT · 2' })).toHaveAttribute(
      'href',
      '/acme/project-101/it/settings?tab=keys',
    )
    expect(within(topBar()).getByRole('link', { name: 'New API key' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings/api-keys?new=key',
    )
  })

  it('revokes after the board’s warning, and keeps the key on Keep key', async () => {
    renderWithDashboardData(<KeysPage slugs={p101} createOpen={false} onCloseCreate={noop} />)
    await screen.findByText('CI deploys')
    await userEvent.click(within(rowWith('CI deploys')).getByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke CI deploys?' })
    expect(dialog).toHaveTextContent(
      'Anything using ask_p1…a71d stops working immediately (last used: 22m ago). Keys it minted stop too.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep key' }))
    expect(screen.getByText('CI deploys')).toBeVisible()

    await userEvent.click(within(rowWith('CI deploys')).getByRole('button', { name: 'Revoke' }))
    await userEvent.click(screen.getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(screen.queryByText('CI deploys')).not.toBeInTheDocument())
    expect(screen.getByText('2 active')).toBeVisible()
  })

  it('lists keys read-only for someone who isn’t a project admin', async () => {
    renderWithDashboardData(<KeysPage slugs={p101} createOpen={false} onCloseCreate={noop} />, {
      userId: DANIEL,
    })
    await screen.findByText('CI deploys')
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New API key' })).not.toBeInTheDocument()
  })
})

describe('project Variables', () => {
  it('reads as ProjectVariables: secrets hidden, where each is set, overrides and actions', async () => {
    renderWithDashboardData(<VariablesPage slugs={p101} request={null} onCloseDialog={noop} />)
    await screen.findByText('SLACK_TOKEN')
    const slack = rowWith('SLACK_TOKEN')
    expect(within(slack).getByLabelText('Hidden secret value')).toHaveTextContent('••••••••')
    expect(slack).toHaveTextContent('Project 101')
    expect(slack).toHaveTextContent('Secret')
    expect(within(slack).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings/variables?variable=SLACK_TOKEN',
    )
    expect(
      within(rowWith('CRM_BASE_URL')).getByRole('link', { name: 'Overridden in Sales' }),
    ).toHaveAttribute('href', '/acme/project-101/sales/settings?tab=variables')
    const region = rowWith('REGION')
    expect(region).toHaveTextContent('Acme Inc')
    expect(region).toHaveTextContent('From the org')
    expect(within(region).getByRole('link', { name: 'Override' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings/variables?variable=REGION',
    )
    expect(within(topBar()).getByRole('link', { name: 'New variable' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings/variables?new=variable',
    )
  })

  it('shows the values without actions to a project member', async () => {
    renderWithDashboardData(<VariablesPage slugs={p101} request={null} onCloseDialog={noop} />, {
      userId: DANIEL,
    })
    await screen.findByText('SLACK_TOKEN')
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New variable' })).not.toBeInTheDocument()
  })
})
