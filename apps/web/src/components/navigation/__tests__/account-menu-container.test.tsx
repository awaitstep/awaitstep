import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailAccountButton } from '../../shell/rail-item'
import { DashboardAccountMenu } from '../account-menu-container'

const reset = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const signOut = vi.hoisted(() => vi.fn())

vi.mock('../../../data/dashboard/reset', () => ({
  useResetMockData: () => reset,
}))

vi.mock('../../../lib/auth-client', () => ({
  handleSignOut: signOut,
}))

const AMA = { name: 'Ama Mensah', email: 'ama@acme.test' }

function renderMenu(
  placement: 'rail' | 'phone',
  options: { showReset?: boolean; onToggleTheme?: () => void } = {},
) {
  render(
    <DashboardAccountMenu
      placement={placement}
      trigger={<RailAccountButton user={AMA} />}
      user={AMA}
      org="acme"
      theme="dark"
      onToggleTheme={options.onToggleTheme ?? vi.fn()}
      showReset={options.showReset ?? false}
    />,
  )
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Your account' }))
  return screen.getByRole('menu', { name: 'Your account' })
}

afterEach(() => {
  reset.mockClear()
  signOut.mockClear()
})

describe('DashboardAccountMenu', () => {
  it('links Profile and Sessions to the account pages in this org', async () => {
    renderMenu('rail')
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/acme/account/profile',
    )
    expect(screen.getByRole('menuitem', { name: 'Sessions and sign-in' })).toHaveAttribute(
      'href',
      '/acme/account/sessions',
    )
    expect(screen.getByRole('menuitem', { name: /Keyboard shortcuts/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('keeps the rail’s extra places off the desktop menu', async () => {
    renderMenu('rail')
    const menu = await openMenu()
    expect(within(menu).queryByRole('menuitem', { name: 'What’s new' })).not.toBeInTheDocument()
  })

  it('carries What’s new, API, Docs and the theme on a phone', async () => {
    const onToggleTheme = vi.fn()
    renderMenu('phone', { onToggleTheme })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'What’s new' })).toHaveAttribute(
      'href',
      '/acme/whats-new',
    )
    expect(screen.getByRole('menuitem', { name: 'API' })).toHaveAttribute('href', '/api-playground')
    expect(screen.getByRole('menuitem', { name: 'Docs' })).toHaveAttribute('target', '_blank')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Light mode' }))
    expect(onToggleTheme).toHaveBeenCalled()
  })

  it('signs out for real', async () => {
    renderMenu('rail')
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('resets the dummy data only after confirming, and only where it’s offered', async () => {
    renderMenu('rail', { showReset: true })
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset dummy data' }))
    expect(reset).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(reset).toHaveBeenCalled()
  })

  it('has no reset item when it isn’t offered', async () => {
    renderMenu('rail', { showReset: false })
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Reset dummy data' })).not.toBeInTheDocument()
  })
})
