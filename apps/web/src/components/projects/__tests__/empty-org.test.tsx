import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useInstanceStore } from '../../../stores/instance-store'
import { EmptyOrg } from '../empty-org'

const ACME = { slug: 'acme', name: 'Acme', initial: 'A' }

beforeEach(() => useInstanceStore.setState({ features: [], disabled: [] }))

describe('EmptyOrg', () => {
  it('offers Connect Cloudflare as step 2 of 3', () => {
    render(<EmptyOrg org={ACME} />)
    expect(screen.getByRole('link', { name: /Connect Cloudflare/ })).toHaveAttribute(
      'href',
      '/acme/connections?new=connection',
    )
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument()
  })

  it('leaves the step out where the instance switches the Connections pages off', () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    render(<EmptyOrg org={ACME} />)
    expect(screen.queryByRole('link', { name: /Connect Cloudflare/ })).not.toBeInTheDocument()
    expect(screen.getByText('0 of 2 done')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Invite your team/ })).toBeInTheDocument()
  })
})
