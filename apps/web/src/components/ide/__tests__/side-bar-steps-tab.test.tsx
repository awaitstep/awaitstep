import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { SideBar } from '../side-bar'
import { SideBarTabs } from '../side-bar-tabs'

vi.mock('../search-panel', () => ({ SearchPanel: () => <SideBarTabs view="search" /> }))

function renderBar() {
  render(
    <SideBar
      explorer={<SideBarTabs view="explorer" />}
      steps={<SideBarTabs view="steps" />}
      files={new Map()}
      onEscape={vi.fn()}
    />,
  )
}

beforeEach(() => useIdeLayoutStore.setState({ sideBarTab: 'explorer' }))

describe('the Steps side bar tab', () => {
  it('is reachable as a third tab and shows its panel', async () => {
    renderBar()
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Steps' }))
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('steps')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Steps' })).toHaveFocus())
    expect(document.getElementById('sidebar-panel-steps')).not.toHaveAttribute('hidden')
    expect(document.getElementById('sidebar-panel-explorer')).toHaveAttribute('hidden')
  })

  it('cycles through all three with the arrow keys, wrapping at either end', async () => {
    renderBar()
    const user = userEvent.setup()
    screen.getByRole('tab', { name: 'Explorer' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('search')
    await user.keyboard('{ArrowRight}')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('steps')
    await user.keyboard('{ArrowRight}')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('explorer')
    await user.keyboard('{ArrowLeft}')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('steps')
  })

  it('wires every tab to a tabpanel', () => {
    renderBar()
    for (const tab of screen.getAllByRole('tab', { hidden: true })) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)
      expect(panel?.getAttribute('role')).toBe('tabpanel')
    }
  })
})

describe('the remembered side bar view', () => {
  const { merge } = useIdeLayoutStore.persist.getOptions()
  const current = useIdeLayoutStore.getState()

  it('keeps Steps across a reload', () => {
    expect(merge!({ sideBarTab: 'steps' }, current).sideBarTab).toBe('steps')
  })

  it('falls back to the Explorer for a view that does not exist', () => {
    expect(merge!({ sideBarTab: 'git' }, current).sideBarTab).toBe('explorer')
  })
})
