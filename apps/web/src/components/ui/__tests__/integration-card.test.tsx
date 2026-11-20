import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntegrationCard } from '../integration-card'

describe('IntegrationCard', () => {
  it('is a region named by its title, with its line, status and buttons', () => {
    render(
      <IntegrationCard
        logo={<svg aria-hidden="true" />}
        title="Cloudflare"
        description="Where your workflows deploy."
        status="Not set up on this instance"
        actions={<button type="button">Connect account</button>}
      />,
    )
    expect(screen.getByRole('region', { name: 'Cloudflare' })).toBeInTheDocument()
    expect(screen.getByText('Where your workflows deploy.')).toBeInTheDocument()
    expect(screen.getByText('Not set up on this instance')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect account' })).toBeInTheDocument()
  })

  it('draws no status line or button row it was not given', () => {
    const { container } = render(
      <IntegrationCard logo={null} title="Cloudflare" description="Where your workflows deploy." />,
    )
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
