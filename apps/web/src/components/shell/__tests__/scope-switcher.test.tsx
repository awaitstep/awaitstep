import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScopeSwitcher } from '../scope-switcher'
import { ORG_ACTIONS, ORG_GROUPS, PROJECT_ACTIONS, PROJECT_GROUPS } from './fixtures/switchers'

function renderProjectSwitcher() {
  const onSelect = vi.fn()
  const onAction = vi.fn()
  render(
    <ScopeSwitcher
      trigger={<button type="button">Project 101</button>}
      label="Switch project"
      searchPlaceholder="Find a project"
      groups={PROJECT_GROUPS}
      currentId="project-101"
      currentLabel="Current project"
      onSelect={onSelect}
      actions={PROJECT_ACTIONS}
      onAction={onAction}
    />,
  )
  return { onSelect, onAction, trigger: screen.getByRole('button', { name: 'Project 101' }) }
}

async function openProjectSwitcher() {
  const result = renderProjectSwitcher()
  await userEvent.click(result.trigger)
  return { ...result, popover: screen.getByRole('dialog', { name: 'Switch project' }) }
}

function optionNames(): string[] {
  return screen.getAllByRole('option').map((option) => option.textContent ?? '')
}

describe('ScopeSwitcher', () => {
  it('announces the popup on its trigger', async () => {
    const { trigger } = renderProjectSwitcher()
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('focuses the search, a combobox named by the switcher that drives the list', async () => {
    await openProjectSwitcher()
    const search = screen.getByRole('combobox', { name: 'Switch project' })
    expect(search).toHaveFocus()
    expect(search).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
  })

  it('marks the current item, ticks it with a label, and starts with it highlighted', async () => {
    await openProjectSwitcher()
    const current = screen.getByRole('option', { name: /Project 101/ })
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current).toHaveAttribute('aria-selected', 'true')
    expect(within(current).getByRole('img', { name: 'Current project' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Marketing Site/ })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('narrows the list to names containing the typed text', async () => {
    await openProjectSwitcher()
    await userEvent.keyboard('mar')
    expect(optionNames()).toEqual([expect.stringContaining('Marketing Site')])
  })

  it('does not fuzzy-match letters scattered across a name', async () => {
    await openProjectSwitcher()
    await userEvent.keyboard('pt')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Nothing matches “pt”')).toBeInTheDocument()
  })

  it('selects with the arrow keys and Enter, then closes', async () => {
    const { onSelect } = await openProjectSwitcher()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('marketing')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects on click', async () => {
    const { onSelect } = await openProjectSwitcher()
    await userEvent.click(screen.getByRole('option', { name: /Internal Tools/ }))
    expect(onSelect).toHaveBeenCalledWith('internal')
  })

  it('runs footer actions by id', async () => {
    const { onAction } = await openProjectSwitcher()
    await userEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(onAction).toHaveBeenCalledWith('new-project')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const { trigger } = await openProjectSwitcher()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps Tab inside the popover', async () => {
    const { popover } = await openProjectSwitcher()
    for (let i = 0; i < 4; i++) {
      await userEvent.tab()
      expect(popover).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('starts with an empty search each time it opens', async () => {
    const { trigger } = await openProjectSwitcher()
    await userEvent.keyboard('mar{Escape}')
    await userEvent.click(trigger)
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })
})

describe('ScopeSwitcher without a search row', () => {
  it('still drives the list from the keyboard', async () => {
    const onSelect = vi.fn()
    render(
      <ScopeSwitcher
        trigger={<button type="button">Acme Inc — switch organization</button>}
        label="Switch organization"
        groups={ORG_GROUPS}
        currentId="acme"
        currentLabel="Current organization"
        onSelect={onSelect}
        actions={ORG_ACTIONS}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /switch organization/ }))
    expect(screen.queryByPlaceholderText(/./)).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Switch organization' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('bolt')
  })
})
