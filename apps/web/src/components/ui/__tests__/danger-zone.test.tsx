import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Trash2 } from 'lucide-react'
import { BlockedAction } from '../blocked-action'
import { Button } from '../button'
import { DangerRow, DangerZone } from '../danger-zone'
import { LockSwitch } from '../lock-switch'
import { LOCK_SET_BY } from './fixtures/access'

describe('DangerZone', () => {
  it('is a region named by its title holding its rows', () => {
    render(
      <DangerZone>
        <DangerRow
          icon={<Trash2 />}
          title="Delete this project"
          description="Deletes everything."
          action={<Button>Delete project</Button>}
        />
      </DangerZone>,
    )
    const zone = screen.getByRole('region', { name: 'Danger zone' })
    expect(zone).toHaveTextContent('Delete this project')
    expect(zone).toHaveTextContent('Deletes everything.')
  })
})

describe('LockSwitch', () => {
  it('is a switch named "Deletion lock" that says who set it', async () => {
    const onChange = vi.fn()
    render(<LockSwitch locked onChange={onChange} description="On." setBy={LOCK_SET_BY} />)
    const toggle = screen.getByRole('switch', { name: 'Deletion lock' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('On. Set by Ama Mensah, 12 Oct.')).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('leaves out who set it while off', () => {
    render(<LockSwitch locked={false} onChange={vi.fn()} description="Off." setBy={LOCK_SET_BY} />)
    expect(screen.getByRole('switch', { name: 'Deletion lock' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.queryByText(/Set by/)).not.toBeInTheDocument()
  })

  it('links to the parent instead of a switch when inherited', () => {
    render(
      <LockSwitch
        locked
        onChange={vi.fn()}
        description="On, because Project 101 is locked."
        setBy={LOCK_SET_BY}
        inheritedFrom={{ name: 'Project 101', href: '/acme/project-101/settings' }}
      />,
    )
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage in project' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings',
    )
    expect(screen.getByText('From Project 101')).toBeInTheDocument()
    expect(screen.queryByText(/Set by/)).not.toBeInTheDocument()
  })

  it('keeps the switch for people who can’t change it, but ignores them', async () => {
    const onChange = vi.fn()
    render(
      <LockSwitch
        locked
        onChange={onChange}
        description="On."
        disabledReason="Only project admins can change this"
      />,
    )
    const toggle = screen.getByRole('switch', { name: 'Deletion lock' })
    expect(toggle).toHaveAccessibleDescription('Only project admins can change this')
    await userEvent.click(toggle)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('BlockedAction', () => {
  it('keeps a blocked button focusable, ignores it and gives the reason', async () => {
    const onClick = vi.fn()
    render(
      <BlockedAction reason="Turn off the deletion lock first">
        <Button onClick={onClick}>Delete project</Button>
      </BlockedAction>,
    )
    const button = screen.getByRole('button', { name: 'Delete project' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAccessibleDescription('Turn off the deletion lock first')
    await userEvent.click(button)
    await userEvent.keyboard('{Tab}{Shift>}{Tab}{/Shift}')
    expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('lets the action through when nothing blocks it', async () => {
    const onClick = vi.fn()
    render(
      <BlockedAction>
        <Button onClick={onClick}>Delete project</Button>
      </BlockedAction>,
    )
    const button = screen.getByRole('button', { name: 'Delete project' })
    expect(button).not.toHaveAttribute('aria-disabled')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
