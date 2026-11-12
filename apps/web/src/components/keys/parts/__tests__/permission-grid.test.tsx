import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KeyLevel, KeyPermissions } from '../../../../types/dashboard/api-keys'
import { GrantSummary } from '../grant-summary'
import { presetPermissions } from '../key-permissions'
import { PermissionGrid } from '../permission-grid'

function Controlled({
  level,
  initial,
  onChange,
}: {
  level: KeyLevel
  initial: KeyPermissions
  onChange?: (next: KeyPermissions) => void
}) {
  const [value, setValue] = useState(initial)
  function handleChange(next: KeyPermissions) {
    setValue(next)
    onChange?.(next)
  }
  return <PermissionGrid level={level} value={value} onChange={handleChange} />
}

function pressedPreset(): string {
  const group = screen.getByRole('group', { name: 'Preset' })
  const pressed = within(group)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
  expect(pressed).toHaveLength(1)
  return pressed[0]!.textContent ?? ''
}

describe('PermissionGrid', () => {
  it('is a table named Permissions with a column per action', () => {
    render(<PermissionGrid level="workspace" value={{}} onChange={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'Permissions' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent)
    expect(headers).toEqual(['Resource', 'Read', 'Write', 'Delete', 'Deploy', 'Run'])
    expect(within(table).getAllByRole('rowheader')).toHaveLength(4)
  })

  it('has a checkbox only for the cells valid at the level', () => {
    render(<PermissionGrid level="workspace" value={{}} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Workflows & functions: Deploy' })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Runs: Read' })).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: 'Runs: Write' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Variables: Write' })).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: 'Variables: Deploy' })).not.toBeInTheDocument()
    // 5 workflow actions + read on runs + read, write and delete on variables (B4) and on the Library
    expect(screen.getAllByRole('checkbox')).toHaveLength(12)
  })

  it('reports one ticked cell as a change', async () => {
    const onChange = vi.fn()
    render(<PermissionGrid level="workspace" value={{ runs: ['read'] }} onChange={onChange} />)
    expect(screen.getByRole('checkbox', { name: 'Runs: Read' })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Workflows & functions: Run' }))
    expect(onChange).toHaveBeenCalledWith({ workflows: ['run'], runs: ['read'] })
  })

  it('replaces the permissions with a preset when one is pressed', async () => {
    const onChange = vi.fn()
    render(<PermissionGrid level="project" value={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Deploy & run' }))
    expect(onChange).toHaveBeenCalledWith(presetPermissions('project', 'deploy-run'))
  })

  it('presses the preset the ticks match, and Custom when they match none', async () => {
    render(<Controlled level="workspace" initial={presetPermissions('workspace', 'read')} />)
    expect(pressedPreset()).toBe('Read only')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Workflows & functions: Deploy' }))
    expect(pressedPreset()).toBe('Custom')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Workflows & functions: Run' }))
    expect(pressedPreset()).toBe('Deploy & run')
  })

  it('keeps Custom pressed once chosen, without changing the ticks', async () => {
    const onChange = vi.fn()
    render(
      <Controlled
        level="workspace"
        initial={presetPermissions('workspace', 'read')}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(pressedPreset()).toBe('Custom')
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Full access' }))
    expect(pressedPreset()).toBe('Full access')
  })

  it('offers no Deploy & run preset at organization level', () => {
    render(<PermissionGrid level="organization" value={{}} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Deploy & run' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Workflows/ })).not.toBeInTheDocument()
  })

  it('shows the note under the grid', () => {
    render(<PermissionGrid level="workspace" value={{}} onChange={vi.fn()} note="Only Sales." />)
    expect(screen.getByText('Only Sales.')).toBeVisible()
  })
})

describe('GrantSummary', () => {
  it('lists each granted resource with its actions', () => {
    render(<GrantSummary level="project" value={presetPermissions('project', 'deploy-run')} />)
    const items = within(screen.getByRole('list', { name: 'Permissions' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toContain(
      'Workflows & functions: read · deploy · run',
    )
    expect(items).toHaveLength(6)
  })

  it('says Nothing when no permission is granted', () => {
    render(<GrantSummary level="workspace" value={{}} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing')).toBeVisible()
  })
})
