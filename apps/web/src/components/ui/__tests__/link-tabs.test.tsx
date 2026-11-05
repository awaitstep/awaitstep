import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkTabs } from '../link-tabs'

describe('LinkTabs', () => {
  it('shows a count in a pill beside its label, and none where it has none', () => {
    render(
      <LinkTabs
        label="Workflow pages"
        activeKey="overview"
        tabs={[
          { key: 'overview', label: 'Overview', href: '/o' },
          { key: 'runs', label: 'Runs', href: '/r', count: 128 },
          { key: 'deployments', label: 'Deployments', href: '/d', count: 0 },
        ]}
      />,
    )
    const runs = screen.getByRole('link', { name: 'Runs 128' })
    expect(runs.lastElementChild).toHaveTextContent('128')
    expect(runs.lastElementChild).toHaveClass('rounded-full')
    expect(screen.getByRole('link', { name: /Deployments/ }).lastElementChild).toHaveTextContent(
      '0',
    )
    expect(screen.getByRole('link', { name: 'Overview' }).children).toHaveLength(0)
  })

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
    // No scroll box: the underline's 1px overlap made one scroll vertically.
    expect(screen.getByRole('navigation')).not.toHaveClass('overflow-x-auto')
  })
})
