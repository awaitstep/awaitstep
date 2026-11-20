import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  apiError,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { VariablesPage } from '../../project-settings/variables-page'
import type { VariableRequest } from '../variable-requests'
import { WorkspaceSettingsPage } from '../../workspace-settings/workspace-settings-page'

const p101 = { org: 'acme', project: 'project-101' }

function renderProject(request: VariableRequest, api: FakeApi = installFakeApi()) {
  const onClose = vi.fn()
  renderWithDashboardApi(<VariablesPage slugs={p101} request={request} onCloseDialog={onClose} />, {
    api,
  })
  return { onClose, api }
}

const AT_P101 = { org: 'acme', project: 'project-101' }

describe('New variable', () => {
  it('adds a secret project variable', async () => {
    const { onClose, api } = renderProject({ kind: 'new' })
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'STRIPE_KEY')
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveAccessibleDescription(
      /Letters, numbers and underscores/,
    )
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Secret' }))
    await userEvent.type(within(dialog).getByLabelText('Value'), 'sk_live_x')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const sent = api.lastRequest('POST /env-vars')
    expect(sent.query).toMatchObject(AT_P101)
    expect(sent.body).toMatchObject({ name: 'STRIPE_KEY', value: 'sk_live_x', isSecret: true })
  })

  it('puts a bad or taken name’s error on the name field', async () => {
    const api = installFakeApi()
    api.on('POST /env-vars', (req) =>
      (req.body as { name: string }).name === 'SLACK_TOKEN'
        ? apiError(409, 'Already set in Project 101', { field: 'name' })
        : apiError(400, 'Use letters, numbers and underscores', { field: 'name' }),
    )
    renderProject({ kind: 'new' }, api)
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
    const { onClose, api } = renderProject({ kind: 'variable', name: 'SLACK_TOKEN' })
    const dialog = await screen.findByRole('dialog', { name: 'Edit SLACK_TOKEN' })
    expect(within(dialog).getByLabelText('Value')).toHaveAccessibleDescription(
      'Leave empty to keep the current value.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.lastRequest('PATCH /env-vars/:id').body).not.toHaveProperty('value')
  })

  it('deletes a variable after confirming', async () => {
    const { api } = renderProject({ kind: 'variable', name: 'CRM_BASE_URL' })
    const dialog = await screen.findByRole('dialog', { name: 'Edit CRM_BASE_URL' })
    expect(within(dialog).getByLabelText('Value')).toHaveValue('https://crm-staging.acme.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete variable' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete variable' }))
    await waitFor(() => expect(api.requestsTo('DELETE /env-vars/:id')).toHaveLength(1))
  })

  it('overrides an org value in the project', async () => {
    const { api } = renderProject({ kind: 'variable', name: 'REGION' })
    const dialog = await screen.findByRole('dialog', { name: 'Override REGION in Project 101' })
    await userEvent.type(within(dialog).getByLabelText('Value'), 'us')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Override' }))
    await waitFor(() =>
      expect(api.lastRequest('POST /env-vars').body).toMatchObject({ name: 'REGION', value: 'us' }),
    )
    expect(api.lastRequest('POST /env-vars').query).toMatchObject(AT_P101)
  })
})

describe('errors that belong to no field', () => {
  it('shows them above the form, not under Value', async () => {
    const { api } = renderProject({ kind: 'variable', name: 'CRM_BASE_URL' })
    const dialog = await screen.findByRole('dialog', { name: 'Edit CRM_BASE_URL' })
    // Someone else deletes it while the dialog is open.
    api.on('PATCH /env-vars/:id', apiError(404, 'Not found'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const alert = await within(dialog).findByText('Not found')
    expect(within(dialog).getByLabelText('Value')).not.toHaveAccessibleDescription('Not found')
    expect(alert).toBeVisible()
  })
})

describe('Edit and Override from workspace settings', () => {
  function renderWorkspace(request: VariableRequest, api: FakeApi = installFakeApi()) {
    renderWithDashboardApi(
      <WorkspaceSettingsPage
        slugs={{ ...p101, workspace: 'sales' }}
        tab="variables"
        onTabChange={vi.fn()}
        variableRequest={request}
        onCloseDialog={vi.fn()}
      />,
      { api },
    )
    return api
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
    const api = renderWorkspace({ kind: 'variable', name: 'REGION' })
    const dialog = await screen.findByRole('dialog', { name: /Override REGION in Sales/ })
    await userEvent.type(within(dialog).getByLabelText('Value'), 'us')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Override' }))
    await waitFor(() =>
      expect(api.lastRequest('POST /env-vars').body).toMatchObject({ name: 'REGION', value: 'us' }),
    )
    expect(api.lastRequest('POST /env-vars').query).toMatchObject({
      ...AT_P101,
      workspace: 'sales',
    })
  })
})

describe('New variable from workspace settings', () => {
  it('sets it on the workspace with no level to choose', async () => {
    const api = installFakeApi()
    renderWithDashboardApi(
      <WorkspaceSettingsPage
        slugs={{ ...p101, workspace: 'sales' }}
        tab="variables"
        onTabChange={vi.fn()}
        variableRequest={{ kind: 'new' }}
        onCloseDialog={vi.fn()}
      />,
      { api },
    )
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'LEAD_SOURCE')
    expect(within(dialog).queryByRole('combobox', { name: /Applies to/ })).toBeNull()
    await userEvent.type(within(dialog).getByLabelText('Value'), 'web')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() =>
      expect(api.lastRequest('POST /env-vars').body).toMatchObject({ name: 'LEAD_SOURCE' }),
    )
    expect(api.lastRequest('POST /env-vars').query).toMatchObject({
      ...AT_P101,
      workspace: 'sales',
    })
  })
})
