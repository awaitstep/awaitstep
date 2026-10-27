import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenu, type AccountMenuItem } from '../account-menu'
import { RailAccountButton } from '../rail-item'
import { ACCOUNT_GROUPS, AMA, PHONE_GROUP } from './fixtures/account'

function renderMenu(groups: AccountMenuItem[][] = ACCOUNT_GROUPS) {
  render(<AccountMenu trigger={<RailAccountButton user={AMA} />} user={AMA} groups={groups} />)
  return screen.getByRole('button', { name: 'Your account' })
}

describe('AccountMenu', () => {
  it('opens a menu from the avatar, headed by who you are', async () => {
    const trigger = renderMenu()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Your account' })
    expect(within(menu).getByText('Ama Mensah')).toBeVisible()
    expect(within(menu).getByText('ama@acme.test')).toBeVisible()
    expect(within(menu).getAllByRole('group')).toHaveLength(2)
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
  })

  it('links its link items', async () => {
    await userEvent.click(renderMenu())
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/acme/account/profile',
    )
  })

  it('greys out an item that isn’t ready, with the reason in its name', async () => {
    await userEvent.click(renderMenu())
    const shortcuts = screen.getByRole('menuitem', { name: /Keyboard shortcuts/ })
    expect(shortcuts).toHaveAttribute('aria-disabled', 'true')
    expect(shortcuts).toHaveTextContent('Coming later')
  })

  it('runs an action item and closes', async () => {
    const onSelect = vi.fn()
    const groups = [[{ key: 'sign-out', label: 'Sign out', tone: 'danger' as const, onSelect }]]
    await userEvent.click(renderMenu(groups))
    const signOut = screen.getByRole('menuitem', { name: 'Sign out' })
    expect(signOut).toHaveClass('text-status-error')
    await userEvent.click(signOut)
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens an external item in a new tab', async () => {
    await userEvent.click(renderMenu([PHONE_GROUP]))
    const docs = screen.getByRole('menuitem', { name: 'Docs' })
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noreferrer')
  })

  it('closes on Escape and returns focus to the avatar', async () => {
    const trigger = renderMenu()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
