import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkTabs } from '../link-tabs'

describe('LinkTabs', () => {
  it('is a labelled nav of links, the open one marked as the current page', () => {
    render(
      <LinkTabs
        label="Account sections"
        activeKey="sessions"
        tabs={[
          { key: 'profile', label: 'Profile', href: '/acme/account/profile' },
          { key: 'sessions', label: 'Sessions and sign-in', href: '/acme/account/sessions' },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Account sections' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Sessions and sign-in' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // Keyboard focus shows, as on the kit's other tabs.
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveClass('focus-visible:ring-2')
  })
})
