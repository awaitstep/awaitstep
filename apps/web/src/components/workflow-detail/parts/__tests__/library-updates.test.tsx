import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LibraryUpdates } from '../library-updates'

const SCORING = {
  itemId: 'i1',
  name: 'lead-scoring',
  kind: 'module' as const,
  latest: '1.4.2',
  runs: '1.4.1',
  accountId: 'c-prod',
  accountName: 'Acme production',
}
const DIGEST = {
  itemId: 'i2',
  name: 'Sales digest',
  kind: 'node' as const,
  latest: '2.0.0',
  runs: '1.9.0',
  accountId: 'c-stage',
  accountName: 'Acme staging',
}

describe('LibraryUpdates', () => {
  it('says what is published and what the account runs, with Redeploy for a deployer', () => {
    render(
      <LibraryUpdates updates={[SCORING]} redeployHref={(id) => `/deploy?connectionId=${id}`} />,
    )
    expect(
      screen.getByText('lead-scoring 1.4.2 is published. Acme production runs 1.4.1.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Redeploy' })).toHaveAttribute(
      'href',
      '/deploy?connectionId=c-prod',
    )
  })

  it('has one line per item and account', () => {
    render(<LibraryUpdates updates={[SCORING, DIGEST]} redeployHref={() => '/deploy'} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(
      screen.getByText('Sales digest 2.0.0 is published. Acme staging runs 1.9.0.'),
    ).toBeInTheDocument()
  })

  it('offers Redeploy only for accounts a deploy can reach', () => {
    render(
      <LibraryUpdates
        updates={[SCORING, DIGEST]}
        redeployHref={(id) => (id === 'c-stage' ? undefined : '/deploy')}
      />,
    )
    expect(screen.getAllByRole('link', { name: 'Redeploy' })).toHaveLength(1)
  })

  it('offers no Redeploy to someone who can’t deploy', () => {
    render(<LibraryUpdates updates={[SCORING]} />)
    expect(screen.queryByRole('link', { name: 'Redeploy' })).toBeNull()
  })

  it('renders nothing when everything is current', () => {
    const { container } = render(<LibraryUpdates updates={[]} redeployHref={() => '/deploy'} />)
    expect(container).toBeEmptyDOMElement()
  })
})
