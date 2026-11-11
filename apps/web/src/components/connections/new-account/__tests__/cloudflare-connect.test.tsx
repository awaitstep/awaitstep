import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const oauth = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../../../data/dashboard/org-settings', () => ({
  useOAuthStatus: () => ({ data: { enabled: oauth.enabled } }),
}))

import { CloudflareConnect } from '../cloudflare-connect'

const PROJECT = { org: 'acme', project: 'project-101' }

function renderStep(onSubmit = vi.fn(), place: { org: string; project?: string } = PROJECT) {
  render(
    <>
      <CloudflareConnect
        formId="connect"
        place={place}
        pending={false}
        errorOn={() => undefined}
        onSubmit={onSubmit}
        onEdit={vi.fn()}
      />
      <button type="submit" form="connect">
        Connect
      </button>
    </>,
  )
  return onSubmit
}

describe('CloudflareConnect', () => {
  beforeEach(() => {
    oauth.enabled = false
  })

  it('offers Setup with Cloudflare.com first, or the token form', () => {
    oauth.enabled = true
    renderStep()
    const link = screen.getByRole('link', { name: 'Setup with Cloudflare.com' })
    expect(link.getAttribute('href')).toContain('project=project-101')
    expect(screen.getByText('or')).toBeInTheDocument()
    expect(screen.getByLabelText('API token')).toBeInTheDocument()
    // Sign-in comes before the form.
    expect(
      link.compareDocumentPosition(screen.getByLabelText('Name')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('signs in for the organization when no project is named', () => {
    oauth.enabled = true
    renderStep(vi.fn(), { org: 'acme' })
    const href = screen
      .getByRole('link', { name: 'Setup with Cloudflare.com' })
      .getAttribute('href')
    expect(href).toContain('org=acme')
    expect(href).not.toContain('project=')
  })

  it('lists the permissions the API token needs, with a link to make one', () => {
    renderStep()
    const card = screen.getByRole('region', { name: 'Token permissions' })
    expect(card).toHaveTextContent('Account · Workers Scripts · Admin, Edit, Read')
    expect(card).toHaveTextContent('Account · Workers KV Storage · Edit')
    expect(card).toHaveTextContent('Account · Account Settings · Read')
    expect(screen.getByRole('link', { name: /Open Cloudflare API tokens/ })).toHaveAttribute(
      'href',
      'https://dash.cloudflare.com/profile/api-tokens',
    )
  })

  it('shows only the form where sign-in with Cloudflare isn’t set up', () => {
    renderStep()
    expect(screen.queryByRole('link', { name: 'Setup with Cloudflare.com' })).toBeNull()
    expect(screen.queryByText('or')).toBeNull()
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
  })

  it('hands the dialog the account’s details', async () => {
    const onSubmit = renderStep()
    await userEvent.type(screen.getByLabelText('Name'), 'Edge')
    await userEvent.type(screen.getByLabelText('Account ID'), 'a'.repeat(32))
    await userEvent.type(screen.getByLabelText('API token'), 'cf-token')
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Edge',
      accountId: 'a'.repeat(32),
      token: 'cf-token',
    })
  })
})
