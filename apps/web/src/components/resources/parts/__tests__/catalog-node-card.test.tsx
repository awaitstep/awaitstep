import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
