import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PickedScopes } from '../picked-scopes'
import { ScopeMultiPicker } from '../scope-multi-picker'
import type { PickerProject } from '../scope-picks'
import { CLOUDFLARE_PROJECTS, INVITE_PICKS, INVITE_PROJECTS } from './fixtures/scope-picks'

function Controlled({
  initial,
  projects = INVITE_PROJECTS,
  onChange,
}: {
  initial: string[]
  projects?: PickerProject[]
  onChange?: (next: string[]) => void
}) {
  const [value, setValue] = useState(initial)
  function handleChange(next: string[]) {
    setValue(next)
    onChange?.(next)
  }
  return (
    <ScopeMultiPicker
      label="Where they can work"
      projects={projects}
      value={value}
      onChange={handleChange}
      placeholder="Search projects and workspaces"
      addPlaceholder="Add a project or workspace"
    />
  )
}

function combobox() {
  return screen.getByRole('combobox', { name: 'Where they can work' })
}

async function openList() {
  await userEvent.click(combobox())
  return screen.getByRole('listbox', { name: 'Where they can work' })
}

describe('ScopeMultiPicker', () => {
  it('is a combobox that opens a multi-select listbox', async () => {
    render(<Controlled initial={[]} />)
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    const list = await openList()
    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    expect(combobox()).toHaveAttribute('aria-controls', list.id)
    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    expect(within(list).getAllByRole('option')).toHaveLength(4 + 7)
  })

  it('narrows the list as you type', async () => {
    render(<Controlled initial={[]} />)
    await userEvent.type(combobox(), 'sal')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['SalesWorkspace'])
  })

  it('says when nothing matches', async () => {
    render(<Controlled initial={[]} />)
    await userEvent.type(combobox(), 'zzz')
    expect(screen.getByText('Nothing matches “zzz”')).toBeVisible()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('picks with a click, keeps the list open and focus in the input', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[]} onChange={onChange} />)
    await openList()
    await userEvent.click(screen.getByRole('option', { name: /^IT/ }))
    expect(onChange).toHaveBeenLastCalledWith(['ws:p101:it'])
    expect(screen.getByRole('option', { name: /^IT/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('listbox')).toBeVisible()
    expect(combobox()).toHaveFocus()
    expect(combobox()).toHaveAttribute('placeholder', 'Add a project or workspace')
  })

  it('picks the highlighted row with the arrow keys and Enter', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[]} onChange={onChange} />)
    await openList()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    const highlighted = screen.getByRole('option', { name: /^IT/ })
    expect(combobox()).toHaveAttribute('aria-activedescendant', highlighted.id)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['ws:p101:it'])
  })

  it('covers a project’s workspaces once the project is picked', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={['ws:p101:it']} onChange={onChange} />)
    await openList()
    await userEvent.click(screen.getByRole('option', { name: /^Project 101 · every workspace/ }))
    expect(onChange).toHaveBeenLastCalledWith(['p:p101'])
    const sales = screen.getByRole('option', { name: /^Sales/ })
    expect(sales).toHaveAttribute('aria-disabled', 'true')
    expect(sales).toHaveAttribute('aria-selected', 'true')
    expect(sales).toHaveTextContent('Covered by the project')
    await userEvent.click(sales)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('removes a pick from its chip and returns focus to the input', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={['ws:p101:it', 'p:marketing']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Project 101 › IT' }))
    expect(onChange).toHaveBeenLastCalledWith(['p:marketing'])
    expect(combobox()).toHaveFocus()
  })

  it('removes the last pick with Backspace in an empty input', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={['ws:p101:it', 'p:marketing']} onChange={onChange} />)
    await userEvent.click(combobox())
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['ws:p101:it'])
  })

  it('closes on Escape and keeps focus in the input', async () => {
    render(<Controlled initial={[]} />)
    await openList()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(combobox()).toHaveFocus()
  })

  it('offers whole projects only when the projects carry no workspaces', async () => {
    render(<Controlled initial={['p:p101']} projects={CLOUDFLARE_PROJECTS} />)
    const list = await openList()
    expect(within(list).getAllByRole('option')).toHaveLength(6)
    expect(screen.getByRole('option', { name: /^Project 101/ })).toHaveTextContent('3 workspaces')
    expect(screen.getByRole('button', { name: 'Remove Project 101' })).toBeVisible()
  })
})

describe('PickedScopes', () => {
  it('has a role select per pick, named after it', async () => {
    const onRoleChange = vi.fn()
    render(<PickedScopes label="Picked" picks={INVITE_PICKS} onRoleChange={onRoleChange} />)
    expect(
      within(screen.getByRole('list', { name: 'Picked' })).getAllByRole('listitem'),
    ).toHaveLength(2)
    const select = screen.getByRole('combobox', { name: 'Role in Project 101 › IT' })
    expect(select).toHaveTextContent('Editor')
    await userEvent.click(select)
    await userEvent.click(await screen.findByRole('option', { name: 'Viewer' }))
    expect(onRoleChange).toHaveBeenCalledWith('ws:p101:it', 'viewer')
  })

  it('renders nothing without picks', () => {
    const { container } = render(<PickedScopes label="Picked" picks={[]} onRoleChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
