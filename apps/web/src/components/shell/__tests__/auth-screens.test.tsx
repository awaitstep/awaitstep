import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AuthCard, FactList } from '../../ui/auth-card'
import { AuthLayout } from '../auth-layout'
import { AUTH_FOOTER_LINKS } from './fixtures/auth'

describe('AuthLayout and AuthCard', () => {
  it('has one main landmark, one h1 and the footer links', () => {
    render(
      <AuthLayout footerLinks={AUTH_FOOTER_LINKS}>
        <AuthCard
          width="md"
          eyebrow="Ama Mensah invited you to"
          title="Join Acme Inc"
          actions={<button>Accept and open Sales</button>}
        />
      </AuthLayout>,
    )
    const main = screen.getByRole('main')
    expect(within(main).getByRole('region', { name: 'Join Acme Inc' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Ama Mensah invited you to')).toBeInTheDocument()
    for (const link of AUTH_FOOTER_LINKS) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href)
    }
  })
})

describe('FactList', () => {
  it('is a list with one item per fact', () => {
    render(
      <FactList
        items={[
          {
            key: 'workspace',
            leading: <span />,
            label: 'Workspace',
            value: 'Sales',
            sub: 'in Project 101',
          },
          {
            key: 'account',
            leading: <span />,
            label: 'Signed in as',
            value: 'daniel@acme.test',
            trailing: <a href="/sign-in">Not you?</a>,
          },
        ]}
      />,
    )
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('WorkspaceSalesin Project 101')
    expect(within(items[1]).getByRole('link', { name: 'Not you?' })).toBeInTheDocument()
  })
})
