import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { VariablesPage } from '../../project-settings/variables-page'
import type { VariableRequest } from '../variable-requests'
import { WorkspaceSettingsPage } from '../../workspace-settings/workspace-settings-page'

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => resetDashboardData(new Date()))

function renderProject(request: VariableRequest) {
  const onClose = vi.fn()
  renderWithDashboardData(<VariablesPage slugs={p101} request={request} onCloseDialog={onClose} />)
  return onClose
}

const projectVar = (name: string) =>
  dashboardDb().variables.find(
    (v) => v.level === 'project' && v.scopeId === 'prj_101' && v.name === name,
  )

describe('New variable', () => {
  it('adds a secret project variable', async () => {
    const onClose = renderProject({ kind: 'new' })
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'STRIPE_KEY')
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveAccessibleDescription(
      /global\.env\.STRIPE_KEY/,
    )
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Secret' }))
    await userEvent.type(within(dialog).getByLabelText('Value'), 'sk_live_x')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(projectVar('STRIPE_KEY')).toMatchObject({ value: 'sk_live_x', isSecret: true })
  })

  it('puts a bad or taken name’s error on the name field', async () => {
    renderProject({ kind: 'new' })
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    const name = within(dialog).getByRole('textbox', { name: /Name/ })
    await userEvent.type(name, '9BAD')
    await userEvent.type(within(dialog).getByLabelText('Value'), 'v')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() => expect(name).toHaveAccessibleDescription(/letters, numbers/))
    await userEvent.clear(name)
    await userEvent.type(name, 'SLACK_TOKEN')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() => expect(name).toHaveAccessibleDescription(/Already set in Project 101/))
  })
})

describe('Edit and Override', () => {
  it('keeps a secret when its value is left empty, and deletes after confirming', async () => {
    const onClose = renderProject({ kind: 'variable', name: 'SLACK_TOKEN' })
    const dialog = await screen.findByRole('dialog', { name: 'Edit SLACK_TOKEN' })
    expect(within(dialog).getByLabelText('Value')).toHaveAccessibleDescription(
      'Leave empty to keep the current value.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(projectVar('SLACK_TOKEN')!.value).toBe('xoxb-dummy')
  })

  it('deletes a variable after confirming', async () => {
    renderProject({ kind: 'variable', name: 'CRM_BASE_URL' })
    const dialog = await screen.findByRole('dialog', { name: 'Edit CRM_BASE_URL' })
    expect(within(dialog).getByLabelText('Value')).toHaveValue('https://crm-staging.acme.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete variable' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete variable' }))
    await waitFor(() => expect(projectVar('CRM_BASE_URL')).toBeUndefined())
  })

  it('overrides an org value in the project', async () => {
    renderProject({ kind: 'variable', name: 'REGION' })
    const dialog = await screen.findByRole('dialog', { name: 'Override REGION in Project 101' })
    await userEvent.type(within(dialog).getByLabelText('Value'), 'us')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Override' }))
    await waitFor(() => expect(projectVar('REGION')).toMatchObject({ value: 'us' }))
  })
})

describe('errors that belong to no field', () => {
  it('shows them above the form, not under Value', async () => {
    renderProject({ kind: 'variable', name: 'CRM_BASE_URL' })
    const dialog = await screen.findByRole('dialog', { name: 'Edit CRM_BASE_URL' })
    // Someone else deletes it while the dialog is open.
    dashboardDb().variables = dashboardDb().variables.filter(
      (v) => !(v.name === 'CRM_BASE_URL' && v.scopeId === 'prj_101'),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const alert = await within(dialog).findByText('Not found')
    expect(within(dialog).getByLabelText('Value')).not.toHaveAccessibleDescription('Not found')
    expect(alert).toBeVisible()
  })
})

describe('Edit and Override from workspace settings', () => {
  function renderWorkspace(request: VariableRequest) {
    renderWithDashboardData(
      <WorkspaceSettingsPage
        slugs={{ ...p101, workspace: 'sales' }}
        tab="variables"
        onTabChange={vi.fn()}
        variableRequest={request}
        onCloseDialog={vi.fn()}
      />,
    )
  }

  it('offers Edit on Sales’s own values and Override on inherited ones', async () => {
    renderWorkspace(null as unknown as VariableRequest)
    const table = await screen.findByRole('table', { name: 'Variables in Sales' })
    const row = (name: string) => within(table).getByText(name).closest('tr')!
    expect(within(row('CRM_BASE_URL')).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/settings?tab=variables&variable=CRM_BASE_URL',
    )
    expect(within(row('REGION')).getByRole('link', { name: 'Override' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/settings?tab=variables&variable=REGION',
    )
  })

  it('overrides an org value for Sales only', async () => {
    renderWorkspace({ kind: 'variable', name: 'REGION' })
    const dialog = await screen.findByRole('dialog', { name: /Override REGION in Sales/ })
    await userEvent.type(within(dialog).getByLabelText('Value'), 'us')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Override' }))
    await waitFor(() =>
      expect(
        dashboardDb().variables.find((v) => v.name === 'REGION' && v.scopeId === 'ws_sales'),
      ).toMatchObject({ value: 'us', level: 'workspace' }),
    )
  })
})

describe('New variable from workspace settings', () => {
  it('sets it on the workspace with no level to choose', async () => {
    renderWithDashboardData(
      <WorkspaceSettingsPage
        slugs={{ ...p101, workspace: 'sales' }}
        tab="variables"
        onTabChange={vi.fn()}
        variableRequest={{ kind: 'new' }}
        onCloseDialog={vi.fn()}
      />,
    )
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'LEAD_SOURCE')
    expect(within(dialog).queryByRole('combobox', { name: /Applies to/ })).toBeNull()
    await userEvent.type(within(dialog).getByLabelText('Value'), 'web')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() =>
      expect(dashboardDb().variables.find((v) => v.name === 'LEAD_SOURCE')).toMatchObject({
        level: 'workspace',
        scopeId: 'ws_sales',
      }),
    )
  })
})
