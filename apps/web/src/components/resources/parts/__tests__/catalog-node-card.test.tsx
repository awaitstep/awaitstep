import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogNodeCard } from '../catalog-node-card'
import { ACME_CRM, ANTHROPIC, RESEND, SLACK } from './fixtures/nodes'

describe('CatalogNodeCard', () => {
  it('is an article named by the node, with its version, source and usage', () => {
    render(<CatalogNodeCard node={SLACK} orgName="Acme Inc" />)
    const card = screen.getByRole('article', { name: 'Slack' })
    expect(card).toHaveTextContent('Messaging · v2.3.0')
    expect(card).toHaveTextContent('Marketplace')
    expect(card).toHaveTextContent('Used in 6 workflows')
    expect(screen.getByText('Update available')).toBeVisible()
  })

  it('reports an uninstall for an installed marketplace node', async () => {
    const onUninstall = vi.fn()
    render(<CatalogNodeCard node={RESEND} orgName="Acme Inc" onUninstall={onUninstall} />)
    expect(screen.getByText('Not used yet')).toBeVisible()
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    expect(onUninstall).toHaveBeenCalledWith('resend')
  })

  it('offers no uninstall for a custom node and names its author', () => {
    render(<CatalogNodeCard node={ACME_CRM} orgName="Acme Inc" onUninstall={vi.fn()} />)
    expect(screen.getByText('Data · v4 · by Tom Becker')).toBeVisible()
    expect(screen.getByText('Custom')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('names the install for the whole org', async () => {
    const onInstall = vi.fn()
    render(<CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" onInstall={onInstall} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Install Anthropic for every project in Acme Inc' }),
    )
    expect(onInstall).toHaveBeenCalledWith('anthropic')
  })

  it('disables its button while busy', () => {
    render(<CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" onInstall={vi.fn()} busy />)
    const button = screen.getByRole('button', { name: /Install Anthropic/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('CatalogNodeCard updates and read-only', () => {
  it('reports an update to the latest version and says when workflows move', async () => {
    const onUpdate = vi.fn()
    render(<CatalogNodeCard node={SLACK} orgName="Acme Inc" onUpdate={onUpdate} />)
    expect(screen.getByText(/v2.4.0 is out/)).toHaveTextContent(
      'v2.4.0 is out. Update to move workflows to it when they’re next deployed.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Update Slack to v2.4.0' }))
    expect(onUpdate).toHaveBeenCalledWith('slack')
  })

  it('shows no actions without handlers, for people who can’t change the org', () => {
    render(<CatalogNodeCard node={SLACK} orgName="Acme Inc" />)
    render(<CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // Nothing they could do: the note says only that a version is out.
    expect(screen.getByText(/v2.4.0 is out/)).toHaveTextContent(/^v2.4.0 is out.$/)
  })

  it('waits while another node’s change is in flight, without its own spinner', () => {
    render(
      <CatalogNodeCard
        node={SLACK}
        orgName="Acme Inc"
        onUpdate={vi.fn()}
        onUninstall={vi.fn()}
        disabled
      />,
    )
    render(<CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" onInstall={vi.fn()} disabled />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      expect(button).not.toHaveAttribute('aria-busy')
    }
  })

  it('shows the registry logo first, and the name’s initials without one or when it fails', () => {
    const icon = 'https://registry.test/nodes/slack/icon.svg'
    const { container, unmount } = render(
      <CatalogNodeCard node={{ ...SLACK, icon }} orgName="Acme Inc" />,
    )
    const logo = container.querySelector('img')
    expect(logo).toHaveAttribute('src', icon)
    expect(logo).toHaveAttribute('alt', '')
    fireEvent.error(logo!)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('SL')
    unmount()

    const custom = render(<CatalogNodeCard node={ACME_CRM} orgName="Acme Inc" />)
    expect(custom.container.querySelector('img')).toBeNull()
    expect(custom.container.querySelector('[aria-hidden="true"]')).toHaveTextContent('AC')
  })
})
